/**
 * 16 种图案的具体实现。
 *
 * 每个函数 = 一次完整的出招（而不是一帧），时序靠 later() 排。
 * 想改某个图案的节奏，改这里；想改池子和阶段解锁，改 index.ts。
 */
import { ARENA_R } from '../config';
import { COLORS } from '../core/color';
import { random } from '../core/random';
import { clamp, rand } from '../core/math';
import { boss, bullets, lasers, later, player, rings, walls } from '../state';
import { addBullet } from '../systems/bullets';
import { satPos } from '../systems/boss-geometry';
import { spawnSpark } from '../systems/effects';
import { aimVel, fanShot } from './emitters';
import type { HClass } from '../types';

const TAU = Math.PI * 2;

/** 落点雨：地面亮圈读秒 → 垂直下落。颜色跟着高度一路变红，只能靠地面圈识别。 */
export function rainShot(): void {
  const n = boss.phase >= 3 ? 7 : 5;
  for (let i = 0; i < n; i++) {
    let x: number, z: number, delay: number;
    if (i === 0) {
      x = player.x + rand(-0.5, 0.5);
      z = player.z + rand(-0.5, 0.5);
      delay = 0.95;
    } else {
      const a = random() * TAU;
      const rr = rand(2.0, 5.0);
      x = player.x + Math.cos(a) * rr;
      z = player.z + Math.sin(a) * rr;
      delay = 1.0 + i * 0.08;
    }
    const dx = x - boss.x, dz = z - boss.z;
    if (Math.hypot(dx, dz) > ARENA_R - 1.5) continue;

    rings.push({ x, z, r: 1.15, t: delay, dur: delay });
    later(delay, (function (xx, zz) {
      return function () {
        addBullet(xx, 10.5, zz, 0, -15.5, 0, 0.34, 'rain', 'rain');
        for (let k = 0; k < 4; k++) spawnSpark(xx, 10.5, zz, COLORS.rain, 0.7);
      };
    })(x, z));
  }
}

/** 追踪弹：从 boss 周围射出一圈慢速追踪弹，绕圈拉扯能拖散它们 */
export function orbitShot(): void {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + boss.spin;
    const ox = boss.x + Math.cos(a) * 1.9;
    const oz = boss.z + Math.sin(a) * 1.9;
    const oy = boss.y + rand(-0.7, 0.7);
    addBullet(ox, oy, oz, Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4, 0.20, 'mid', 'orbit');
  }
}

/** 螺旋：连续发射 + 高度正弦变化，形成 3D 螺旋 */
export function spiralShot(): void {
  const N = 26;
  for (let i = 0; i < N; i++) {
    later(i * 0.072, (function (idx) {
      return function () {
        if (!boss.alive) return;
        const a = boss.spin * 2.4 + idx * 0.46;
        const h = 0.75 + (Math.sin(idx * 0.42) * 0.5 + 0.5) * 2.1;
        const sp = 10.2;
        addBullet(boss.x, h, boss.z, Math.cos(a) * sp, 0, Math.sin(a) * sp,
          0.20, clsOf(h), 'spiral');
      };
    })(i));
  }
}

/**
 * 推一面墙：从场地边缘朝中心推进的立体弹墙，带一个缺口。
 * 抽出来是为了让「墙缝」和「闸门」共用同一套弹道数学。
 */
function pushWall(
  nx: number, nz: number,
  gapPos: number, gapW: number,
  rows: number, speed: number, delay: number
): void {
  const tx = -nz, tz = nx;
  const D = ARENA_R - 0.4;
  const halfW = 8.5;

  walls.push({ nx, nz, tx, tz, D, halfW, gapPos, gapW, t: delay, dur: delay });

  later(delay, function () {
    if (!boss.alive) return;
    const step = 0.66;
    for (let u = -halfW; u <= halfW; u += step) {
      if (Math.abs(u - gapPos) < gapW) continue;    // 缺口
      for (let k = 0; k < rows; k++) {
        const h = 0.42 + k * 0.82;
        const px = nx * D + tx * u;
        const pz = nz * D + tz * u;
        addBullet(px, h, pz, -nx * speed, 0, -nz * speed, 0.21, clsOf(h), 'wall');
      }
    }
    // 缺口地面标记，帮玩家确认“洞在这里”
    const gx = nx * (D - 3) + tx * gapPos;
    const gz = nz * (D - 3) + tz * gapPos;
    rings.push({ x: gx, z: gz, r: gapW + 0.5, t: 0.55, dur: 0.55, cls: 'gap' });
  });
}

/** 墙缝：一整面立体弹墙推进，只留一个缺口 */
export function wallShot(): void {
  const dirA = random() * TAU;
  const nx = Math.cos(dirA), nz = Math.sin(dirA);   // 推进方向（朝场地中心）
  const tx = -nz, tz = nx;                          // 墙面切线
  const halfW = 8.5;

  // 缺口放在玩家切线位置附近（保证可达但需要移动）
  const pu = player.x * tx + player.z * tz;
  const gapPos = clamp(pu + rand(-2.6, 2.6), -halfW + 1.6, halfW - 1.6);

  boss.flash = 0.5;
  pushWall(nx, nz, gapPos, 1.35, 4, 7.2, 1.15);
}

/** 旋转激光：低扫（要跳）/ 高扫（别跳），从场地边缘横过 */
export function laserSweep(): void {
  const base = random() * TAU;
  lasers.push({ x: 0, z: 0, ang: base, y: 0.55, spin: 0.72, warm: 1.1, life: 3.2, r: 0.32, cls: 'low' });
  lasers.push({ x: 0, z: 0, ang: base + Math.PI * 0.42, y: 2.72, spin: -0.52, warm: 1.6, life: 2.9, r: 0.32, cls: 'high' });
  boss.flash = 0.55;
}

/** 卫星齐射：从三个卫星各打一组瞄准弹（多发射源，考"认源"） */
export function satBurst(): void {
  const n = boss.phase >= 3 ? 3 : 2;
  for (let s = 0; s < boss.sats.length; s++) {
    const src = satPos(s);
    for (let i = 0; i < n; i++) {
      const h = 0.62 + i * 0.95;
      const v = aimVel(src, player.x, h, player.z, 12.5);
      addBullet(src.x, src.y, src.z, v.x, v.y, v.z, 0.20, clsOf(h), 'sat');
    }
    for (let k = 0; k < 3; k++) spawnSpark(src.x, src.y, src.z, COLORS.mid, 0.4);
  }
}

/** 阶梯：一串高度逐级抬升的连发，像一段楼梯从你身上刷过去 */
export function stairShot(): void {
  const N = boss.phase >= 3 ? 9 : 7;
  const px = player.x, pz = player.z;   // 锁定施法瞬间的位置：站着不动必被扫中
  for (let i = 0; i < N; i++) {
    later(i * 0.155, (function (idx) {
      return function () {
        if (!boss.alive) return;
        const h = 0.45 + idx * (2.55 / (N - 1));   // 0.45 → 3.0 逐级抬升
        const v = aimVel(boss, px, h, pz, 11.8);
        addBullet(boss.x, boss.y, boss.z, v.x, v.y, v.z, 0.21, clsOf(h), 'stair');
      };
    })(i));
  }
}

/** 俯冲：高空悬停 + 地面落点圈，读秒结束后垂直砸下来 */
export function diveShot(): void {
  const n = boss.phase >= 3 ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const a = random() * TAU;
    const rr = i === 0 ? rand(0.3, 1.2) : rand(2.4, 5.2);
    let tx = player.x + Math.cos(a) * rr;
    let tz = player.z + Math.sin(a) * rr;
    const d = Math.hypot(tx, tz);
    if (d > ARENA_R - 1.4) { tx *= (ARENA_R - 1.5) / d; tz *= (ARENA_R - 1.5) / d; }

    const fuse = 0.85 + i * 0.13;
    addBullet(tx, 8.8, tz, 0, 0, 0, 0.30, 'rain', 'dive');
    const b = bullets[bullets.length - 1];
    b.fuse = fuse;
    rings.push({ x: tx, z: tz, r: 1.05, t: fuse, dur: fuse, cls: 'dive' });
  }
}

/** 布雷：斜着砸到地面的延时雷，读秒结束后向四周炸开一圈低空弹 */
export function mineShot(): void {
  const n = boss.phase >= 3 ? 5 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.35, 0.35);
    const rr = rand(2.4, 6.6);
    let tx = player.x + Math.cos(a) * rr;
    let tz = player.z + Math.sin(a) * rr;
    const d = Math.hypot(tx, tz);
    if (d > ARENA_R - 1.5) { tx *= (ARENA_R - 1.6) / d; tz *= (ARENA_R - 1.6) / d; }
    addBullet(tx, 6.2, tz, 0, -17, 0, 0.26, 'rain', 'mine');
    bullets[bullets.length - 1].noHit = 1;        // 雷本身不碰人，靠爆炸清场
  }
}

/** 地涌：地面先亮标记，再从地底垂直升起一道光柱（必须横移，跳没用） */
export function riseShot(): void {
  const n = boss.phase >= 3 ? 5 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + random() * 0.5;
    const rr = rand(1.5, 4.8);
    let x = player.x + Math.cos(a) * rr;
    let z = player.z + Math.sin(a) * rr;
    const d = Math.hypot(x, z);
    if (d > ARENA_R - 1.3) { x *= (ARENA_R - 1.4) / d; z *= (ARENA_R - 1.4) / d; }
    rings.push({ x, z, r: 0.8, t: 0.72, dur: 0.72, cls: 'rise' });
    later(0.72, (function (xx, zz) {
      return function () {
        addBullet(xx, 0.2, zz, 0, 13.5, 0, 0.30, 'mid', 'rise');
        for (let k = 0; k < 4; k++) spawnSpark(xx, 0.25, zz, COLORS.mid, 0.6);
      };
    })(x, z));
  }
}

/** 双螺旋帘：两股反向螺旋交错，缝隙在转，得跟着缝走 */
export function counterSpiral(): void {
  const N = boss.phase >= 3 ? 30 : 22;
  for (let i = 0; i < N; i++) {
    later(i * 0.058, (function (idx) {
      return function () {
        if (!boss.alive) return;
        const a1 = boss.spin * 2.8 + idx * 0.56;
        const a2 = -boss.spin * 2.8 - idx * 0.56 + Math.PI * 0.5;
        const h1 = 0.7 + (Math.sin(idx * 0.36) * 0.5 + 0.5) * 2.2;
        const h2 = 0.7 + (Math.sin(idx * 0.36 + Math.PI) * 0.5 + 0.5) * 2.2;
        const sp = 9.6;
        addBullet(boss.x, h1, boss.z, Math.cos(a1) * sp, 0, Math.sin(a1) * sp, 0.19, clsOf(h1), 'spiral');
        addBullet(boss.x, h2, boss.z, Math.cos(a2) * sp, 0, Math.sin(a2) * sp, 0.19, clsOf(h2), 'spiral');
      };
    })(i));
  }
}

/** 低接高：先低扫（要跳），1 秒后高扫（必须落地）—— 练起跳节奏 */
export function lowHigh(): void {
  boss.flash = 0.45;
  later(0.45, function () { fanShot(0.55, 6, 13.5, 0.22, 'low', 2.9); });
  later(0.45 + 1.05, function () {
    const src = satPos(1);
    for (let i = 0; i < 6; i++) {
      const off = (i - 2.5) * 2.4;
      const px = player.x + off * Math.cos(boss.spin * 0.2);
      const pz = player.z + off * Math.sin(boss.spin * 0.2);
      const v = aimVel(src, px, 2.62, pz, 13.2);
      addBullet(src.x, src.y, src.z, v.x, v.y, v.z, 0.24, 'high', 'sweep');
    }
  });
}

/* ============================================================
 * 难度 2 新增
 *
 * 设计原则：**能靠侧移解决的，一律不算难**。
 * 下面每一招都至少堵死一条"侧移"路线。
 * ============================================================ */

/**
 * 跃墙：横跨全场、**没有缺口**的贴地弹墙。
 *
 * 这是"侧移无效"的正面回答：墙横跨 ±11m（比场地还宽），速度 9.4 比玩家 8.4 快 ——
 * 往后跑会被追上，往侧边跑墙比场地宽。唯一的解是**跳**。
 * 三波：低（跳）→ 高（别跳）→ 低（跳），间隔约 1.2s，正好卡住起跳节奏。
 */
export function jumpWall(): void {
  const plan: Array<[number, number]> = [[0.35, 0.55], [1.55, 3.1], [2.75, 0.55]];
  boss.flash = 0.4;
  for (let i = 0; i < plan.length; i++) {
    const delay = plan[i][0];
    const hh = plan[i][1];
    later(delay, (function (h) {
      return function () {
        if (!boss.alive) return;
        // 朝玩家方向推进，横向覆盖整场
        let nx = player.x - boss.x, nz = player.z - boss.z;
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        const tx = -nz, tz = nx;
        const sp = 9.4;
        // 覆盖整场：场地半径 18，所以横向铺 ±18 —— 侧面没有尽头可跑
        for (let u = -ARENA_R; u <= ARENA_R + 0.01; u += 0.8) {
          addBullet(boss.x + tx * u, h, boss.z + tz * u,
            nx * sp, 0, nz * sp, 0.23, clsOf(h), 'wall');
        }
      };
    })(hh));
  }
}

/** 预判狙：按玩家当前速度打提前量，三个高度同时来 —— 站着不动必被三发一起命中 */
export function sniper(): void {
  const rounds = boss.phase >= 3 ? 3 : 2;
  boss.flash = 0.45;
  for (let k = 0; k < rounds; k++) {
    later(0.45 + k * 0.62, function () {
      if (!boss.alive) return;
      const lead = 0.3;
      const tx = player.x + player.vx * lead;
      const tz = player.z + player.vz * lead;
      const hs = [0.55, 1.55, 2.75];
      for (let i = 0; i < hs.length; i++) {
        const v = aimVel(boss, tx, hs[i], tz, 16);
        addBullet(boss.x, boss.y, boss.z, v.x, v.y, v.z, 0.20, clsOf(hs[i]), 'sat');
      }
    });
  }
}

/** 闸门：两道同向推进的墙，缺口错开约 4.4m —— 穿过第一道后必须立刻横移到第二个口 */
export function gate(): void {
  const dirA = random() * TAU;
  const nx = Math.cos(dirA), nz = Math.sin(dirA);
  const tx = -nz, tz = nx;
  const pu = player.x * tx + player.z * tz;
  const gapA = clamp(pu - 2.2 + rand(-0.4, 0.4), -6.9, 6.9);
  const gapB = clamp(pu + 2.2 + rand(-0.4, 0.4), -6.9, 6.9);

  boss.flash = 0.5;
  pushWall(nx, nz, gapA, 1.35, 4, 7.6, 1.05);
  later(1.05, function () {
    if (!boss.alive) return;
    pushWall(nx, nz, gapB, 1.35, 4, 7.6, 0.75);
  });
}

/** 涌裂：地涌升到 2.9m 炸开一圈 —— 贴脸站桩会被"柱子 + 环"同时处理，必须提前拉距离 */
export function risenare(): void {
  const n = boss.phase >= 3 ? 3 : 2;
  boss.flash = 0.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.4, 0.4);
    const rr = rand(2.0, 4.8);
    let x = player.x + Math.cos(a) * rr;
    let z = player.z + Math.sin(a) * rr;
    const d = Math.hypot(x, z);
    if (d > ARENA_R - 1.4) { x *= (ARENA_R - 1.5) / d; z *= (ARENA_R - 1.5) / d; }

    rings.push({ x, z, r: 0.85, t: 0.8, dur: 0.8, cls: 'rise' });
    later(0.8, (function (xx, zz) {
      return function () {
        addBullet(xx, 0.2, zz, 0, 13.5, 0, 0.30, 'mid', 'rise');
        later(0.2, function () {
          const h = 2.9;
          const rot = random() * TAU;
          for (let k = 0; k < 10; k++) {
            const aa = rot + (k / 10) * TAU;
            addBullet(xx, h, zz, Math.cos(aa) * 7.6, 0, Math.sin(aa) * 7.6, 0.20, clsOf(h), 'ring');
          }
          for (let k = 0; k < 6; k++) spawnSpark(xx, h, zz, COLORS.mid, 0.6);
        });
      };
    })(x, z));
  }
}

/** 假坠：紫色高空弹落到 1.78m 突然改成水平冲刺 —— 颜色说"还很高"，其实在打你腰 */
export function feint(): void {
  const n = boss.phase >= 3 ? 4 : 3;
  boss.flash = 0.45;
  for (let i = 0; i < n; i++) {
    const a = random() * TAU;
    const rr = rand(2.0, 5.4);
    let x = player.x + Math.cos(a) * rr;
    let z = player.z + Math.sin(a) * rr;
    const d = Math.hypot(x, z);
    if (d > ARENA_R - 1.5) { x *= (ARENA_R - 1.5) / d; z *= (ARENA_R - 1.5) / d; }

    addBullet(x, 8.6, z, 0, -13, 0, 0.30, 'high', 'feint');
    bullets[bullets.length - 1].fuse = 1;   // 1 = 还没变向
  }
}

/** 生成时用的粗分段（与 clsName 的段界不同，1:1 保留历史行为） */
function clsOf(h: number): HClass {
  return h < 1.05 ? 'low' : h < 2.05 ? 'mid' : 'high';
}
