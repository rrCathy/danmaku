/**
 * 出招总表。
 *
 * 阶段解锁：P1 五种 → P2 十种 → P3 全 16 种，随机抽取。
 * 每个 case 只负责「什么时候、调用哪个图案」，图案本身在 shots.ts。
 *
 * 想复现某一局：见 main.ts 的 ?pat= / ?seed= 与 __dbg.run()。
 */
import { boss, later, lasers, session, walls } from '../state';
import { SEQUENCES_D2, SEQUENCES_D3, SEQUENCES_D4, getSequenceMode, sequenceFor } from './sequence';
import { random } from '../core/random';
import { fanShot, ringShot, spreadShot } from './emitters';
import {
  aimedShot, coneBurst, counterSpiral, diveShot, downpour, feint, fountain, gasterBlast,
  gate, grenadeShot, jumpWall, laserSweep, lightning, lowHigh, mineShot, orbitShot,
  petalRing, pinwheelShot, radialRays, rainShot, randomShot, risenare, riseShot,
  satBurst, smokeShot, sniper, spiralShot, stackWaves, stairShot, sweepLineShot,
  tohoRing, uprain, wallShot, waveShot
} from './shots';

import type { PatternName } from '../types';
export type { PatternName } from '../types';
export { PATTERN_LABELS } from './sequence';

/** 每个阶段能抽到的图案池 */
export const PATTERNS: Record<number, PatternName[]> = {
  1: ['sweepLow', 'spread', 'ring', 'stair', 'rise'],
  2: ['sweepLow', 'spread', 'sweepHigh', 'rain', 'ring', 'satBurst', 'stair', 'dive', 'rise', 'lowHigh'],
  3: ['sweepLow', 'sweepHigh', 'spread', 'rain', 'orbit', 'ring', 'spiral', 'wall', 'laser', 'satBurst',
      'stair', 'dive', 'mine', 'rise', 'counterSpiral', 'lowHigh']
};

/** 难度 2 的随机池：直接取该阶段序列去重 —— 序列和池子不会打架 */
const D2_POOL: Record<number, PatternName[]> = {};
for (let ph = 1; ph <= 3; ph++) {
  D2_POOL[ph] = Array.from(new Set(SEQUENCES_D2[ph]));
}

/** 难度 3 的随机池：同上，取序列去重（墙类从一开始就不在序列里） */
const D3_POOL: Record<number, PatternName[]> = {};
for (let ph = 1; ph <= 3; ph++) {
  D3_POOL[ph] = Array.from(new Set(SEQUENCES_D3[ph]));
}

/** 难度 4 的随机池：同上。新语言专场，混少量 L3 的对称形状 */
const D4_POOL: Record<number, PatternName[]> = {};
for (let ph = 1; ph <= 3; ph++) {
  D4_POOL[ph] = Array.from(new Set(SEQUENCES_D4[ph]));
}

export function poolFor(phase: number): PatternName[] {
  if (session.difficulty === 4) return D4_POOL[phase] || D4_POOL[1];
  if (session.difficulty === 3) return D3_POOL[phase] || D3_POOL[1];
  if (session.difficulty === 2) return D2_POOL[phase] || D2_POOL[1];
  return PATTERNS[phase] || PATTERNS[1];
}

/** 全部 27 种，按"想单独测某个图案"的顺序排（给训练场 / ?pat= 用） */
export const ALL_PATTERNS: PatternName[] = [
  // 难度 1
  'sweepLow', 'sweepHigh', 'spread', 'ring', 'stair', 'rise', 'lowHigh', 'dive',
  'rain', 'mine', 'laser', 'wall', 'spiral', 'counterSpiral', 'satBurst', 'orbit',
  // 难度 2
  'jumpWall', 'sniper', 'gate', 'feint', 'risenare',
  // 难度 3（形状弹幕 · 微操）
  'petal', 'radial', 'downpour', 'fountain', 'uprain', 'cone',
  // 难度 4（跳跃必要性）
  'aimed', 'random', 'smoke', 'lightning', 'grenade',
  'wave', 'sweepLine', 'gaster', 'pinwheel', 'toho', 'stack'
];

/**
 * 抽下一招。
 *
 * 默认走固定序列（`patterns/sequence.ts` 的 SEQUENCES），游标存在 `boss.seq` 上，
 * 阶段切换时归零 —— 每个阶段都从该阶段的第一招开始教。
 * `?seq=random` 退回 v0.6 的随机抽，用于对照。
 */
export function pickPattern(): PatternName {
  if (getSequenceMode() === 'sequence') {
    const seq = sequenceFor(boss.phase, session.difficulty);
    const name = seq[boss.seq % seq.length];
    boss.seq++;
    return name;
  }

  // 随机模式：池内随机 + 避免连续重复
  const pool = poolFor(boss.phase);
  let p = pool[Math.floor(random() * pool.length)];
  if (p === boss.last && pool.length > 1) {
    p = pool[(pool.indexOf(p) + 1) % pool.length];
  }
  return p;
}

export function runPattern(name: PatternName | string): void {
  boss.last = name as string;
  boss.cast.push(boss.last);
  if (boss.cast.length > 48) boss.cast.shift();
  switch (name) {
    case 'sweepLow':
      boss.flash = 0.55;
      later(0.55, function () { fanShot(0.55, 7, 14, 0.22, 'low', 2.5); });
      break;
    case 'sweepHigh':
      boss.flash = 0.5;
      later(0.5, function () { fanShot(2.45, 7, 14.5, 0.25, 'high', 2.5); });
      break;
    case 'spread':
      boss.flash = 0.35;
      later(0.35, spreadShot);
      break;
    case 'rain':
      boss.flash = 0.4;
      later(0.3, rainShot);
      break;
    case 'orbit':
      boss.flash = 0.45;
      later(0.45, orbitShot);
      break;
    case 'ring':
      boss.flash = 0.4;
      later(0.4, function () { ringShot(boss, 0.55, 20, 9.5, 0.22); });
      later(0.75, function () { ringShot(boss, 1.05, 20, 8.8, 0.22); });
      if (boss.phase >= 3) later(1.1, function () { ringShot(boss, 2.3, 20, 8.2, 0.24); });
      break;
    case 'spiral':
      boss.flash = 0.4;
      later(0.4, spiralShot);
      break;
    case 'wall':
      if (walls.length) break;       // 墙不叠加
      boss.flash = 0.5;
      later(0.3, wallShot);
      break;
    case 'laser':
      if (lasers.length) break;      // 激光不叠加，避免满屏红线
      boss.flash = 0.55;
      later(0.55, laserSweep);
      break;
    case 'satBurst':
      boss.flash = 0.35;
      later(0.35, satBurst);
      later(0.85, satBurst);
      break;
    case 'stair':
      boss.flash = 0.45;
      later(0.45, stairShot);
      break;
    case 'dive':
      boss.flash = 0.5;
      later(0.5, diveShot);
      break;
    case 'mine':
      boss.flash = 0.45;
      later(0.45, mineShot);
      break;
    case 'rise':
      boss.flash = 0.4;
      later(0.4, riseShot);
      break;
    case 'counterSpiral':
      boss.flash = 0.45;
      later(0.45, counterSpiral);
      break;
    case 'lowHigh':
      later(0.1, lowHigh);
      break;

    /* ---- 难度 2 ---- */
    case 'jumpWall':
      jumpWall();
      break;
    case 'sniper':
      sniper();
      break;
    case 'gate':
      gate();
      break;
    case 'feint':
      feint();
      break;
    case 'risenare':
      risenare();
      break;

    /* ---- 难度 3（形状弹幕 · 微操）---- */
    case 'petal':
      petalRing();
      break;
    case 'radial':
      radialRays();
      break;
    case 'downpour':
      downpour();
      break;
    case 'fountain':
      fountain();
      break;
    case 'uprain':
      uprain();
      break;
    case 'cone':
      coneBurst();
      break;

    /* ---- 难度 4（跳跃必要性）---- */
    case 'aimed':
      aimedShot();
      break;
    case 'random':
      randomShot();
      break;
    case 'smoke':
      smokeShot();
      break;
    case 'lightning':
      lightning();
      break;
    case 'grenade':
      grenadeShot();
      break;
    case 'wave':
      waveShot();
      break;
    case 'sweepLine':
      sweepLineShot();
      break;
    case 'gaster':
      gasterBlast();
      break;
    case 'pinwheel':
      pinwheelShot();
      break;
    case 'toho':
      tohoRing();
      break;
    case 'stack':
      stackWaves();
      break;
  }
}
