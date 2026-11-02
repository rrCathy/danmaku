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
        const h = 0.4 + (Math.sin(idx * 0.42) * 0.5 + 0.5) * 1.0;
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
    // 步长 0.60：r=0.21 时判定半宽 0.1932 + 玩家 0.13 = 0.3232，半间距 0.30
    // → 相邻砖判定重叠，修好 OBB 距离后仍然是无缝的整面墙（v1.14）
    const step = 0.60;
    for (let u = -halfW; u <= halfW; u += step) {
      if (Math.abs(u - gapPos) < gapW) continue;    // 缺口
      for (let k = 0; k < rows; k++) {
        const h = 0.42 + k * 0.56;
        const px = nx * D + tx * u;
        const pz = nz * D + tz * u;
        addBullet(px, h, pz, -nx * speed, 0, -nz * speed, 0.21, clsOf(h), 'wall', 'box', 2.2);
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
  lasers.push({ x: 0, z: 0, ang: base + Math.PI * 0.42, y: 2.1, spin: -0.52, warm: 1.6, life: 2.9, r: 0.32, cls: 'high' });
  boss.flash = 0.55;
}

/** 卫星齐射：从三个卫星各打一组瞄准弹（多发射源，考"认源"） */
export function satBurst(): void {
  const n = boss.phase >= 3 ? 3 : 2;
  for (let s = 0; s < boss.sats.length; s++) {
    const src = satPos(s);
    for (let i = 0; i < n; i++) {
      const h = 0.5 + i * 0.5;
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
        const h = 0.45 + idx * (1.85 / (N - 1));   // 0.45 → 2.3 逐级抬升（hit → 擦头 → 惩罚跳）
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
        const h1 = 0.4 + (Math.sin(idx * 0.36) * 0.5 + 0.5) * 1.1;
        const h2 = 0.4 + (Math.sin(idx * 0.36 + Math.PI) * 0.5 + 0.5) * 1.1;
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
      const v = aimVel(src, px, 2.15, pz, 13.2);
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
  const plan: Array<[number, number]> = [[0.35, 0.55], [1.55, 2.1], [2.75, 0.55]];
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
        // 覆盖整场：场地半径 18，所以横向铺 ±18 —— 侧面没有尽头可跑。
        // 步长 0.62 是判定上限：box 半宽 0.2116 + 玩家判定 0.13 → 相邻砖的
        // 判定要重叠，步长必须 < 0.683。取 0.62 留 0.06 余量，视觉缝 0.197m
        // （小于玩家判定直径 0.26），看着也过不去。
        for (let u = -ARENA_R; u <= ARENA_R + 0.01; u += 0.62) {
          addBullet(boss.x + tx * u, h, boss.z + tz * u,
            nx * sp, 0, nz * sp, 0.23, clsOf(h), 'wall', 'box', 2.2);
        }
      };
    })(hh));
  }
}

/** 预判狙：按玩家当前速度打提前量，三个低层高度同时来 —— 站着不动必被三发一起命中。四面体弹：锐利、无惯性暗示 */
export function sniper(): void {
  const rounds = boss.phase >= 3 ? 3 : 2;
  boss.flash = 0.45;
  for (let k = 0; k < rounds; k++) {
    later(0.45 + k * 0.62, function () {
      if (!boss.alive) return;
      const lead = 0.3;
      const tx = player.x + player.vx * lead;
      const tz = player.z + player.vz * lead;
      const hs = [0.5, 0.75, 1.0];
      for (let i = 0; i < hs.length; i++) {
        const v = aimVel(boss, tx, hs[i], tz, 16);
        addBullet(boss.x, boss.y, boss.z, v.x, v.y, v.z, 0.20, clsOf(hs[i]), 'sat', 'tetra', 1.35);
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
          const h = 1.15;
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

/* ============================================================
 * 难度 3 新增 · 形状弹幕与环境弹幕
 *
 * 主题：**细微移动**（参考东方）。每一招都是规则形状 ——
 * 花瓣 / 光芒 / 点阵雨 / 喷泉抛物线 / 上升柱 / 锥形喷射，
 * 缝隙清晰、有节奏，靠在缝里挪一小步过，不是靠跑。
 * ============================================================ */

/**
 * 花瓣环：径向速度按玫瑰线调制的一圈弹，俯视呈花瓣。
 *
 * v_r(θ) = base + amp·cos(k·θ)：快弹勾出花瓣的尖，慢弹聚在花瓣的谷，
 * 飞行 0.5s 后五瓣花就显形。缝隙（谷与谷之间）是安全区 —— 沿着沟挪。
 */
export function petalRing(): void {
  const ringsN = boss.phase >= 3 ? 3 : 2;
  boss.flash = 0.45;
  for (let rw = 0; rw < ringsN; rw++) {
    later(0.42 + rw * 0.62, (function (idx) {
      return function () {
        if (!boss.alive) return;
        const k = idx === 0 ? 5 : idx === 1 ? 6 : 4;   // 花瓣数逐圈变，读图不读记忆
        const rot = random() * TAU;
        const n = 24;
        const h = idx === 1 ? 1.05 : 0.75;             // 两圈错开高度：低圈要跳，中圈擦头
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rot;
          const vr = 7.2 + 2.9 * Math.cos(k * a);
          addBullet(boss.x, h, boss.z, Math.cos(a) * vr, 0, Math.sin(a) * vr,
            0.19, clsOf(h), 'petal');
        }
      };
    })(rw));
  }
}

/**
 * 放射光芒：从 boss 向多方向射出的「光线」—— 每束是一串等间隔连发。
 *
 * 高度在束与束之间低/高交替：一束贴地（起跳躲），相邻一束在 2.3m（别跳）。
 * 站在原地会被任意一束扫到，得挪到两束之间的扇形缝里。
 */
export function radialRays(): void {
  const beams = boss.phase >= 3 ? 12 : 10;
  const per = 5;
  const step = 0.088;            // 连发间隔 → 弹间距约 1.05m，正好一个人身位
  const sp = 12.2;
  boss.flash = 0.5;
  const base = random() * TAU;
  for (let b = 0; b < beams; b++) {
    const ang = base + (b / beams) * TAU;
    const h = (b % 2 === 0) ? 0.55 : 2.2;
    for (let i = 0; i < per; i++) {
      later(0.42 + i * step, (function (aa, hh) {
        return function () {
          if (!boss.alive) return;
          addBullet(boss.x, hh, boss.z, Math.cos(aa) * sp, 0, Math.sin(aa) * sp,
            0.18, clsOf(hh), 'radial', 'arrow', 3.6);
        };
      })(ang, h));
    }
  }
}

/**
 * 全图雨：整个场地下起规律的雨，地面亮圈读秒后垂直砸落。
 *
 * 落点按面积均匀撒开（√r 抵消面积偏置），不追着玩家 —— 这是「全地图」的字面意思。
 * 每颗都有亮圈 + 落速偏慢，所以难在「同时读多个圈」，不在反应速度。
 * 刻意压着密度：宁可稀一点，也别做成走位抽卡。
 */
export function downpour(): void {
  const waves = boss.phase >= 3 ? 3 : 2;
  const perWave = 16;
  boss.flash = 0.5;
  for (let w = 0; w < waves; w++) {
    later(0.45 + w * 0.92, (function (idx) {
      return function () {
        if (!boss.alive) return;
        for (let i = 0; i < perWave; i++) {
          const a = random() * TAU;
          const rr = Math.sqrt(random()) * (ARENA_R - 1.6);
          const x = Math.cos(a) * rr;
          const z = Math.sin(a) * rr;
          // 落点离玩家至少 1.1m：正下方不能天降，给读圈留出意义
          if (Math.hypot(x - player.x, z - player.z) < 1.1) continue;
          const delay = 1.05 + idx * 0.12 + i * 0.012;
          rings.push({ x, z, r: 1.05, t: delay, dur: delay });
          later(delay, (function (xx, zz) {
            return function () {
              addBullet(xx, 10.5, zz, 0, -11.5, 0, 0.30, 'rain', 'downpour', 'ellip', 1.9);
            };
          })(x, z));
        }
      };
    })(w));
  }
}

/**
 * 喷泉：从 boss 脚下把一圈圈子弹斜抛出去，画出抛物线落回地面。
 *
 * 带重力的弹（Bullet.grav），升的时候颜色红→青，落回来又青→红 ——
 * 读颜色就知道它在弧线的哪一段。圈与圈相位错开，俯视像转动的花瓣喷泉。
 * 落点带（半径约 10m 的环）是它的杀伤区，贴 boss 或远退都安全。
 */
export function fountain(): void {
  const ringsN = boss.phase >= 3 ? 4 : 3;
  const n = 16;
  const sp = 13.2;
  const elev = 58 * Math.PI / 180;
  const vy = Math.sin(elev) * sp;
  const vh = Math.cos(elev) * sp;
  const gx = boss.x, gz = boss.z;
  boss.flash = 0.5;
  for (let rw = 0; rw < ringsN; rw++) {
    later(0.42 + rw * 0.4, (function (idx) {
      return function () {
        const rot = idx * 0.34 + random() * 0.12;
        for (let i = 0; i < n; i++) {
          const a = rot + (i / n) * TAU;
          addBullet(gx, 0.35, gz, Math.cos(a) * vh, vy, Math.sin(a) * vh,
            0.21, 'low', 'fountain', 'ellip', 1.5);
          bullets[bullets.length - 1].grav = 15.5;
        }
        for (let k = 0; k < 5; k++) spawnSpark(gx, 0.4, gz, COLORS.low, 0.9);
      };
    })(rw));
  }
}

/**
 * 反雨（真反雨）：弹幕在**地面的背面**（负 y），像雨一样坠向地面、
 * 穿过地面继续升到约 1.5 m 就结束。
 *
 * 透过网格地板能看到红弹在地下"坠"过来 —— 穿地瞬间颜色红→橙→黄，
 * 就是"它到第几层了"的直读。柱子不追人：横移半步出柱，或跳过 1.5 m 的顶。
 */
export function uprain(): void {
  const waves = boss.phase >= 3 ? 3 : 2;
  const cols = 11;
  boss.flash = 0.55;
  for (let w = 0; w < waves; w++) {
    later(0.42 + w * 0.78, function () {
      if (!boss.alive) return;
      const base = random() * TAU;
      for (let i = 0; i < cols; i++) {
        const a = base + (i / cols) * TAU + rand(-0.12, 0.12);
        const rr = rand(2.4, 8.2);
        const x = boss.x + Math.cos(a) * rr;
        const z = boss.z + Math.sin(a) * rr;
        if (Math.hypot(x, z) > ARENA_R - 1.2) continue;

        rings.push({ x, z, r: 0.85, t: 0.62, dur: 0.62, cls: 'rise' });
        later(0.62, (function (xx, zz) {
          return function () {
            for (let s = 0; s < 3; s++) {
              later(s * 0.22, function () {
                // 负 y 出生 = 地面背面；匀速穿地，到 1.5 m 结束。箭头形强调"从下往上"
                addBullet(xx, -2.2, zz, 0, 5.8, 0, 0.24, 'low', 'uprain', 'arrow', 3.2);
              });
            }
          };
        })(x, z));
      }
    });
  }
}

/**
 * 放射锥：朝玩家方向喷出一束锥状弹幕，像手电筒的光锥。
 *
 * 锥内三层（中轴 1 + 内环 6 + 外环 12）：锥心最密，锥缘留缝。
 * 每一波重新瞄准 —— 站着不动会被下一波盖住，得贴着锥边持续微移。
 */
export function coneBurst(): void {
  const waves = boss.phase >= 3 ? 4 : 3;
  boss.flash = 0.5;
  for (let w = 0; w < waves; w++) {
    later(0.42 + w * 0.34, function () {
      if (!boss.alive) return;
      // 锥轴 = boss → 玩家（每波重瞄）
      let ax = player.x - boss.x;
      let ay = (player.y + 0.8) - boss.y;
      let az = player.z - boss.z;
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al; ay /= al; az /= al;
      // 与轴正交的两个基向量
      let p1x = -az, p1y = 0, p1z = ax;
      const p1l = Math.hypot(p1x, p1y, p1z) || 1;
      p1x /= p1l; p1z /= p1l;
      const p2x = ay * p1z - az * p1y;
      const p2y = az * p1x - ax * p1z;
      const p2z = ax * p1y - ay * p1x;

      const sp = 13.8;
      const layers: Array<[number, number, number]> = [
        [0, 1, 0],            // 中轴 1 发
        [0.105, 6, 0.5],      // 内环 6 发（半角约 6°）
        [0.25, 12, 0.2]       // 外环 12 发（半角约 14°）
      ];
      for (let li = 0; li < layers.length; li++) {
        const tanA = layers[li][0], cnt = layers[li][1], phase = layers[li][2];
        for (let i = 0; i < cnt; i++) {
          const phi = phase + (i / cnt) * TAU;
          const dx = ax + (p1x * Math.cos(phi) + p2x * Math.sin(phi)) * tanA;
          const dy = ay + (p1y * Math.cos(phi) + p2y * Math.sin(phi)) * tanA;
          const dz = az + (p1z * Math.cos(phi) + p2z * Math.sin(phi)) * tanA;
          const dl = Math.hypot(dx, dy, dz) || 1;
          addBullet(boss.x, boss.y, boss.z, dx / dl * sp, dy / dl * sp, dz / dl * sp,
            0.18, clsOf(boss.y), 'cone', 'octa', 3.4);
        }
      }
    });
  }
}

/* ============================================================
 * 难度 4：跳跃必要性（v1.15）
 *
 * 设计口径：站立判定 0.57~1.03，跳起判定 2.21~2.67。所以
 *   低空弹（y≈0.5）站着重、跳起躲  → 逼你跳
 *   高弹（y≈2.35）站着躲、跳起重   → 惩罚乱跳
 * 每一招都至少包含其中一种；成对出现的（波浪 / 堆叠 / 东方对称 / 风车）
 * 两种都有，要求「跟着节奏跳、跟着节奏落」。
 * ============================================================ */

/** 自机狙：每发都瞄玩家当前位置，不预判 —— 一直走就能甩开 */
export function aimedShot(): void {
  const n = 6;
  boss.flash = 0.4;
  for (let i = 0; i < n; i++) {
    later(0.3 + i * 0.15, function () {
      if (!boss.alive) return;
      const ty = player.y + 0.8;
      const v = aimVel(boss, player.x, ty, player.z, 13);
      addBullet(boss.x, boss.y, boss.z, v.x, v.y, v.z, 0.19, clsOf(ty), 'aim');
    });
  }
}

/** 随机弹：朝玩家一侧半圆里散开，速度/仰角都随机 —— 读密度找缝 */
export function randomShot(): void {
  const waves = 3;
  boss.flash = 0.45;
  const base = Math.atan2(player.z - boss.z, player.x - boss.x);
  for (let w = 0; w < waves; w++) {
    later(0.3 + w * 0.38, function () {
      if (!boss.alive) return;
      for (let i = 0; i < 14; i++) {
        const a = base + rand(-0.85, 0.85);
        const sp = rand(6.0, 9.0);
        const vy = rand(-0.38, -0.12) * sp;
        addBullet(boss.x, boss.y, boss.z, Math.cos(a) * sp, vy, Math.sin(a) * sp,
          0.19, clsOf(boss.y), 'rand');
      }
    });
  }
}

/** 烟雾弹：一点爆开，弹幕减速滞空、缓慢下沉 —— 覆盖一大片，绕远点 */
export function smokeShot(): void {
  const cx = player.x + rand(-1.6, 1.6);
  const cz = player.z + rand(-1.6, 1.6);
  rings.push({ x: cx, z: cz, r: 4.2, t: 0.7, dur: 0.7, cls: 'mine' });
  boss.flash = 0.45;
  later(0.7, function () {
    if (!boss.alive) return;
    for (let i = 0; i < 44; i++) {
      const a = random() * TAU;
      const el = rand(-0.1, 0.7);               // 略偏上，炸成一团烟
      const sp = rand(2.4, 4.8);                // 扩散直径 ≈ 7m，不会糊满半个场地
      const ce = Math.cos(el);
      addBullet(cx, 0.9, cz, Math.cos(a) * ce * sp, Math.sin(el) * sp, Math.sin(a) * ce * sp,
        0.22, 'mid', 'smoke');
      const b = bullets[bullets.length - 1];
      b.life = 3.2;
    }
    for (let k = 0; k < 12; k++) spawnSpark(cx, 0.9, cz, '190,205,225', 1.3);
  });
}

/** 闪电：落点圈只亮 0.35s，落速 −34 —— 比落点雨狠一档，靠反应 */
export function lightning(): void {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = player.x + rand(-1.6, 1.6);
    const z = player.z + rand(-1.6, 1.6);
    if (Math.hypot(x, z) > ARENA_R - 1.5) continue;
    const delay = 0.35 + i * 0.085;
    rings.push({ x: x, z: z, r: 1.0, t: delay, dur: delay });
    later(delay, (function (xx, zz) {
      return function () {
        addBullet(xx, 9.5, zz, 0, -34, 0, 0.2, 'rain', 'lightning');
        for (let k = 0; k < 6; k++) spawnSpark(xx, 9.5, zz, '255,240,180', 1.2);
      };
    })(x, z));
  }
}

/** 手雷：两枚错峰落地，半球形炸开 —— 先离开第一个圈，再躲第二个 */
export function grenadeShot(): void {
  for (let g = 0; g < 2; g++) {
    later(g * 0.5, (function (idx) {
      return function () {
        if (!boss.alive) return;
        const cx = player.x + rand(-2.8, 2.8);
        const cz = player.z + rand(-2.8, 2.8);
        if (Math.hypot(cx, cz) > ARENA_R - 1.2) return;
        rings.push({ x: cx, z: cz, r: 2.0, t: 0.8, dur: 0.8, cls: 'mine' });
        later(0.8, function () {
          if (!boss.alive) return;
          for (let i = 0; i < 26; i++) {
            const u = random();                        // 0..1 → 上半球
            const phi = random() * TAU;
            const s = Math.sqrt(1 - u * u);
            const sp = rand(10, 14);
            addBullet(cx, 0.5, cz, s * Math.cos(phi) * sp, u * sp + 1.4, s * Math.sin(phi) * sp,
              0.2, 'low', 'grenade');
            // 手雷弹走短抛物线：1.15s 后自然退场，不给它飞到 9m 高空的机会
            const bb = bullets[bullets.length - 1];
            bb.life = 1.15;
            bb.grav = 5.5;
          }
          for (let k = 0; k < 10; k++) spawnSpark(cx, 0.5, cz, COLORS.low, 1.5);
        });
      };
    })(g));
  }
}

/**
 * 波浪：三排会"翻滚"的立体浪。
 *
 * 关键不是排数，是 **y 随时间流动**：y = 1.45 + 1.15·sin(0.58u + φ + 2.2t)。
 * 之前写成静态波形（y 只依赖 u），波峰在切向上是钉死的 —— 玩家找到波峰站进去就永远安全。
 * 现在波峰以 ω/k ≈ 3.8 m/s 沿切向走，站在任何位置都会周期性地遇到浪谷，
 * 必须真的跳；三排相位差 1.6 rad（≈0.73s），正好卡一次跳跃的滞空。
 */
export function waveShot(): void {
  let nx = player.x - boss.x, nz = player.z - boss.z;
  const l = Math.hypot(nx, nz) || 1;
  nx /= l; nz /= l;
  const tx = -nz, tz = nx;
  const phase0 = random() * TAU;
  const sp = 7.2;
  const rows = 3;
  const gap = 3.2;
  boss.flash = 0.45;
  for (let r = 0; r < rows; r++) {
    const phase = phase0 + r * 1.6;
    const back = -r * gap;
    for (let u = -ARENA_R; u <= ARENA_R + 0.01; u += 0.6) {
      const y0 = 1.45 + 1.15 * Math.sin(u * 0.58 + phase);
      addBullet(boss.x + nx * back + tx * u, y0, boss.z + nz * back + tz * u,
        nx * sp, 0, nz * sp, 0.2, clsOf(y0), 'wave');
      const b = bullets[bullets.length - 1];
      b.waveU = u * 0.58 + phase;
      b.waveW = 2.2;
    }
  }
}

/** 扫描线：三道不同角度的低墙（相差 60°）依次扫过 —— 交叉扫描，跳的时机各不同 */
export function sweepLineShot(): void {
  const n = 3;
  boss.flash = 0.5;
  const baseAng = random() * TAU;
  for (let k = 0; k < n; k++) {
    later(k * 0.55, (function (idx) {
      return function () {
        if (!boss.alive) return;
        const ang = baseAng + idx * (Math.PI / 3);   // 0° / 60° / 120°
        const nx = Math.cos(ang), nz = Math.sin(ang);
        const tx = -nz, tz = nx;
        const dir = idx % 2 === 0 ? 1 : -1;
        const sp = 5.0 * dir;
        const start = dir > 0 ? -10 : 10;
        for (let u = -13; u <= 13.01; u += 0.62) {
          addBullet(nx * start + tx * u, 0.55, nz * start + tz * u,
            nx * sp, 0, nz * sp, 0.23, 'low', 'sweepLine', 'box', 2.2);
          const b = bullets[bullets.length - 1];
          b.oscLo = -10;
          b.oscHi = 10;
          b.life = 5.0;        // 扫一个来回就退场，别叠到下一招头上
        }
      };
    })(k));
  }
}

/** 龙骨炮：场地边缘的炮口读秒，然后朝玩家方向推出一束粗弹（低空，可跳过） */
export function gasterBlast(): void {
  const a = random() * TAU;
  const ex = Math.cos(a) * (ARENA_R - 2.5);
  const ez = Math.sin(a) * (ARENA_R - 2.5);
  let ux = player.x - ex, uz = player.z - ez;
  const l = Math.hypot(ux, uz) || 1;
  ux /= l; uz /= l;
  const px = -uz, pz = ux;

  rings.push({ x: ex, z: ez, r: 1.3, t: 0.65, dur: 0.65, cls: 'mine' });
  boss.flash = 0.5;
  later(0.65, function () {
    if (!boss.alive) return;
    for (let s = 0; s < l + 5; s += 0.7) {
      for (let oi = -1; oi <= 1; oi++) {
        const o = oi * 0.5;
        addBullet(ex + ux * s + px * o, 0.55, ez + uz * s + pz * o,
          ux * 15, 0, uz * 15, 0.2, 'low', 'gaster');
      }
    }
    for (let k = 0; k < 8; k++) spawnSpark(ex, 0.55, ez, COLORS.low, 1.2);
  });
}

/** 风车：3~4 条螺旋臂绕场地中心转，低臂/高臂交替 —— 跟缝走，别乱跳 */
export function pinwheelShot(): void {
  const arms = boss.phase >= 3 ? 4 : 3;
  const per = 7;
  const w = 1.05;
  boss.flash = 0.5;
  for (let a = 0; a < arms; a++) {
    const a0 = (a / arms) * TAU;
    const y = a % 2 === 0 ? 0.55 : 2.3;
    for (let j = 0; j < per; j++) {
      const rr = 2.2 + j * 1.7;
      addBullet(Math.cos(a0) * rr, y, Math.sin(a0) * rr, 0, 0, 0, 0.21, clsOf(y), 'pinwheel');
      const b = bullets[bullets.length - 1];
      b.orbA = a0;
      b.orbR = rr;
      b.orbW = w;
      b.orbX = 0;
      b.orbZ = 0;
      b.life = 4.2;          // 转两圈左右退场
    }
  }
}

/** 东方对称：16 向环，低/高交替，第二波把角度错半格 —— 跳低臂、落高臂 */
export function tohoRing(): void {
  const n = 16;
  const waves = boss.phase >= 3 ? 2 : 1;
  boss.flash = 0.5;
  for (let wv = 0; wv < waves; wv++) {
    later(0.35 + wv * 0.8, (function (phase) {
      return function () {
        if (!boss.alive) return;
        for (let i = 0; i < n; i++) {
          const a = phase + (i / n) * TAU;
          const y = i % 2 === 0 ? 0.5 : 2.3;
          const sp = 7.2;
          // 起点给 1.6m 半径：玩家正好站中心时也不会"出生即命中"
          addBullet(Math.cos(a) * 1.6, y, Math.sin(a) * 1.6,
            Math.cos(a) * sp, 0, Math.sin(a) * sp, 0.2, clsOf(y), 'toho');
        }
      };
    })((wv * Math.PI) / n));
  }
}

/** 堆叠：三层环从场地边缘向中心收（0.45/1.00/1.55）+ 高钉，逼你跳、又不许一直跳 */
export function stackWaves(): void {
  const n = 36;
  boss.flash = 0.5;
  for (let L = 0; L < 3; L++) {
    const y = 0.45 + L * 0.55;
    const phase = L * (TAU / (n * 2));       // 每层错半格
    later(L * 0.26, (function (yy, ph) {
      return function () {
        if (!boss.alive) return;
        for (let i = 0; i < n; i++) {
          const a = ph + (i / n) * TAU;
          const sp = 6.6;
          // 从边缘往中心收：站在场地中心也会被环扫到，没有死区
          addBullet(Math.cos(a) * 15.5, yy, Math.sin(a) * 15.5,
            -Math.cos(a) * sp, 0, -Math.sin(a) * sp, 0.19, clsOf(yy), 'stack');
          bullets[bullets.length - 1].life = 4.6;
        }
      };
    })(y, phase));
  }
  later(0.55, function () {
    if (!boss.alive) return;
    for (let i = 0; i < 8; i++) {
      const a = random() * TAU;
      const sp = 5.2;
      addBullet(Math.cos(a) * 0.9, 2.35, Math.sin(a) * 0.9,
        Math.cos(a) * sp, 0, Math.sin(a) * sp, 0.2, 'high', 'stack');
    }
  });
}

/** 生成时用的粗分段（与 clsName 的段界不同，1:1 保留历史行为） */
function clsOf(h: number): HClass {
  return h < 1.05 ? 'low' : h < 2.05 ? 'mid' : 'high';
}
