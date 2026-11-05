/**
 * 对流墙系（Wall Flow）—— 以「一道墙」为基础单位的招式底座，后续变种都是它的参数组合。
 *
 * 设计口径（用户 2026-11-05）：
 *   - 释放位置参照**原点**，不读 boss / player 坐标。
 *   - 原点左一列墙、右一列墙，每列多道（道数走参数）。
 *   - 墙无缺口、覆盖玩家可达高度 → 不能跳过，不能硬穿。
 *   - 两列**运动方向相反**，运动方向与墙面法向平行；左右两列在接缝处首尾相接，
 *     **对齐时是一整面无间隙的墙** —— 不能留常驻中央安全带，否则站中间就无敌。
 *   - 只有两列反向滑动、错开的瞬间才出现贯通缝，玩家在原点附近绕圈等窗口横穿。
 *
 * 坐标系是**通用 3D 正交基**，不再把 y 写死成高度：
 *   n = 法向（道沿它排开、运动沿它）、a = 面内第一轴（两列分界 / 墙线）、b = 第二轴（面内铺开）。
 *   基础款 n=+z → a=+x、b=+y（竖直半幅墙，前后推进）；
 *   变体   n=+y → a=+x、b=-z（水平大板，上下推进）—— 同一个生成函数，只是参数组合。
 *
 * `seal` = 用激光封地：把玩家限制在 |x| ≤ seal 的窄带，墙就能同步收窄，
 * 弹数降下来，小弹与帧率可以同时保住（用户方案）。封地激光按世界 x 轴放；
 * 目前两招的 a 轴都是 +x，后续变种若换 a 轴要同步改这里。
 *
 * 单位 = **一道墙**。旋钮全在参数上，不重写招式：
 *   face / move / sign / count / gap / d0 / halfLen / seam / phase / speed /
 *   v0 v1 vStep / mask / seal / r len step / shape / kind / noOut / life。
 *
 * 渲染口径（真 GPU，Intel UHD D3D11，tools/perf.mjs 同口径，目标 11.1ms）：
 *   - box 每颗要投影 8 顶点 + 12 条棱 ≈ 40 次 canvas 调用。细砖 1984 颗 mean 251.68 / p95 2049.4 ms FAIL；
 *     调粗到 512 颗仍 mean 84.6 / p95 11.9 ms FAIL（两次复跑一致，不是抖动）。
 *   - 默认 **ball**。球弹一多同样会打爆 canvas 命令缓冲：变体缩到 r=0.75、铺满 ±18m 时
 *     1864 颗 mean 96 / p95 313 ms FAIL（r=1.0 / 1088 颗仍 FAIL），所以改用封地收窄墙宽。
 *     传 `shape: 'box'` 可切回 3D 砖墙外观，代价是上面的 FAIL。
 */
import { ARENA_R } from '../config';
import { boss, lasers, later } from '../state';
import { addBullet } from '../systems/bullets';
import type { BulletKind, BulletShape, HClass } from '../types';

export interface V3 { x: number; y: number; z: number }

/** laserHits 的判定半宽 = 0.26 + r；把激光中心线外移这么多，可用区才正好是 ±seal */
const SEAL_LASER_R = 0.32;
const SEAL_EDGE = 0.26 + SEAL_LASER_R;
/** 封地激光的高度层：间距 1.2 < 玩家胶囊高 1.24，覆盖站立 + 一段/二段跳 */
const SEAL_HEIGHTS = [0.55, 1.75, 2.95, 4.15];

export interface WallFlowOpt {
  /** 墙面法向（单位向量，可含 y）；基础款 = +z，立起来 = +y */
  face?: V3;
  /** 运动方向；基础款/第一变体都 = face（与朝向平行），变种可独立调 */
  move?: V3;
  /** +1：左列沿 +move、右列沿 -move；-1 整体反过来 */
  sign?: 1 | -1;
  /** 每列道数（单位个数） */
  count?: number;
  /** 排内相邻墙的间距（沿 face 方向），m */
  gap?: number;
  /** 道中心沿法向的偏移，m；0 = 以原点为中心 */
  d0?: number;
  /** 每道墙从接缝往外铺的长度，m；默认铺满场地半径，封地时收窄到 seal */
  halfLen?: number;
  /** 两列接缝处的空隙宽度，m；0 = 首尾相接、对齐时无间隙 */
  seam?: number;
  /** 右列相对左列的初始相位（以 gap 为单位）；0 = 起始对齐，0.5 = 起始最大错开 */
  phase?: number;
  /** 两列各自的速度，m/s（相对速度是它的两倍） */
  speed?: number;
  /** 面内第二轴 b 的铺开范围与步长：基础款 = 高度带，立起来 = 场地纵深 */
  v0?: number;
  v1?: number;
  vStep?: number;
  /** 面内形状：rect = 矩形铺满；disc = 按半径裁半圆 */
  mask?: 'rect' | 'disc';
  /** 封地半宽，m；0 = 不封地。>0 时在 |x| = seal + 0.58 放静态激光，把玩家锁在 ±seal */
  seal?: number;
  /** 弹半径 / box 长轴倍数 / 沿 a 轴的铺弹步长 */
  r?: number;
  len?: number;
  step?: number;
  /** 默认 ball（性能达标）；box = 3D 砖墙外观，但真 GPU 会 FAIL */
  shape?: BulletShape;
  /** 弹来源标记，变体可单独统计 */
  kind?: BulletKind;
  /** 豁免出界清理：立起来的变体有负 y 板，默认会被 y < -1.2 规则吃掉 */
  noOut?: boolean;
  /** 弹寿命：训练场靠场清才重放，这个数和 holdCd 是两套时钟 */
  life?: number;
  /** 无限流：开启后不一次放完 count 道，而是按「墙距 ÷ 速度」持续补墙 */
  stream?: boolean;
  /** 无限流同时在场的道数（默认 6） */
  streamCount?: number;
  /**
   * 无限流的**空间墙距**，m（默认 = gap = 9）。补墙间隔内部按 streamGap / speed 推出，
   * 不再单独给时间旋钮 —— 否则墙距与节奏会打架（v5.5 踩过：档位 0.4s 把墙距压到 1.6m，
   * 比玩家胶囊危险带 2.22m 还窄，物理上无法无伤通过）。
   * 训练场把「间隔」档位映射成 9 / 13.5 / 18m，越调越宽松，永不小于一次性模式的 gap。
   */
  streamGap?: number;
  /** 无限流补墙位置沿法向的中心偏移，m。左右两片的入口是 center ± speed*life/2 */
  streamD0?: number;
}

const DEFAULTS: Required<WallFlowOpt> = {
  face: { x: 0, y: 0, z: 1 },
  move: { x: 0, y: 0, z: 1 },
  sign: 1,
  count: 4,
  // gap 9m × 4 道 = 36m，正好铺满场地纵深；错开周期 gap/(2*speed) = 1.125s，够读一遍。
  gap: 9,
  d0: 0,
  halfLen: ARENA_R,
  seam: 0,
  phase: 0,
  speed: 4,
  // 二段跳脚底最高约 3.0m（jumpVy 9.4/8.6、g=27），判定胶囊上沿约 4.0m。
  // 球心 0.7~4.3m 四行 + 半径 0.5 → 覆盖 0.2~4.8m，跳不过去。
  v0: 0.7,
  v1: 4.3,
  vStep: 1.2,
  mask: 'rect',
  seal: 0,
  // 判定无缝：球半径 0.5 + 玩家 0.13 = 0.63 > 半步长 0.6（余量 0.03，别再缩）。
  // 弹数 = 2 列 × 16 点 × 4 行 × 4 道 = 512 颗（只缩半径、步长不变，弹数不变）。
  r: 0.5,
  len: 2.2,
  step: 1.2,
  shape: 'ball',
  kind: 'wallFlow',
  noOut: false,
  life: 8,
  stream: false,
  streamCount: 6,
  // 墙距默认等于一次性模式的 gap；补墙间隔 = streamGap / speed（内部推导，不再给时间旋钮）
  streamGap: 9,
  streamD0: 0
};

function norm3(v: V3): V3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function cross(a: V3, b: V3): V3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

/**
 * 由法向派生面内正交基。
 *   n 接近竖直时叉积退化，直接取 a=+x（此时 b = n×a = -z）；
 *   否则 a = up×n（n=+z → a=+x），b = n×a（n=+z → b=+y）。
 */
function basis(n: V3): { a: V3; b: V3 } {
  const up: V3 = { x: 0, y: 1, z: 0 };
  const a: V3 = Math.abs(n.y) > 0.9 ? { x: 1, y: 0, z: 0 } : norm3(cross(up, n));
  return { a, b: norm3(cross(n, a)) };
}

/** 与 shots.ts 的 clsOf 同口径：按世界 y 粗分段，只用于统计，不影响颜色 */
function clsOf(h: number): HClass {
  return h < 1.05 ? 'low' : h < 2.05 ? 'mid' : 'high';
}

/** 封地：把 |x| > seal 的**整片外侧区域**用激光铺满，不是只放两条边界线。
 *  只放边界线的话，玩家受击后 0.9s 无敌帧一冲出去就再也挨不到打 = 无敌。
 *  相邻激光间距 0.9m < 判定带 2*(0.26+0.32)=1.16m，保证外侧无缝覆盖。 */
function sealLanes(seal: number, life: number): void {
  const step = 0.9;
  const inner = seal + SEAL_EDGE;
  const outer = ARENA_R + SEAL_EDGE;
  for (const side of [-1, 1]) {
    for (let x = inner; x <= outer + 1e-6; x += step) {
      for (const h of SEAL_HEIGHTS) {
        lasers.push({
          x: side * x, z: 0,
          ang: Math.PI * 0.5,          // 沿 z 贯穿全场，按 x 密排铺成一片
          y: h, spin: 0,               // 不旋转
          warm: 0,                      // 立即生效
          life, r: SEAL_LASER_R, cls: 'mid'
        });
      }
    }
  }
}

export function wallFlow(opt: WallFlowOpt = {}): void {
  const o: Required<WallFlowOpt> = { ...DEFAULTS, ...opt };
  const n = norm3(o.face);
  const m = norm3(o.move);
  const { a, b } = basis(n);
  const discR2 = o.halfLen * o.halfLen;

  boss.flash = 0.5;
  // 无限流时封地激光要一直在；普通模式跟着弹一起到期
  if (o.seal > 0) sealLanes(o.seal, o.stream ? 1e6 : o.life);

  /** 生成一道墙（两列各一片）；左右片可给不同法向位置，无限流靠它补偿各自位移 */
  const emit = (dLeft: number, dRight: number, life: number): void => {
    for (let side = -1; side <= 1; side += 2) {
      const k = -side * o.sign * o.speed;
      const vx = m.x * k, vy = m.y * k, vz = m.z * k;
      const halfSeam = o.seam * 0.5;
      // seam=0 时两列都包含 u=0，接缝处判定连续，没有可钻的中央缝
      const uFrom = side < 0 ? -o.halfLen : halfSeam;
      const uTo = side < 0 ? -halfSeam : o.halfLen;
      const phaseShift = side > 0 ? o.phase * o.gap : 0;
      const dd = (side < 0 ? dLeft : dRight) + phaseShift;
      for (let u = uFrom; u <= uTo + 1e-6; u += o.step) {
        for (let w = o.v0; w <= o.v1 + 1e-6; w += o.vStep) {
          if (o.mask === 'disc' && u * u + w * w > discR2 + 1e-6) continue;
          // 纯原点参照：u 沿 a、w 沿 b、d 沿 n，不加任何 boss/player 偏移
          const px = a.x * u + b.x * w + n.x * dd;
          const py = a.y * u + b.y * w + n.y * dd;
          const pz = a.z * u + b.z * w + n.z * dd;
          addBullet(px, py, pz, vx, vy, vz, o.r, clsOf(py), o.kind, o.shape, o.len,
            { life, noOut: o.noOut });
        }
      }
    }
  };

  if (o.stream) {
    // **空间墙距优先**：必须 ≥ 一次性模式的 gap，否则板间净缝会窄于玩家胶囊危险带
    // 2*(r+0.13)+(1.03-0.57)=2.22m，无限流就成了「物理上无法无伤通过」，没有练习价值。
    // 补墙间隔由墙距反推 T = spacing / speed，所以墙列恒为等间距，节奏不会反过来把它压小。
    const spacing = Math.max(o.gap, o.streamGap);
    const T = spacing / o.speed;
    const life = o.streamCount * T;
    const lead = o.speed * life * 0.5;
    const center = o.d0 + o.streamD0;
    // 入口各偏移半格：预铺后靠中间的两道落在 ±spacing/2（一次性 count=2 就是 ±4.5），
    // **不会有一道正好压在原点** —— 否则玩家开无限流第一帧就站在整面板里，而没开时是安全的。
    const half = spacing * 0.5;
    const leftIn = center - lead - half;
    const rightIn = center + lead + half;
    // 左右两片从相反入口出发，随流动周期性错开 / 拼成整面（招式核心机制保留）。
    // 开局预铺满 streamCount 道（按已存活时间摆位置 + 只给剩余寿命），第一帧即稳定态。
    for (let j = 0; j < o.streamCount; j++) {
      emit(leftIn + spacing * j, rightIn - spacing * j, life - j * T);
    }
    const spawn = (): void => {
      emit(leftIn, rightIn, life);
      later(T, spawn);
    };
    later(T, spawn);
    return;
  }

  for (let i = 0; i < o.count; i++) {
    const d = o.d0 + (i - (o.count - 1) * 0.5) * o.gap;
    emit(d, d, o.life);
  }
}

/**
 * 第一个变体：把招式**立起来** —— 墙法向 y、运动方向与 y 平行。
 *
 * 与基础款共用同一套生成函数，只换参数：
 *   - face / move = +y：墙躺平成水平板，沿 y 一升一降（左列 +y、右列 -y，仍严格反向）。
 *   - `seal: 5`：x=±5.58 放两串静态激光把玩家锁在 |x|≤5；墙的 halfLen 同步收窄到 5，
 *     只铺 10m 宽 × ±18m 纵深的窄带（原先铺满 ±18m 时 1864 颗小球会打穿帧率）。
 *   - 面内第二轴从「4m 高度带」变成「±18m 场地纵深」；球半径/步长 0.75 / 1.5，
 *     判定仍无缝（0.75 + 玩家 0.13 = 0.88 > 半步长 0.75）。
 *   - 2 道板沿 y 排在 -4.5 / 4.5，两列反向滑动都会在 t=1.125s 拼成整面、中间错开出现贯通缝。
 *   - 无限流（第二参数 = **空间墙距 m**，训练场映射自「间隔」档位 9 / 13.5 / 18m）：
 *     墙距恒 ≥ 一次性 gap，补墙间隔 = 墙距 / speed；场上恒定 6 道，
 *     左右片从相反入口出发，寿命中点在原点相遇对齐。
 */
export function wallFlowY(stream = false, streamGap = 9): void {
  const SEAL = 5;
  wallFlow({
    face: { x: 0, y: 1, z: 0 },
    move: { x: 0, y: 1, z: 0 },
    count: 2,
    gap: 9,
    speed: 4,
    halfLen: SEAL,
    v0: -ARENA_R,
    v1: ARENA_R,
    vStep: 1.5,
    step: 1.5,
    r: 0.75,
    mask: 'rect',
    seal: SEAL,
    kind: 'wallFlowY',
    noOut: true,
    stream,
    streamGap
  });
}
