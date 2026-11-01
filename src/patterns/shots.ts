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

/** 墙缝：一整面立体弹墙推进，只留一个缺口 */
export function wallShot(): void {
  const dirA = random() * TAU;
  const nx = Math.cos(dirA), nz = Math.sin(dirA);   // 推进方向（朝场地中心）
  const tx = -nz, tz = nx;                          // 墙面切线
  const D = ARENA_R - 0.4;
  const halfW = 8.5;

  // 缺口放在玩家切线位置附近（保证可达但需要移动）
  const pu = player.x * tx + player.z * tz;
  const gapPos = clamp(pu + rand(-2.6, 2.6), -halfW + 1.6, halfW - 1.6);
  const gapW = 1.35;

  walls.push({ nx, nz, tx, tz, D, halfW, gapPos, gapW, t: 1.15, dur: 1.15 });
  boss.flash = 0.5;

  later(1.15, function () {
    if (!boss.alive) return;
    const rows = 4;
    const sp = 7.2;
    const step = 0.66;
    for (let u = -halfW; u <= halfW; u += step) {
      if (Math.abs(u - gapPos) < gapW) continue;    // 缺口
      for (let k = 0; k < rows; k++) {
        const h = 0.42 + k * 0.82;
        const px = nx * D + tx * u;
        const pz = nz * D + tz * u;
        addBullet(px, h, pz, -nx * sp, 0, -nz * sp, 0.21, clsOf(h), 'wall');
      }
    }
    // 缺口地面标记，帮玩家确认“洞在这里”
    const gx = nx * (D - 3) + tx * gapPos;
    const gz = nz * (D - 3) + tz * gapPos;
    rings.push({ x: gx, z: gz, r: gapW + 0.5, t: 0.55, dur: 0.55, cls: 'gap' });
  });
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

/** 生成时用的粗分段（与 clsName 的段界不同，1:1 保留历史行为） */
function clsOf(h: number): HClass {
  return h < 1.05 ? 'low' : h < 2.05 ? 'mid' : 'high';
}
