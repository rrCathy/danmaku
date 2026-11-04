/**
 * 晶格系 v5：全空间面心立方晶体。
 *
 * v4 的教训：晶片只盖住半场，玩家跑到晶体外就安全 —— "全空间"三个字不是修辞，
 * 是硬要求：**晶体必须填满整个场地圆柱，玩家从头到尾都在晶体内部**。
 *
 * 结构：FCC 点阵（单位 = A/2 = 2.05m，最近邻 2.9m），填满"场地圆柱 × 高 −2.5~13m"，
 * 约 1000 颗。晶体沿体对角线 (±1,−1,±1)/√3 整体漂移 —— (111) 密排面垂直于运动方向，
 * 一层层扫过玩家高度带（每 1.54s 一层）。
 *
 * 威胁的来源（这一版想清楚了）：点阵的空隙天然可穿，纯靠几何逼不死人 ——
 * 所以**把弹体加大到 r=0.9 的大玉**：密排面网眼的净空收到约 0.64m，
 * "站进网眼并跟着晶体漂移"从随便站变成必须精确执行的走位；
 * ABC 堆垛让每层的网眼错开 1/3 周期 → 每过一层（1.54s）就得重新找位。
 *
 * 渲染：与普通弹同一套语言（光晕/拖线共享），仅三处必要差异：
 * 近相机淡出（2~6m，防糊脸）、辉光限幅 96px、大玉走预渲染贴图 orbSprite
 * （径向渐变球体+暗轮廓+白高光——逐帧拼白核+色环只能是靶环或白泡泡）。
 *
 * 三招：
 *   lattice111   晶格·111   全空间晶体沿体对角线斜着漂，密排面逐层扫过
 *   latticeShear 晶格·滑移  全空间晶体沿对角滑移面裂成两半反向错开 —— 裂缝是通道
 *   latticeWheel 晶轮       六条密排晶列转着外扩（观赏性担当）
 *   latticeSpin  晶格·自旋  全空间晶体钉在原点绕竖直轴匀速自转（原点居中）
 */
import { ARENA_R } from '../config';
import { boss, player, later, bullets, state } from '../state';
import { random } from '../core/random';
import { addBullet } from '../systems/bullets';
import { rainShot } from './shots';
import type { Bullet, BulletShape, LatticeFrame } from '../types';

/** 地层高度：逼跳带 —— 站着会中、跳起安全 */
const LOW = 0.55;
/** 二层高度：单跳陷阱带 —— 站着安全、跳起会中 */
const HIGH = 2.35;
/** 晶体弹的寿命：全空间晶体要陪玩家走完全程 */
const LIFE = 15;
/** FCC 单位（立方胞边长的一半）：最近邻 = unit·√2 ≈ 2.7m */
const UNIT = 1.9;
/** √3：体对角线归一化系数 */
const R3 = Math.sqrt(3);
/** 晶体弹的半径：0.5 —— 大玉路线试过 0.9，实心大球会糊满整屏（泡泡墙），退回小点 */
const ORB_R = 0.5;

/* ============ 难度旋钮（设计纪律：招式留参数和接口） ============
 * 同一招式的难度 = 参数组合，不是重写：
 *   弹数变少 / 点间距拉开（unit 调大）      → 降级
 *   弹数变密 / 点间距缩小（unit 调小）      → 升级
 *   多复制几份全空间下下来（再建一个组帧）  → 升级
 *   空位率（skip）调大 → 通道多 → 降级，反之升级
 * fccSpace 的每个生成参数都带默认值，任何一招都能单独拧。
 * ================================================================ */

/** FCC 生成参数。全部带默认值 = 现有招式零改动 */
interface FCCOpt {
  split?: { tx: number; tz: number; fA: LatticeFrame; fB: LatticeFrame };
  /** 翻滚模式：生成域取绕 z 轴的旋转不变域（绕轴半径 ≤ radius 的圆柱） */
  centered?: boolean;
  /** 晶格常数（难度旋钮：大=稀=易，小=密=难）。默认 UNIT=1.9 */
  unit?: number;
  /** 覆盖半径（水平圆柱 / centered 翻滚半径共用）。默认 ARENA_R+1.5 */
  radius?: number;
  /** 高度带下/上界（非 centered）。默认 -2~10.5 */
  yLo?: number; yHi?: number;
  /** 空位率 0~1（难度旋钮：大=通道多=易）。随机来自种子，同 seed 同图案 */
  skip?: number;
  /** 相变：给面心类点配 BCC 体心目标格点（tgtLx*） */
  phase?: boolean;
}

function newFrame(p: Partial<LatticeFrame>): LatticeFrame {
  return {
    ox: 0, oy: 0, oz: 0,
    vx: 0, vy: 0, vz: 0,
    ang: 0, omega: 0,
    age: 0,
    scale: 1, sv: 0,
    frame: -1,
    ...p
  };
}

/**
 * 新晶格招施放前，把场上旧晶格弹的寿命收短到 0.6s。
 * 两片全空间晶体叠加 = 2000+ 颗，直接打穿帧率 —— 旧晶体平滑退场而不是瞬间消失。
 * FCC 专场（L4 无非 FCC 喘息招）下重叠窗口必须压到最短：0.6s 内旧片死透，
 * 新晶体立刻独占舞台，玩家不会读到两片点阵混在一起。
 */
function retireOldLattice(): void {
  for (const b of bullets) {
    if (b.kind === 'lattice') b.life = Math.min(b.life, 0.6);
  }
}

/* ============ 招式的连接：状态级接管（v5.4） ============
 * 硬切 = retire + 重新生成；叠加 = 两片晶体同场（禁止）。
 * 连接 = 同一批弹继续演化：链首生成一次，链内招只切换组帧上的驱动字段，
 * 不 retire、不 fccSpace、不动 lx/ly/lz —— 所以几何（点距 / 层数 / 位置）天然连续，无需统一参数。
 * 跨族（轴对齐 vs 立式）几何不同，只有同族可接管；训练场保持单招独立，不接管。
 * ======================================================== */

type LatticeFamily = 'axial' | 'upright';

/** 收集场上所有同族组帧，按 oy 排序（立式族 = 层高序） */
function collectFrames(family: LatticeFamily): LatticeFrame[] {
  const seen = new Set<LatticeFrame>();
  for (const b of bullets) {
    if (b.kind === 'lattice' && b.lg && b.lg.family === family) seen.add(b.lg);
  }
  return [...seen].sort((a, b) => a.oy - b.oy);
}

/** 把组帧复位成「静止全空间点阵」基准态：清掉上一棒的全部驱动，保留位置 */
function resetDrive(f: LatticeFrame): void {
  f.vx = 0; f.vy = 0; f.vz = 0;
  f.ang = 0; f.omega = 0;
  f.axis = undefined; f.rot = undefined;
  f.pulseA = undefined; f.pulseW = undefined;
  f.phononA = undefined; f.phononK = undefined; f.phononW = undefined;
  f.dislocV = undefined; f.phaseT = undefined; f.burstAt = undefined;
  f.scale = 1; f.sv = 0; f.scaleCap = undefined;
  f.noHitAt = undefined; f.volley = undefined; f.rainDrop = undefined;
  f.dedupAt = undefined; f.fly = undefined; f.grow = undefined; f.stopAt = undefined;
  f.age = 0;
}

/** 清掉弹上残留的「上一棒」行为字段，避免 dropAt / fireAt / tgtLx* 串味 */
function clearBulletDrive(f: LatticeFrame): void {
  for (const b of bullets) {
    if (b.kind !== 'lattice' || b.lg !== f) continue;
    b.dropAt = undefined; b.drop = undefined;
    b.fireAt = undefined; b.fired = undefined;
    b.tgtLx = undefined; b.tgtLy = undefined; b.tgtLz = undefined;
  }
}

/**
 * 链内接管入口：场上有同族晶体 → 逐帧复位 + configure，返回 true；
 * 没有（训练场单招 / 链首尚未生成 / 上一棒是异族）→ false，调用方走原本的生成路径。
 */
function takeover(
  family: LatticeFamily,
  configure: (f: LatticeFrame, index: number, total: number) => void
): boolean {
  if (state === 'training') return false;
  const frames = collectFrames(family);
  if (!frames.length) return false;
  for (let i = 0; i < frames.length; i++) {
    clearBulletDrive(frames[i]);
    resetDrive(frames[i]);
    configure(frames[i], i, frames.length);
  }
  return true;
}

/** 把一个局部坐标点塞进点阵（extra：齐狙/相变等 per-bullet 字段） */
function put(f: LatticeFrame, lx: number, ly: number, lz: number, extra?: Partial<Bullet>): void {
  const c = Math.cos(f.ang), sn = Math.sin(f.ang), k = f.scale;
  let x: number, y: number, z: number;
  if (f.rot) {
    // 任意 3D 姿态：出生帧就按 rot 摆好，免得第一帧从「未旋转」跳过去
    const m = f.rot;
    x = f.ox + (m[0] * lx + m[1] * ly + m[2] * lz) * k;
    y = f.oy + (m[3] * lx + m[4] * ly + m[5] * lz) * k;
    z = f.oz + (m[6] * lx + m[7] * ly + m[8] * lz) * k;
  } else {
    x = f.ox + (lx * c - lz * sn) * k;
    y = f.oy + ly * k;
    z = f.oz + (lx * sn + lz * c) * k;
  }
  addBullet(x, y, z, 0, 0, 0, ORB_R, ly < 1.2 ? 'low' : 'high', 'lattice', 'ball', undefined,
    { lg: f, lx, ly, lz, life: LIFE, ...extra });
}

/**
 * 全空间 FCC：把整块晶体填进场地。全部参数带默认值（难度旋钮见 FCCOpt）。
 * 非 centered：场地圆柱（radius × yLo~yHi），玩家从头到尾在晶体内部。
 * centered：绕 z 轴的旋转不变域（绕轴半径 ≤ radius 的圆柱、轴向按场地裁）——
 *   刚体翻滚下每个点恒在域内，不会被出界清理吃掉。
 * skip：空位率；phase：面心类点配 BCC 体心目标格点。
 */
function fccSpace(
  f: LatticeFrame,
  opt: FCCOpt = {}
): void {
  const U = opt.unit ?? UNIT;
  const R = opt.radius ?? ARENA_R + 1.5;
  const yLo = opt.yLo ?? -2, yHi = opt.yHi ?? 10.5;
  const n = Math.ceil(19 / U) + 1;
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      for (let k = -n; k <= n; k++) {
        if ((i + j + k) % 2 !== 0) continue;       // FCC：偶宇称
        const px = i * U, py = j * U, pz = k * U;
        if (opt.centered) {
          if (Math.hypot(px, py) > R) continue;    // 绕 z 轴的翻滚半径（不变量）
          if (Math.abs(pz) > R) continue;          // 轴向（z 是翻滚不变量）
        } else {
          if (py < yLo || py > yHi) continue;      // 垂直范围
          if (Math.hypot(px, pz) > R) continue;    // 水平：场地圆柱
        }
        if (opt.skip && random() < opt.skip) continue;   // 空位（种子随机，同 seed 同图案）
        let extra: Partial<Bullet> | undefined;
        if (opt.phase && !(i % 2 === 0 && j % 2 === 0 && k % 2 === 0)) {
          // 面心类点（奇偶混合）→ 最近 BCC 体心：每坐标向原点半格，零坐标取 -0.5
          const h = (v: number) => v === 0 ? -0.5 : -Math.sign(v) * 0.5;
          extra = { tgtLx: px + h(i) * U, tgtLy: py + h(j) * U, tgtLz: pz + h(k) * U };
        }
        if (opt.split) {
          const u = px * opt.split.tx + pz * opt.split.tz;
          if (u >= 0) put(opt.split.fA, px, py, pz, extra);
          else put(opt.split.fB, px, py, pz, extra);
        } else {
          put(f, px, py, pz, extra);
        }
      }
    }
  }
}

/**
 * 立式 FCC：**体对角线 (111) 沿竖直轴**（世界 y），密排面水平、ABC 堆垛层平躺。
 * 与轴对齐 fccSpace 的区别：晶胞"立起来"——密排面水平时才谈得上
 * "A、B、C 层依次落下"（晶雨）和"密排面间滑移"（位错）的物理图像。
 * 几何：层内最近邻 nn = UNIT·√2 ≈ 2.69（水平基 A/B 夹 60°），层间距 h = 2·UNIT/√3 ≈ 2.19，
 * 层 c 的面内偏移 = (c mod 3)·(A+B)/3（ABC 错 1/3 周期）。数密度与轴对齐版相同。
 * opt.dropGap：>0 时按层序给 dropAt（顶层先落，层间隔 dropGap）—— 晶雨用。
 * opt.gap：**点间距旋钮**（层内最近邻与层间距同比缩放，<1 更密更难、>1 更疏更易）。
 */
function fccSpaceUpright(
  f: LatticeFrame,
  opt: { radius?: number; yLo?: number; yHi?: number; dropGap?: number; gap?: number } = {}
): void {
  const R = opt.radius ?? ARENA_R + 1.5;
  const yLo = opt.yLo ?? -2, yHi = opt.yHi ?? 10.5;
  const g = opt.gap ?? 1;
  const nn = UNIT * Math.SQRT2 * g;                 // 层内最近邻（gap 旋钮）
  const h = 2 * UNIT / Math.sqrt(3) * g;            // 层间距（与 nn 同比，保持 FCC 几何）
  const AX = nn, AZ = 0;                            // 层内基 A（水平）
  const BX = nn * 0.5, BZ = nn * 0.866;             // 层内基 B（与 A 夹 60°）
  const cLo = Math.ceil(yLo / h), cHi = Math.floor(yHi / h);
  const cTop = cHi;
  for (let c = cLo; c <= cHi; c++) {
    // ABC：层 c 的面内偏移 = (c mod 3) × (A+B)/3
    const s = ((c % 3) + 3) % 3;
    const ox = s * (AX + BX) / 3, oz = s * (AZ + BZ) / 3;
    const M = Math.ceil(R / nn) + 1;
    for (let m = -M; m <= M; m++) {
      for (let n = -M; n <= M; n++) {
        const px = ox + m * AX + n * BX;
        const pz = oz + m * AZ + n * BZ;
        if (Math.hypot(px, pz) > R) continue;
        const py = c * h;
        const extra: Partial<Bullet> | undefined =
          opt.dropGap ? { dropAt: 1.2 + (cTop - c) * opt.dropGap } : undefined;
        put(f, px, py, pz, extra);
      }
    }
  }
}

/**
 * 晶格·111：全空间 FCC 晶体沿体对角线 (±1,−1,±1)/√3 斜着漂。
 *
 * 读法：(111) 密排面垂直于运动方向，每 1.54s 一层扫过你的高度带；
 * 每层面是一张三角大玉网，网眼净空约 0.64m —— 站进网眼、跟着晶体漂移；
 * ABC 堆垛让下一层的网眼错开 1/3 周期 → 每过一层重新找位。
 * 你的位置属于 A/B/C 哪类，决定哪一层会扫到你。
 */
export function lattice111(): void {
  retireOldLattice();
  const R3 = Math.sqrt(3);
  // 竖直分量向下；水平分量朝玩家所在象限 —— 晶体斜着压向玩家
  const sx = (player.x - boss.x) >= 0 ? 1 : -1;
  const sz = (player.z - boss.z) >= 0 ? 1 : -1;
  const v = 4.6;
  const f = newFrame({
    vx: sx / R3 * v, vy: -1 / R3 * v, vz: sz / R3 * v
  });
  fccSpace(f);
}

/**
 * 晶格·滑移：全空间晶体沿对角滑移面裂成两半，反向错开。
 *
 * 读法：裂缝是一条斜着的通道，随错开越张越宽 —— 两半晶体的点阵彼此错开，
 * 只有裂缝里两半都够不着。钻进裂缝、跟着它走；在外面就要面对整块晶体的点阵。
 */
export function latticeShear(): void {
  // 裂缝面正对玩家（法向 = boss→玩家），两半沿对角方向 ±d 反向错开
  let nx = player.x - boss.x, nz = player.z - boss.z;
  const l = Math.hypot(nx, nz) || 1;
  nx /= l; nz /= l;
  const dl = Math.hypot(nx, 0.9, nz);
  const dx = nx / dl, dy = 0.9 / dl, dz = nz / dl;
  const v = 1.4;                                   // 两半各 1.4 m/s → 裂缝以 2.8 m/s 张开
  const tx = -nz, tz = nx;                         // 裂缝面的切向（分割轴）

  // 链内：不重新生成弹，把空位留下的同一批点阵按切向劈成两组 frame
  const frames = state === 'training' ? [] : collectFrames('axial');
  if (frames.length) {
    for (const f of frames) { clearBulletDrive(f); resetDrive(f); }
    const base = frames[0];
    const fA = newFrame({
      ox: base.ox, oy: base.oy, oz: base.oz, family: 'axial',
      vx: dx * v, vy: dy * v * 0.35, vz: dz * v
    });
    const fB = newFrame({
      ox: base.ox, oy: base.oy, oz: base.oz, family: 'axial',
      vx: -dx * v, vy: -dy * v * 0.35, vz: -dz * v
    });
    for (const b of bullets) {
      if (b.kind !== 'lattice' || !b.lg || b.lg.family !== 'axial') continue;
      b.lg = ((b.lx ?? 0) * tx + (b.lz ?? 0) * tz) >= 0 ? fA : fB;
    }
    return;
  }

  retireOldLattice();
  const fA = newFrame({
    ox: dx * 0.9, oy: 0, oz: dz * 0.9,        // v5.3：释放位参照原点（裂缝法向仍朝玩家）
    vx: dx * v, vy: dy * v * 0.35, vz: dz * v              // 上半微微抬，下半微微沉（断层感）
  });
  const fB = newFrame({
    ox: -dx * 0.9, oy: -0.5, oz: -dz * 0.9,
    vx: -dx * v, vy: -dy * v * 0.35, vz: -dz * v
  });
  fccSpace(fA, { split: { tx, tz, fA, fB } });
}

/**
 * 晶轮：六条密排晶列（FCC 的 <110> 方向）转着往外涨，臂尖顶到场地边缘。
 */
export function latticeWheel(): void {
  retireOldLattice();                  // 休息段：硬切，先清掉 P2 链尾化雨的残留
  const f = newFrame({ ox: 0, oz: 0, omega: 0.8, scale: 1, sv: 0.14 });
  const arms = 6, per = 30, dth = 0.044, g = 1.085;
  for (let a = 0; a < arms; a++) {
    for (let i = 0; i < per; i++) {
      const th = a * (Math.PI * 2 / arms) + i * dth;
      const r = 1.2 * Math.pow(g, i);
      put(f, Math.cos(th) * r, i % 2 === 0 ? LOW : HIGH, Math.sin(th) * r);
    }
  }
}

/**
 * 晶格·自旋：全空间 FCC 晶体钉在场地原点，绕场地内的水平轴（世界 z 轴）匀速翻滚。
 * 坐标本位：这个引擎 y 是高度，场地是 x-z 平面 —— "绕场地内的轴转"就是绕 z 轴。
 *
 * 与 111/滑移/竖轴自转的本质区别：翻滚是在**垂直平面**里转 ——
 * 脚下的点会卷上头顶，头顶的点会卷到脚下，晶体像绕一根穿过场地的横轴做前空翻。
 * 高度域对称（±18m，原点在晶体正中心）：v5.3 把旋转不变域拉到场地直径 ——
 * 圆盘 R=18 管世界 x 与高度 y，轴向 ±18 管世界 z，三者都盖满场地。
 *
 * 读法：晶体是刚体，每个点绕原点做圆周运动（圆周在竖直平面里）。
 * 点的垂直速度 = ω·|x|（x = 点到翻滚轴的水平距离）——离轴越远上下扫得越快；
 * 翻滚轴正上方/正下方（|x|≈0）的点几乎不动，是转轴"钉子"。
 * 原点本身是一颗阵点（转速为零），别站场心。
 * ABC 堆垛照旧，转约两圈（15s）时间到即散。
 */
export function latticeSpin(): void {
  // 链内：同一批轴对齐点阵改成绕水平轴翻滚（边缘点会卷到地下被裁，属可接受的刚体残缺）
  if (takeover('axial', (f) => { f.omega = 1.3; f.axis = 'z'; })) return;
  retireOldLattice();
  const f = newFrame({ ox: 0, oz: 0, omega: 1.3, axis: 'z' });   // 4.8s 一圈（v5.4.3 提速配紧凑轮）
  // v5.3：圆盘 R=18 + 轴向 ±18 = 2713 颗（旧值 10.5 只有 537 颗，场边是空的）
  fccSpace(f, { centered: true, radius: 18 });
}

/* ============ v5.2 批次：缺陷 / 运动学扩展 / 组合技（共 9 招） ============ */

/**
 * 晶格·空位：全空间 FCC 抽掉 30% 阵点，**钉在原点**（v5.4 起为 P3 状态链首，不再漂移压场 ——
 * 漂移版会沉到地下、交棒不可读；完整的漂移扫过读法由休息段的 111 承担）。
 * 空位串成的通道是快速过图的路；链里滑移 / 螺旋 / 相变都从这块漏光晶体续接。
 * 难度旋钮：skip 调小（0.1）逼近窒息感，调大（0.5）就是喘息招。
 */
export function latticeVac(): void {
  // 链内：同一批点阵抽掉 30% 阵点（晶体漏光），速度归零后留下静止全空间给滑移接管
  if (takeover('axial', () => {})) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (b.kind === 'lattice' && b.lg?.family === 'axial' && random() < 0.3) bullets.splice(i, 1);
    }
    return;
  }
  // 链首：静止的漏光全空间 FCC 钉在原点 —— v5.4 起不当「漏光的 111」漂移压场，
  // 改当 P3 状态链首（漂移版会沉到地下，交棒不可读；完整漂移读法由休息段的 111 承担）
  retireOldLattice();
  const f = newFrame({ family: 'axial' });
  fccSpace(f, { skip: 0.3 });
}

/**
 * 晶格·螺旋：全空间 FCC 从场地高处螺旋压下 —— 绕竖直轴旋转 + 整体下沉（螺旋轴）。
 * 点走螺旋线：网眼既在转（跟着圆周走位）又在沉（读层跳/蹲），双层读法。
 * 释放位：原点上方 oy=+5，晶体压过玩家高度带后继续沉到场底。
 * **永远硬切、绝不接管**（用户 2026-11-04 指正）：接管会继承滑移劈出的上下错位晶体，
 * 旋转下沉时错位跟着一起转 —— 排序躲不开，只有自带一整块新晶体才干净。
 * 难度旋钮：omega 调大 = 切向更凶；vy 调大 = 压得更急。
 */
export function latticeScrew(): void {
  retireOldLattice();
  const f = newFrame({ ox: 0, oy: 5, oz: 0, omega: 0.7, vy: -2.2 });
  fccSpace(f);
}

/**
 * 晶格·呼吸：全空间 FCC 钉在原点，整体缩放脉动（0.85↔1.15，周期 2.4s）。
 * 威胁是**时机**而不是走位：网眼净空随脉动在 1.45~1.95m 之间开合，
 * 站进网眼的窗口按节拍开启 —— 读秒决定动没动。
 * 难度旋钮：pulseA 调大 = 开合更猛；pulseW 调大 = 节拍更急。
 */
export function latticeBreath(): void {
  // 链内：接管同一批弹，驱动从「长出」切成「整体脉动」
  if (takeover('axial', (f) => { f.pulseA = 0.15; f.pulseW = 2.6; })) return;
  retireOldLattice();
  const f = newFrame({ ox: 0, oz: 0, pulseA: 0.15, pulseW: 2.6 });
  fccSpace(f);
}

/**
 * 晶格·声子：全空间 FCC 钉在原点，内部跑一列**径向密度波**（纵波）。
 * 每颗弹在自己的格点附近沿径向振荡：u = A·sin(k·ρ − ω·t)。
 * 波前处网眼挤死、波谷处大开 —— 读波的传播方向决定走位时机。
 * 与呼吸的区别：呼吸全场同相，声子有空间相位（墙在走）。
 * 难度旋钮：A 调大 = 挤压更狠；ω 调大 = 波来得更快。
 */
export function latticePhonon(): void {
  // 链内：同一批弹改跑径向密度波
  if (takeover('axial', (f) => { f.phononA = 0.8; f.phononK = 1.14; f.phononW = 2.2; })) return;
  retireOldLattice();
  const f = newFrame({ ox: 0, oz: 0, phononA: 0.8, phononK: 1.14, phononW: 2.2 });
  fccSpace(f);
}

/**
 * 晶格·位错：**立式 FCC**（密排面水平、ABC 堆垛），**往复位错**——锯齿波前沿 x
 * 从 -19 扫到 +19（17.3 m/s，2.2s 一遍），每扫一遍上半（高处）的密排层
 * 沿滑移面错开一个 ABC 偏移 —— 安全缝在两个位置之间**钟摆式跳变**：
 * 每拍都要跟着挪，停下就死。波前本身是一道可见的"错位阶跃"横扫全场。
 * 滑移发生在水平密排层之间 —— 正是真实位错的滑移面。
 * 难度旋钮：dislocV 调大 = 翻转更快更急。
 */
export function latticeDisloc(): void {
  // 链内：接管叠层留下的六层，改成层间往复滑移（上半层判据用 f.oy+ly，见 bullets.ts）
  if (takeover('upright', (f) => { f.dislocV = 17.3; })) return;
  retireOldLattice();
  const f = newFrame({ ox: 0, oz: 0, dislocV: 17.3 });
  fccSpaceUpright(f);
}
/**
 * 晶格·相变：全空间 FCC 钉在原点，1.0s 后 2s 内**重排成 BCC**。
 * 面心类点滑向最近的体心格点（每坐标半格），整格点不动 —— 结构性流动。
 * 迁移期一切网眼失效；定型瞬间的威胁峰值 = 你站的地方是不是新阵点。
 * 难度旋钮：phaseT 调小 = 更快变阵；迁移期 2s 调短 = 更仓促。
 */
export function latticePhase(): void {
  // 链内：同一批点阵重排成 BCC —— 目标格点按局部整数索引补上，顶角类点不动
  if (takeover('axial', (f) => {
    f.phaseT = 0.6;
    const hh = (v: number) => v === 0 ? -0.5 : -Math.sign(v) * 0.5;
    for (const b of bullets) {
      if (b.kind !== 'lattice' || b.lg !== f) continue;
      if (b.lx === undefined || b.ly === undefined || b.lz === undefined) continue;
      const i = Math.round(b.lx / UNIT), j = Math.round(b.ly / UNIT), k = Math.round(b.lz / UNIT);
      if (i % 2 === 0 && j % 2 === 0 && k % 2 === 0) continue;
      b.tgtLx = b.lx + hh(i) * UNIT;
      b.tgtLy = b.ly + hh(j) * UNIT;
      b.tgtLz = b.lz + hh(k) * UNIT;
    }
  })) return;
  retireOldLattice();
  const f = newFrame({ ox: 0, oz: 0, phaseT: 0.6 });
  fccSpace(f, { phase: true });
}

/**
 * 晶格·聚散：全部弹从原点长出（scale 0.03 → 1，约 0.7s），驻留后**解体飞散**。
 * 长出期整片无判定（noHitAt）—— 不然全弹挤在原点就是糊脸秒杀。
 * 8s 后每颗弹脱离组帧沿径向 7 m/s 飞出，3s 后消散。
 * 释放位：原点（晶体生长/解体的对称中心）。
 * 难度旋钮：sv 调大 = 长得快；burstAt 调小 = 驻留短；解体速度 7 调大 = 散弹更凶。
 */
export function latticeBurst(): void {
  retireOldLattice();
  const f = newFrame({ ox: 0, oz: 0, scale: 0.03, sv: 1.35, scaleCap: 1,
    noHitAt: 1, burstAt: 5.5, family: 'axial' });
  // 链首：与整条 P1 链共用 U=1.9；链内接管时 resetDrive 会清掉 burstAt，晶体不解体而是继续演化
  fccSpace(f);
}

/**
 * 晶格·齐狙：稀疏点阵（间距 ×2，约 125 颗）站桩，每颗弹**依次**朝玩家发射。
 * 发射顺序 = 生成序（自下而上、由近及远）—— 一排排点逐个"熄灭"变成自机狙弹。
 * 0.05s 间隔，6.3s 射完；发射后的弹直线飞行 5s。
 * 释放位：原点（晶体中心）。
 * 难度旋钮：unit 调小 = 阵更密弹更多；0.05 调小 = 射得更急；弹速 11 调大 = 更难躲。
 */
export function latticeVolley(): void {
  retireOldLattice();                    // 休息段：硬切，先把链尾（BCC 定型）清掉
  const f = newFrame({ ox: 0, oz: 0, volley: true });
  const U = UNIT * 2;
  const n = Math.ceil(19 / U) + 1;
  let idx = 0;
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      for (let k = -n; k <= n; k++) {
        if ((i + j + k) % 2 !== 0) continue;
        const px = i * U, py = j * U, pz = k * U;
        if (py < -2 || py > 10.5) continue;
        if (Math.hypot(px, pz) > ARENA_R + 1.5) continue;
        addBullet(px, py, pz, 0, 0, 0, ORB_R, py < 1.2 ? 'low' : 'high', 'lattice', 'ball', undefined,
          { lg: f, lx: px, ly: py, lz: pz, life: LIFE, fireAt: 0.3 + idx * 0.05 });
        idx++;
      }
    }
  }
}

/**
 * 晶雨：**立式 FCC**（密排面水平、ABC 堆垛）按层**一层一层化雨落下**。
 * 密排面水平时"层"才是真正的 ABC 层：顶层先落，层间隔 1.1s，每层整体脱离
 * 晶体竖直下落（12 m/s），碰地即散。相邻层落点错 1/3 周期 —— 站着不动必被覆盖。
 * 释放位：原点（晶体中心，先以完整形态压住场地）。
 * 难度旋钮：dropGap 调小 = 落得急；下落速度 12 调大 = 雨更猛；gap 调小 = 点距更密（当前 0.82）。
 */
export function latticeRain(): void {
  // 链内：接管同一批六层，按层序给 dropAt（顶层先落）—— 弹不重新生成，就是叠层那块晶体化雨
  if (takeover('upright', (f, i, total) => {
    f.rainDrop = true;
    for (const b of bullets) if (b.lg === f) b.dropAt = 1.2 + (total - 1 - i) * 0.75;
  })) return;
  retireOldLattice();
  const f = newFrame({ ox: 0, oz: 0, rainDrop: true });
  fccSpaceUpright(f, { dropGap: 0.75, gap: 0.82 });
}

/* ============ v5.3：单位为「晶胞 / 层」的三招 ============
 * 设计观点见 docs/danmaku-unit.md：弹幕有基础单位，且单位随招式不同。
 *   latticeAssemble 单位 = 单个晶胞（8 胞拼 2×2×2，共享点去重 → 63 点）
 *   latticeStack    单位 = 一层（ABC×2 六层横扫进场 → 1266 点）
 *   latticeCone     单位 = 3³ 个晶胞（一点爆出、胞内撑开、(1,1,1) 对准玩家 → 378 点）
 * 全部参数带默认值 = 难度旋钮；新招留 opt 接口，旧招调用零改动。
 * ========================================================= */

const TAU = Math.PI * 2;
type V3 = [number, number, number];
type Mat3 = number[];                        // 3×3 行主序旋转矩阵

function norm3(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross3(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
/** 以 v 为第三基造一组正交基（避开与 v 平行的奇异点） */
function basis(v: V3): [V3, V3, V3] {
  const w = norm3(v);
  const up: V3 = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm3(cross3(up, w));
  return [e1, cross3(w, e1), w];
}
/** 把局部方向 u 旋到世界方向 d，再绕 d 滚 roll —— R = M_world · M_localᵀ */
function rotAlign(u: V3, d: V3, roll = 0): Mat3 {
  const U = basis(u), W = basis(d);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const w1: V3 = [W[0][0] * cr + W[1][0] * sr, W[0][1] * cr + W[1][1] * sr, W[0][2] * cr + W[1][2] * sr];
  const w2: V3 = [-W[0][0] * sr + W[1][0] * cr, -W[0][1] * sr + W[1][1] * cr, -W[0][2] * sr + W[1][2] * cr];
  const Wr: [V3, V3, V3] = [w1, w2, W[2]];
  const m: Mat3 = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += Wr[k][i] * U[k][j];
    m[i * 3 + j] = s;
  }
  return m;
}
/** 随机整体朝向（走种子随机源，同 seed 同图案） */
function randomRot(): Mat3 {
  const a = random() * TAU, y = random() * 2 - 1, s = Math.sqrt(Math.max(0, 1 - y * y));
  return rotAlign([1, 1, 1], [s * Math.cos(a), y, s * Math.sin(a)], random() * TAU);
}

/**
 * 单个 FCC 常规立方胞 = 8 顶角 + 6 面心，共 14 点。
 * 局部坐标单位 U，相对胞中心 ∈ {-1,0,1}：角点三个 ±1，面心一个 ±1。
 * cell + seen：8 胞拼 2×2×2 时，共享角/面心的冗余副本标 dedup，到点后退场。
 */
const CELL_POINTS: V3[] = (() => {
  const p: V3[] = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const n = (x !== 0 ? 1 : 0) + (y !== 0 ? 1 : 0) + (z !== 0 ? 1 : 0);
    if (n === 3 || n === 1) p.push([x, y, z]);
  }
  return p;
})();

function fccCell(f: LatticeFrame, opt: {
  u?: number;
  cell?: V3;
  seen?: Set<string>;
  /** 覆盖弹本体外观（半径 / 形状 / 长度）。晶锥用它把「晶格大玉」换成小八面体 */
  bullet?: Partial<Bullet>;
} = {}): void {
  const u = opt.u ?? UNIT;
  for (const [x, y, z] of CELL_POINTS) {
    const extra: Partial<Bullet> = { ...(opt.bullet || {}) };
    if (opt.cell && opt.seen) {
      // 胞内相对 -1/0/1 → 大晶体网格 0..4；相邻胞共享的角/面心落同一个 key
      const key = `${opt.cell[0] * 2 + x + 1},${opt.cell[1] * 2 + y + 1},${opt.cell[2] * 2 + z + 1}`;
      if (opt.seen.has(key)) extra.dedup = true;
      else opt.seen.add(key);
    }
    put(f, x * u, y * u, z * u, extra);
  }
}

export interface AssembleOpt {
  /** 飞行时长（秒），同时是拼合去重时刻 */
  flyDur?: number;
  /** 召唤球壳半径范围（以场地原点为心） */
  shellLo?: number; shellHi?: number;
  /** 召唤高度带 */
  yLo?: number; yHi?: number;
  /** 晶胞半边长（点距旋钮：大 = 稀 = 易） */
  u?: number;
  /**
   * 晶体自身寿命（秒，从生成时刻算起）。默认 **2.5**：拼合 0.8s 后只驻留约 1.7s。
   * 不能用全局 LIFE=15 —— 那会让训练场 `fieldBusy()` 干等 15s 才重放（体感的「后半等待」）。
   */
  life?: number;
}

/**
 * 晶格·合胞：8 个晶胞从空间随意 8 处飞到玩家中心，拼成 2×2×2 大晶体。
 *
 * 单位 = **单个晶胞**。自机狙 = 施法瞬间锁玩家位置，拼合中心不再追踪（对应「假设玩家不动」）。
 * 8 胞共用同一个随机 3D 朝向（rot），定死不转；到点后共享角/面心只留一份 → 63 点。
 * **晶体寿命独立设 2.5s**（不走全局 LIFE=15）：拼完只驻留约 1.7s 就自行退场，
 * 对局里正好接上下一招（抽招 2.5s + 前摇 0.5s），训练场也不用等 15s 场清才重放。
 * 难度旋钮：u 调小 = 晶体更密；flyDur 调小 = 拼得急；球壳调近 = 预警短；life 调大 = 驻留久。
 */
export function latticeAssemble(opt: AssembleOpt = {}): void {
  retireOldLattice();
  const dur = opt.flyDur ?? 0.8;
  const life = opt.life ?? 2.5;
  const lo = opt.shellLo ?? 14, hi = opt.shellHi ?? 20;
  const yLo = opt.yLo ?? 0, yHi = opt.yHi ?? 10.5;
  const u = opt.u ?? UNIT;
  const cx = player.x, cy = player.y + 0.9, cz = player.z;
  const rot = randomRot();
  const seen = new Set<string>();
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    // 胞中心在大晶体里的偏移（未旋转），经 rot 转成世界偏移
    const ox0 = (2 * a - 1) * u, oy0 = (2 * b - 1) * u, oz0 = (2 * c - 1) * u;
    const tx = cx + rot[0] * ox0 + rot[1] * oy0 + rot[2] * oz0;
    const ty = cy + rot[3] * ox0 + rot[4] * oy0 + rot[5] * oz0;
    const tz = cz + rot[6] * ox0 + rot[7] * oy0 + rot[8] * oz0;
    const ang = random() * TAU, rad = lo + random() * (hi - lo);
    const sx = Math.cos(ang) * rad, sy = yLo + random() * (yHi - yLo), sz = Math.sin(ang) * rad;
    const f = newFrame({
      ox: sx, oy: sy, oz: sz, scale: 1, rot,
      fly: { sx, sy, sz, tx, ty, tz, dur },
      dedupAt: dur,
    });
    fccCell(f, { u, cell: [a, b, c], seen, bullet: { life } });
  }
}

export interface StackOpt {
  /** 层数（ABC 循环，默认 6 = ABC×2 铺满 −2~10.5m） */
  layers?: number;
  /** 点距倍率（难度旋钮：<1 更密更难）。默认 0.95，层距恰 2.083m 与 FCC 几何自洽 */
  gap?: number;
  yLo?: number; yHi?: number; radius?: number;
  /** 横扫起点 x（场地外；须 > −32，否则被出界清理吃掉） */
  startX?: number;
  /** 单层飞行时长 / 层间隔 */
  flyDur?: number; layerGap?: number;
}

/**
 * 晶格·叠层：A/B/C 层依次从远处横飞进场、扫到场地中心停住，六层凑成全空间 FCC。
 *
 * 单位 = **一层**。释放位置参照**原点**（不以玩家/boss 为参照）。
 * 层距 h=(yHi−yLo)/L=2.083m 恰等于 2U/√3·gap，层内 nn=U√2·gap —— ABC 堆垛几何自洽。
 * 与晶雨的区别：停住后**不落雨**，一层层叠成静止的整块晶体。
 * 难度旋钮：layers 调多 / gap 调小 / layerGap 调小 / flyDur 调小 = 升级。
 */
export function latticeStack(opt: StackOpt = {}): void {
  retireOldLattice();
  const L = opt.layers ?? 6;
  const g = opt.gap ?? 0.95;
  const yLo = opt.yLo ?? -2, yHi = opt.yHi ?? 10.5;
  const R = opt.radius ?? ARENA_R + 1.5;
  const sx = opt.startX ?? -30;
  const dur = opt.flyDur ?? 0.6, lg = opt.layerGap ?? 0.75;   // v5.4.3：层间隔 0.75s 二次紧凑
  const h = (yHi - yLo) / L;
  const nn = UNIT * Math.SQRT2 * g;
  const AX = nn, AZ = 0, BX = nn * 0.5, BZ = nn * 0.866;
  const M = Math.ceil(R / nn) + 1;
  for (let i = 0; i < L; i++) {
    const s = i % 3;                              // ABC 堆垛：相邻层错 1/3 周期
    const ox = s * (AX + BX) / 3, oz = s * (AZ + BZ) / 3;
    const y = yLo + (i + 0.5) * h;
    const f = newFrame({
      ox: sx, oy: y, oz: 0, scale: 1, family: 'upright',
      fly: { sx, sy: y, sz: 0, tx: 0, ty: y, tz: 0, dur, delay: i * lg },
    });
    for (let m = -M; m <= M; m++) for (let n = -M; n <= M; n++) {
      const px = ox + m * AX + n * BX, pz = oz + m * AZ + n * BZ;
      if (Math.hypot(px, pz) > R) continue;
      put(f, px, 0, pz, { noOut: true });
    }
  }
}

export interface ConeOpt {
  /** 晶胞飞行速度（难度旋钮：调大 = 更难躲） */
  speed?: number;
  /** 胞内点间距从 0 撑到上限的时长 */
  growDur?: number;
  /** 最外环半角正切（默认 0.25 ≈ 14°） */
  maxTan?: number;
  /** 晶胞半边长 */
  u?: number;
  /** 弹本体半径（默认 0.18，与放射锥一致；旧值 0.5 的晶格大玉会糊在一起） */
  r?: number;
  /** 弹形状（默认 'octa' 正八面体）。非球形绕开晶格大玉贴图，走小柔光 + 3D 棱面 */
  shape?: BulletShape;
  /** 形状长度倍数（octa 默认 3.4） */
  len?: number;
  /** 方向环分布 [半角tan, 个数, 相位]，各项之和 = 晶胞数。默认 2³ = 1+3+4 = 8 */
  rings?: Array<[number, number, number]>;
}

/**
 * 晶格·晶锥：**2³ = 8 个晶胞**从一点爆出，锥状射向玩家。
 *
 * 单位 = **单个晶胞**（8 份）。原为 3³=27 份（378 颗八面体，canvas 调用 ≈2.9 万/帧、p95 182ms 卡顿），
 * 用户复核后改 2³ 试跑：112 颗，绘制量降到约三分之一，锥状层次仍保留（1 中轴 + 3 内环 + 4 外环）。
 * 自机狙 = 锥轴在施法瞬间锁 boss→玩家。
 * 涨的是**胞内**格点间距：每胞 14 点从一点撑开到 1 个晶胞边长（2U=3.8m）；
 * 胞与胞之间只沿各自方向直飞，不做额外锥面扩张（与放射锥的分工）。
 * 所有胞共用 rot：晶胞 (1,1,1) 体对角线对准玩家。
 * **v5.3 微调**：弹从 r=0.5 的「晶格大玉」换成 r=0.18 的正八面体（放射锥同款），
 * 各胞挤在窄锥里时不再糊成一团；合胞 / 叠层仍用大玉，不受影响。
 * 难度旋钮：speed / growDur / maxTan / u / r / shape / len / rings。
 */
export function latticeCone(opt: ConeOpt = {}): void {
  retireOldLattice();
  const sp = opt.speed ?? 12;
  const gd = opt.growDur ?? 0.9;
  const tan = opt.maxTan ?? 0.25;
  const u = opt.u ?? UNIT;
  const r = opt.r ?? 0.18;
  const shape = opt.shape ?? 'octa';
  const len = opt.len ?? 3.4;
  let ax = player.x - boss.x, ay = (player.y + 0.8) - boss.y, az = player.z - boss.z;
  const al = Math.hypot(ax, ay, az) || 1;
  ax /= al; ay /= al; az /= al;
  let p1x = -az, p1y = 0, p1z = ax;              // 与锥轴正交的基 1
  const p1l = Math.hypot(p1x, p1z) || 1;
  p1x /= p1l; p1z /= p1l;
  const p2x = ay * p1z - az * p1y;               // 基 2 = 轴 × 基 1
  const p2y = az * p1x - ax * p1z;
  const p2z = ax * p1y - ay * p1x;
  const rings: Array<[number, number, number]> = opt.rings ?? [
    [0, 1, 0], [tan * 0.42, 3, 0.5], [tan, 4, 0.125]
  ];                                             // 1 + 3 + 4 = 8 = 2³
  // 旧 3³=27 分布（要回退/加压时用 opt.rings 传）：
  //   [[0,1,0],[tan*0.42,6,0.5],[tan*0.84,12,0.2],[tan,8,0.125]]
  const rot = rotAlign([1, 1, 1], [ax, ay, az], random() * TAU);
  for (const [tanA, cnt, phase] of rings) {
    for (let i = 0; i < cnt; i++) {
      const phi = phase + i / cnt * TAU;
      const cp = Math.cos(phi), sn = Math.sin(phi);
      const dx = ax + (p1x * cp + p2x * sn) * tanA;
      const dy = ay + (p1y * cp + p2y * sn) * tanA;
      const dz = az + (p1z * cp + p2z * sn) * tanA;
      const dl = Math.hypot(dx, dy, dz) || 1;
      const f = newFrame({
        ox: boss.x, oy: boss.y, oz: boss.z,
        vx: dx / dl * sp, vy: dy / dl * sp, vz: dz / dl * sp,
        scale: 0.02, grow: { dur: gd, from: 0.02 },
        rot, noHitAt: 0.3,
      });
      fccCell(f, { u, bullet: { r, shape, len } });
    }
  }
}
