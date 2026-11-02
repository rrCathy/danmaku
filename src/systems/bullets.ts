/**
 * 子弹生命周期与碰撞。
 *
 * 所有「弹幕长什么样、会不会打中人」的判断都集中在这一个循环里：
 * 位置积分 → 每帧重算高度色 → 生命周期（落雨 / 地雷 / 地涌）→ 出界 → 碰玩家。
 */
import { ARENA_R, DIAG_KEEP, GRAZE_R, PLAYER } from '../config';
import { CLASS_INFO, COLORS, clsByHeight, clsName, heightRGB } from '../core/color';
import { random } from '../core/random';
import { segPointDist } from '../core/math';
import { cam } from '../core/camera';
import { isTouch } from '../core/device';
import { boss, bullets, clock, logs, opts, player, pshots, rings, session, state, stats, training } from '../state';
import { spawnSpark } from './effects';
import { damageBoss } from './boss';
import { updateHud } from '../ui/hud';
import { renderDiag } from '../ui/diag';
import { toast } from '../ui/toast';
import { endGame } from '../ui/flow';
import type { Bullet, BulletShape, HClass } from '../types';

export function addBullet(
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  r: number, cls: HClass, kind: Bullet['kind'],
  shape?: BulletShape, len?: number
): void {
  // 难度倍率 × 训练场倍率，在这里统一生效：所有图案都走这个工厂，不用各自改
  const k = session.bulletSpeed * training.speed;
  bullets.push({
    x, y, z,
    px: x, py: y, pz: z,
    vx: k === 1 ? vx : vx * k,
    vy: k === 1 ? vy : vy * k,
    vz: k === 1 ? vz : vz * k,
    r, cls, kind,
    rgb: heightRGB(y),
    homing: kind === 'orbit' ? 1 : 0,
    life: kind === 'orbit' ? 7 : 8,
    shape, len,
    trail: null, tk: 0
  });
}

/** 地雷爆炸：一圈低空弹（可以起跳躲） */
export function explodeMine(b: Bullet): void {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + random() * 0.28;
    addBullet(b.x, 0.55, b.z, Math.cos(a) * 7.6, 0, Math.sin(a) * 7.6, 0.20, 'low', 'mineBurst');
  }
  for (let k = 0; k < 14; k++) spawnSpark(b.x, 0.5, b.z, COLORS.low, 1.2);
  cam.shakeAmp = Math.max(cam.shakeAmp, 3);
}

/* ============ 判定：形状分派 + 擦弹 ============ */

/** 玩家判定胶囊轴（竖直线段）到一点的距离 */
function distToPlayerAxis(x: number, y: number, z: number): number {
  return segPointDist(
    x, y, z,
    player.x, player.y + PLAYER.bodyLow, player.z,
    player.x, player.y + PLAYER.bodyHigh, player.z
  );
}

/**
 * 弹的朝向正交基（前向 = 速度方向）。返回 [f, u, w]。
 * 速度接近零时退化为任意正交基（静止弹不受朝向影响）。
 */
function basisOf(b: Bullet): Array<[number, number, number]> {
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  if (sp < 1e-6) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const fx = b.vx / sp, fy = b.vy / sp, fz = b.vz / sp;
  // up 取与 f 最不共线的世界轴
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(fy) > 0.9) { ux = 1; uy = 0; }
  // w = f × u（归一），u = w × f
  let wx = fy * uz - fz * uy, wy = fz * ux - fx * uz, wz = fx * uy - fy * ux;
  const wl = Math.hypot(wx, wy, wz) || 1;
  wx /= wl; wy /= wl; wz /= wl;
  const u2x = wy * fz - wz * fy, u2y = wz * fx - wx * fz, u2z = wx * fy - wy * fx;
  return [[fx, fy, fz], [u2x, u2y, u2z], [wx, wy, wz]];
}

/**
 * 形状 → 判定量。返回「点到弹碰撞体的距离」（负值=在内部语义上等价于小于 0），
 * 与 hitR / GRAZE_R 直接比较 —— 碰撞箱形状跟视觉形状走：
 *   ball          球（点到球心距离 - r）
 *   arrow / ellip 头 + 尾双球（胶囊的扫掠近似，防快速弹隧穿）
 *   box           方盒：OBB 膨胀判定（局部 AABB clamp，精确）
 *   tetra         正四面体：4 面半平面（Minkowski 膨胀的过近似，宁严勿松）
 */
export function shapeDist(b: Bullet): number {
  const shape = b.shape || 'ball';
  if (shape === 'ball') {
    return distToPlayerAxis(b.x, b.y, b.z) - b.r;
  }
  if (shape === 'arrow' || shape === 'ellip' || shape === 'octa') {
    const dHead = distToPlayerAxis(b.x, b.y, b.z);
    const dTail = distToPlayerAxis(b.px, b.py, b.pz);
    return Math.min(dHead, dTail) - b.r;
  }
  if (shape === 'box') {
    const hl = (b.len || 2.2) * b.r * 0.5;
    const hw = b.r * 0.92;
    const B = basisOf(b);
    // 玩家胶囊两端点分别对盒求距离（线段采样：端点距 0.45m > 单帧位移，不隧穿）
    let dmin = Infinity;
    for (const pe of [
      [player.x, player.y + PLAYER.bodyLow, player.z],
      [player.x, player.y + PLAYER.bodyHigh, player.z]
    ] as const) {
      const dx = pe[0] - b.x, dy = pe[1] - b.y, dz = pe[2] - b.z;
      const ld = Math.abs(dx * B[0][0] + dy * B[0][1] + dz * B[0][2]) - hl;
      const ud = Math.abs(dx * B[1][0] + dy * B[1][1] + dz * B[1][2]) - hw;
      const wd = Math.abs(dx * B[2][0] + dy * B[2][1] + dz * B[2][2]) - hw;
      // 标准 OBB 距离：盒外取三个外分量长度的模；盒内取「最不深」的那个负分量。
      // 末项必须是 min(max(ld,ud,wd), 0) —— 写成 min(ld,ud,wd,0) 会让
      // 「盒外但沿某轴仍在盒投影内」的点被负分量拉近距离，三个轴各膨胀半个长边，
      // 视觉上的缝会被判定填平（v1.14 修）。
      const dPoint = Math.sqrt(Math.max(ld, 0) ** 2 + Math.max(ud, 0) ** 2 + Math.max(wd, 0) ** 2) +
        Math.min(Math.max(ld, ud, wd), 0);
      if (dPoint < dmin) dmin = dPoint;
    }
    return dmin;
  }
  // tetra：单位四面体顶点 (±1,±1,±1)/√3，面法线 = -顶点方向。外接球 1×TETRA_SCALE
  const S = 1.35 * b.r;          // 外接球半径（内切 ≈ 0.45r，体量感与球弹相当）
  const N: Array<[number, number, number]> = [
    [-1, -1, -1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]
  ];   // 每个面的外法线 ∝ -(对面顶点)
  const B = basisOf(b);
  const spin = (8 - (b.life || 0)) * 3.1;
  const cs = Math.cos(spin), sn = Math.sin(spin);
  let dmin = Infinity;
  for (const pe of [
    [player.x, player.y + PLAYER.bodyLow, player.z],
    [player.x, player.y + PLAYER.bodyHigh, player.z]
  ] as const) {
    const dx = pe[0] - b.x, dy = pe[1] - b.y, dz = pe[2] - b.z;
    // 世界 → 弹局部
    const lf = dx * B[0][0] + dy * B[0][1] + dz * B[0][2];
    let lu = dx * B[1][0] + dy * B[1][1] + dz * B[1][2];
    let lw = dx * B[2][0] + dy * B[2][1] + dz * B[2][2];
    // 绕前向轴自旋
    const ru = lu * cs - lw * sn, rw = lu * sn + lw * cs;
    lu = ru; lw = rw;
    // 4 面半平面：外法线单位向量 = N/√3（N 是 ±1 的顶点方向，长度 √3），
    // 面方程 dot(n,p) = S/3（内切半径）。dd = dot(n,p) - S/3：内部为负、面上为 0。
    // hit(膨胀体) = max dd ≤ hitR。
    // 注意这里**不能再乘 S**：v1.14 前写成 dot(N,p)*S/√3 - S/3，等于把距离乘了 S，
    // r=0.2 的弹判定半径被放大到 1.35m（球弹同参只有 0.35m）。
    // 棱角附近 max-face 仍是膨胀体的过近似 → 宁严勿松（r=0.2 时约 +0.025m）。
    let d = -Infinity;
    for (let k = 0; k < 4; k++) {
      const dd = (N[k][0] * lf + N[k][1] * lu + N[k][2] * lw) / Math.sqrt(3) - S / 3;
      if (dd > d) d = dd;
    }
    if (d < dmin) dmin = d;
  }
  return dmin;
}

/** 擦弹三分类：弹在头顶上方 / 脚下 / 身侧 */
function grazeBucket(b: Bullet): 'head' | 'foot' | 'body' {
  if (b.y > player.y + PLAYER.bodyHigh + 0.35) return 'head';
  if (b.y < player.y + PLAYER.bodyLow - 0.35) return 'foot';
  return 'body';
}

export function updateBullets(dt: number): void {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.px = b.x; b.py = b.y; b.pz = b.z;

    // 俯冲弹：先悬停读秒，时间到垂直砸向地面标记点
    if (b.kind === 'dive') {
      if (b.fuse !== undefined && b.fuse > 0) {
        b.fuse -= dt;
        if (b.fuse <= 0) {
          b.vy = -23;
          for (let k = 0; k < 4; k++) spawnSpark(b.x, b.y, b.z, COLORS.rain, 0.8);
        }
      }
    }

    // 诱饵：降到 1.78m 突然改成水平冲刺 —— 紫色说"还很高"，实际在打你腰
    if (b.kind === 'feint' && b.fuse && b.y <= 0.6) {
      b.fuse = 0;
      b.y = 0.6;
      const dx = player.x - b.x, dz = player.z - b.z;
      const dl = Math.hypot(dx, dz) || 1;
      const sp = 9.6;
      b.vx = dx / dl * sp;
      b.vz = dz / dl * sp;
      b.vy = 0;
      for (let k = 0; k < 5; k++) spawnSpark(b.x, b.y, b.z, COLORS.high, 0.7);
    }

    if (b.homing) {
      const spd = 4.2;
      const dx = player.x - b.x;
      const dy = (player.y + 0.8) - b.y;
      const dz = player.z - b.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const k = Math.min(1, dt * 1.4);
      b.vx += (dx / l * spd - b.vx) * k;
      b.vy += (dy / l * spd - b.vy) * k;
      b.vz += (dz / l * spd - b.vz) * k;
    }

    // 抛物线弹（喷泉）：只有显式带 grav 的弹受影响，旧图案 grav=undefined 零变化
    if (b.grav) b.vy -= b.grav * dt;

    // 烟雾：爆开后减速、缓慢下沉 —— 衰减慢一点，让它扩散成一整片
    if (b.kind === 'smoke') {
      const k = Math.pow(0.45, dt);
      b.vx *= k;
      b.vz *= k;
      b.vy -= 2.2 * dt;
    }

    // 风车：位置由绕中心的极坐标重算（不走速度积分）
    if (b.kind === 'pinwheel' && b.orbA !== undefined) {
      b.orbA += (b.orbW || 0) * dt;
      b.x = (b.orbX || 0) + Math.cos(b.orbA) * (b.orbR || 0);
      b.z = (b.orbZ || 0) + Math.sin(b.orbA) * (b.orbR || 0);
    } else {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
    }

    // 扫描线：沿自己速度方向在 [oscLo, oscHi] 之间往返（支持任意角度，不再只限 x 轴）
    if (b.kind === 'sweepLine' && b.oscLo !== undefined && b.oscHi !== undefined) {
      const sp = Math.hypot(b.vx, b.vz) || 1;
      const nx = b.vx / sp, nz = b.vz / sp;
      const s = b.x * nx + b.z * nz;
      if (s > b.oscHi) {
        const d = (s - b.oscHi) * 2;
        b.x -= nx * d; b.z -= nz * d;
        b.vx = -b.vx; b.vz = -b.vz;
      } else if (s < b.oscLo) {
        const d = (b.oscLo - s) * 2;
        b.x += nx * d; b.z += nz * d;
        b.vx = -b.vx; b.vz = -b.vz;
      }
    }
    // 波浪：整排同步脉动（主项只看时间，次项是 ±0.18 的空间纹理）。
    // 之前写成行波时波峰以 3.8m/s 沿切向走，玩家跟着跑就永远在安全的高处 —— 等于没修。
    if (b.kind === 'wave') {
      b.y = 1.45 + 1.15 * Math.sin((b.waveP || 0) + 2.4 * clock.elapsed)
        + 0.18 * Math.sin(b.waveU || 0);
    }

    b.life -= dt;
    b.rgb = heightRGB(b.y);   // 颜色永远跟着当前高度走
    // 落雨类的语义分段固定为 rain（诊断文案「落点雨」），其余按当前高度重算
    b.cls = (b.kind === 'rain' || b.kind === 'downpour' || b.kind === 'lightning')
      ? 'rain' : clsName(b.y);

    if (opts.trailMode === 1 || opts.trailMode === 3) {
      b.tk -= dt;
      if (b.tk <= 0) {
        b.tk = 0.045;
        if (!b.trail) b.trail = [];
        b.trail.push(b.x, b.y, b.z);
        if (b.trail.length > 66) b.trail.splice(0, 3);
      }
    }

    if ((b.kind === 'rain' || b.kind === 'downpour' || b.kind === 'fountain' || b.kind === 'lightning') && b.y <= 0.12) {
      for (let k = 0; k < 5; k++) spawnSpark(b.x, 0.15, b.z, COLORS.rain, 0.8);
      bullets.splice(i, 1);
      continue;
    }

    // 手雷的爆散弹：撞地即灭（半球形发射，低角度的那几颗）；烟雾同样落地散掉
    if ((b.kind === 'grenade' || b.kind === 'smoke') && b.y <= 0.12) {
      for (let k = 0; k < 2; k++) spawnSpark(b.x, 0.12, b.z, COLORS.low, 0.5);
      bullets.splice(i, 1);
      continue;
    }

    // 反雨（真反雨）：从地面背面穿地升到约 1.5m 就结束 —— 轨迹短，颜色全程在低层
    if (b.kind === 'uprain' && b.y > 1.5) {
      for (let k = 0; k < 3; k++) spawnSpark(b.x, b.y, b.z, b.rgb, 0.5);
      bullets.splice(i, 1);
      continue;
    }

    // 地雷：砸到地面后固定住，读秒结束向四周炸开一圈低空弹
    if (b.kind === 'mine' && b.y <= 0.32) {
      b.y = 0.32;
      b.vx = 0; b.vy = 0; b.vz = 0;
      b.kind = 'mineLive';
      b.fuse = 1.9;
      b.life = 99;
      rings.push({ x: b.x, z: b.z, r: 1.45, t: 1.9, dur: 1.9, cls: 'mine' });
      for (let k = 0; k < 4; k++) spawnSpark(b.x, 0.3, b.z, COLORS.rain, 0.5);
    }
    if (b.kind === 'mineLive') {
      if (b.fuse !== undefined) {
        b.fuse -= dt;
        if (b.fuse <= 0) {
          explodeMine(b);
          bullets.splice(i, 1);
          continue;
        }
      }
    }

    // 地涌：上升途中实时换色 —— 高度色带永远说实话
    // 注意：这里用离散 COLORS 覆盖连续色的分支是 v0.6 遗留，只在 0.85–1.05m 波段触发一帧。
    // 1:1 搬家阶段先原样保留，改配色时一并清掉。
    if (b.kind === 'rise') {
      const c2 = clsByHeight(b.y);
      if (c2 !== b.cls) { b.cls = c2; b.rgb = COLORS[c2]; }
      if (b.y > 7.2) {
        for (let k = 0; k < 3; k++) spawnSpark(b.x, b.y, b.z, b.rgb, 0.5);
        bullets.splice(i, 1);
        continue;
      }
    }

    // 出界清除。uprain 出生在负 y（地面背面），下界放宽到 -3.5，其余弹维持 -1.2
    const yOut = b.kind === 'uprain' ? b.y < -3.5 : b.y < -1.2;
    if (b.life <= 0 || yOut || Math.hypot(b.x, b.z) > ARENA_R + 8) {
      bullets.splice(i, 1);
      continue;
    }

    // 判定 + 擦弹：一次形状求距，三档分派（hit / graze / 无事）。
    // hit 永远优先 —— 弹飞向玩家必先穿过擦弹层，grazed 标记绝不能拦住 hit。
    // grazed 只做两件事：擦弹去重（一颗弹只擦一次）、无敌期穿身后吞掉这颗弹的擦弹。
    if (!b.noHit) {
      const d = shapeDist(b);
      if (d < PLAYER.hitR) {
        if (player.inv <= 0) {
          onPlayerHit(b);
          bullets.splice(i, 1);
          continue;
        }
        b.grazed = 1;                       // 穿身，这颗弹不再计擦弹
      } else if (b.grazed !== 1 && d < GRAZE_R) {
        b.grazed = 1;
        stats.graze++;
        const bucket = grazeBucket(b);
        if (bucket === 'head') stats.grazeHead++;
        else if (bucket === 'foot') stats.grazeFoot++;
        else stats.grazeBody++;
        for (let k = 0; k < 3; k++) spawnSpark(b.x, b.y, b.z, '255,255,255', 0.4);
        updateHud();
      }
    }
  }
}

/** 能打中玩家的东西的公共形状：子弹也行，激光也行。 */
export interface HitSource {
  cls: HClass;
  rgb: string;
  x: number; y: number; z: number;
}

/** 受击诊断链：扣血、无敌帧、写日志、toast。这里是"为什么被打中"的唯一出口。 */
export function onPlayerHit(b: HitSource): void {
  const info = CLASS_INFO[b.cls] || CLASS_INFO.mid;
  const dmg = b.cls === 'rain' ? PLAYER.dmgRain : PLAYER.dmgBullet;
  const isTraining = state === 'training';

  // 训练场不扣血：练习的目标是"读懂"，不是"活下来"
  if (!isTraining) player.hp = Math.max(0, player.hp - dmg);
  player.inv = PLAYER.invTime;
  clock.dmgFlash = 0.45;
  clock.slowT = 0.3;
  cam.shakeAmp = 7;

  stats.hits++;
  stats[b.cls]++;

  logs.unshift({ info, y: b.y, cls: b.cls, t: clock.elapsed });
  if (logs.length > DIAG_KEEP) logs.pop();
  renderDiag();

  if (!isTouch && !isTraining) toast('被「' + info.name + '」命中 · ' + info.tip, 1600, b.rgb);
  for (let i = 0; i < 16; i++) spawnSpark(b.x, b.y, b.z, b.rgb, 1.4);

  updateHud();
  if (!isTraining && player.hp <= 0) endGame(false, 'hp');
}

export function updateShots(dt: number): void {
  for (let i = pshots.length - 1; i >= 0; i--) {
    const s = pshots[i];
    s.px = s.x; s.py = s.y; s.pz = s.z;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.life -= dt;

    if (boss.alive) {
      const d = Math.hypot(s.x - boss.x, s.y - boss.y, s.z - boss.z);
      if (d < 1.32 + s.r) {
        damageBoss(s.dmg);
        for (let k = 0; k < 3; k++) spawnSpark(s.x, s.y, s.z, COLORS.pshot, 0.6);
        pshots.splice(i, 1);
        continue;
      }
    }

    if (s.life <= 0 || Math.hypot(s.x, s.z) > ARENA_R + 8 || s.y < -1) pshots.splice(i, 1);
  }
}
