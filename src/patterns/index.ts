/**
 * 出招总表。
 *
 * 阶段解锁：P1 五种 → P2 十种 → P3 全 16 种，随机抽取。
 * 每个 case 只负责「什么时候、调用哪个图案」，图案本身在 shots.ts。
 *
 * 想复现某一局：见 main.ts 的 ?pat= / ?seed= 与 __dbg.run()。
 */
import { boss, later, lasers, walls } from '../state';
import { fanShot, ringShot, spreadShot } from './emitters';
import {
  counterSpiral, diveShot, laserSweep, lowHigh, mineShot, orbitShot,
  rainShot, riseShot, satBurst, spiralShot, stairShot, wallShot
} from './shots';

export type PatternName =
  | 'sweepLow' | 'spread' | 'ring' | 'stair' | 'rise'
  | 'sweepHigh' | 'rain' | 'satBurst' | 'dive' | 'lowHigh'
  | 'orbit' | 'spiral' | 'wall' | 'laser' | 'mine' | 'counterSpiral';

/** 每个阶段能抽到的图案池 */
export const PATTERNS: Record<number, PatternName[]> = {
  1: ['sweepLow', 'spread', 'ring', 'stair', 'rise'],
  2: ['sweepLow', 'spread', 'sweepHigh', 'rain', 'ring', 'satBurst', 'stair', 'dive', 'rise', 'lowHigh'],
  3: ['sweepLow', 'sweepHigh', 'spread', 'rain', 'orbit', 'ring', 'spiral', 'wall', 'laser', 'satBurst',
      'stair', 'dive', 'mine', 'rise', 'counterSpiral', 'lowHigh']
};

/** 全部 16 种，按"想单独测某个图案"的顺序排（给训练场 / ?pat= 用） */
export const ALL_PATTERNS: PatternName[] = [
  'sweepLow', 'sweepHigh', 'spread', 'ring', 'stair', 'rise', 'lowHigh', 'dive',
  'rain', 'mine', 'laser', 'wall', 'spiral', 'counterSpiral', 'satBurst', 'orbit'
];

export function pickPattern(): PatternName {
  const pool = PATTERNS[boss.phase] || PATTERNS[1];
  let p = pool[Math.floor(Math.random() * pool.length)];
  if (p === boss.last && pool.length > 1) {
    p = pool[(pool.indexOf(p) + 1) % pool.length];
  }
  return p;
}

export function runPattern(name: PatternName | string): void {
  boss.last = name as string;
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
      later(0.75, function () { ringShot(boss, 1.6, 20, 8.8, 0.22); });
      if (boss.phase >= 3) later(1.1, function () { ringShot(boss, 2.55, 20, 8.2, 0.24); });
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
  }
}
