/**
 * 出招总表。
 *
 * 阶段解锁：P1 五种 → P2 十种 → P3 全 16 种，随机抽取。
 * 每个 case 只负责「什么时候、调用哪个图案」，图案本身在 shots.ts。
 *
 * 想复现某一局：见 main.ts 的 ?pat= / ?seed= 与 __dbg.run()。
 */
import { boss, later, lasers, session, training, walls } from '../state';
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
import {
  lattice111, latticeShear, latticeWheel, latticeSpin,
  latticeVac, latticeScrew, latticeBreath, latticePhonon, latticeDisloc,
  latticePhase, latticeBurst, latticeVolley, latticeRain,
  latticeAssemble, latticeStack, latticeCone
} from './lattice';
import { wallFlow, wallFlowY } from './wallflow';

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

/** 全部招式（数量以本表为准），按"想单独测某个图案"的顺序排（给训练场 / ?pat= 用） */
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
  'wave', 'sweepLine', 'gaster', 'pinwheel', 'toho', 'stack',
  // 难度 4 晶格系
  'lattice111', 'latticeShear', 'latticeWheel', 'latticeSpin',
  // 晶格系 v5.2 批次
  'latticeVac', 'latticeScrew', 'latticeBreath', 'latticePhonon', 'latticeDisloc',
  'latticePhase', 'latticeBurst', 'latticeVolley', 'latticeRain',
  // v5.3：晶胞 / 层为单位的三种新招
  'latticeAssemble', 'latticeStack', 'latticeCone',
  // 对流墙系：只进训练场 / ?pat=，暂不进任何难度序列
  'wallFlow',
  // 第一变体：把招式立起来（法向 y）
  'wallFlowY'
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
    case 'ring': {
      // L4 用 32 颗 × 3 层：20 颗在 18m 场地上间距 5.6m，看着像稀疏的点
      const dense = session.difficulty === 4;
      const cnt = dense ? 32 : 20;
      boss.flash = 0.4;
      later(0.4, function () { ringShot(boss, 0.55, cnt, 9.5, 0.22); });
      later(0.75, function () { ringShot(boss, 1.05, cnt, 8.8, 0.22); });
      if (dense || boss.phase >= 3) later(1.1, function () { ringShot(boss, 2.3, cnt, 8.2, 0.24); });
      break;
    }
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

    /* ---- 难度 4（晶格系 · 状态链编排，v5.4.3 二次紧凑）----
     * 链内招接管同一批弹，holdCd 收到 2~7s：每招只留「够读一遍」的窗口，
     * 消灭一切「晶体钉着不动干等」。轮长 P1 17.5 / P2 15 / P3 34.5s。 */
    case 'lattice111':
      boss.flash = 0.5;
      boss.holdCd = 4;                    // 漂移扫过 ~4s（休息段，完整读法）
      later(0.5, lattice111);
      break;
    case 'latticeShear':
      boss.flash = 0.5;
      boss.holdCd = 4;                    // 裂缝张开 4s ≈ 11m
      later(0.5, latticeShear);
      break;
    case 'latticeWheel':
      boss.flash = 0.45;
      boss.holdCd = 4.5;
      later(0.45, latticeWheel);
      break;
    case 'latticeSpin':
      boss.flash = 0.5;
      boss.holdCd = 4;                    // omega 提到 1.3，4s ≈ 0.83 圈
      later(0.5, latticeSpin);
      break;
    case 'latticeVac':
      boss.flash = 0.5;
      boss.holdCd = 2.5;                  // 链首漏光钉场：最短的一棒，立刻交滑移
      later(0.5, latticeVac);
      break;
    case 'latticeScrew':
      boss.flash = 0.5;
      boss.holdCd = 3.5;                  // 下沉 2s 停住交棒给相变
      later(0.5, latticeScrew);
      break;
    case 'latticeBreath':
      boss.flash = 0.45;
      boss.holdCd = 4;                    // 1.5+ 个脉动周期
      later(0.45, latticeBreath);
      break;
    case 'latticePhonon':
      boss.flash = 0.45;
      boss.holdCd = 4;                    // 密度波扫过一轮半
      later(0.45, latticePhonon);
      break;
    case 'latticeDisloc':
      boss.flash = 0.45;
      boss.holdCd = 4.5;                  // 两遍翻转
      later(0.45, latticeDisloc);
      break;
    case 'latticePhase':
      boss.flash = 0.5;
      boss.holdCd = 4.5;                  // 静止 0.6 + 迁移 2 + BCC 驻留 1.9
      later(0.5, latticePhase);
      break;
    case 'latticeBurst':
      boss.flash = 0.4;
      boss.holdCd = 3.5;                  // 长出 0.7 + 驻留交棒 2.8（链内不解体）
      later(0.4, latticeBurst);
      break;
    case 'latticeVolley':
      boss.flash = 0.4;
      boss.holdCd = 7;                    // 125 发 × 0.05s = 6.25s 射完为止
      later(0.4, latticeVolley);
      break;
    case 'latticeRain':
      boss.flash = 0.5;
      boss.holdCd = 5;                    // 层间隔 0.75s，6 层 5s 内落尽
      later(0.5, latticeRain);
      break;
    /* ---- v5.3：晶胞 / 层为单位的三种新招 ---- */
    case 'latticeAssemble':
      boss.flash = 0.5;
      boss.holdCd = 2;                    // 前摇 0.5 + 拼合 0.8 + 驻留 0.7s
      later(0.5, latticeAssemble);
      break;
    case 'latticeStack':
      boss.flash = 0.5;
      boss.holdCd = 6;                    // 6 层 × 0.75s + 0.6s 飞行 + 驻留
      later(0.5, latticeStack);
      break;
    case 'latticeCone':
      boss.flash = 0.45;
      boss.holdCd = 4;
      later(0.45, latticeCone);
      break;
    /* 对流墙系底座招：不设 holdCd（暂不进难度序列），只由训练场 / ?pat= 触发。
     * 训练场重放看的是 Bullet.life，不是 holdCd —— 两套时钟别混。 */
    case 'wallFlow':
      boss.flash = 0.5;
      later(0.5, wallFlow);
      break;
    case 'wallFlowY':
      boss.flash = 0.5;
      // 训练场「间隔」档位在无限流下是**空间墙距**（m），不是补墙秒数：
      // 0.4 / 1 / 2 → 9 / 13.5 / 18m，越调越宽松，最小也等于一次性模式的 gap=9m。
      later(0.5, function () {
        const sg = training.gap <= 0.5 ? 9 : training.gap <= 1 ? 13.5 : 18;
        wallFlowY(training.stream, sg);
      });
      break;
  }
}
