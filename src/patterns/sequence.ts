/**
 * 出招顺序。
 *
 * 默认不再是「随机抽」——随机抽意味着三次测试跑的不是同一套弹幕，结论不可比。
 * 每个阶段走一条固定序列，教学顺序按"先教最容易读的，再教需要新动作的"排：
 *
 *   难度 1（标准）  只教四件事：跳、读三层、横移、连续高度
 *   难度 2（高压）  上手就是"侧移没用，只能跳"的跃墙，再叠预判、诱饵、涌裂
 *
 * `?seq=random` 可以退回随机抽，用来对照"固定顺序是否改变了难度曲线"。
 */
import type { DifficultyKey, PatternName } from '../types';

export type SequenceMode = 'sequence' | 'random';

let mode: SequenceMode = 'sequence';

export function getSequenceMode(): SequenceMode {
  return mode;
}

export function setSequenceMode(m: SequenceMode): void {
  mode = m;
}

/** 难度 1：16 种，按"跳 → 读三层 → 横移 → 三层齐发 → 跟高度"排 */
export const SEQUENCES: Record<number, PatternName[]> = {
  1: ['sweepLow', 'spread', 'rise', 'ring', 'stair'],
  2: ['sweepHigh', 'rain', 'satBurst', 'dive', 'lowHigh',
      'sweepLow', 'spread', 'rise', 'ring', 'stair'],
  3: ['wall', 'laser', 'orbit', 'mine', 'spiral', 'counterSpiral',
      'sweepHigh', 'rain', 'satBurst', 'dive', 'lowHigh',
      'sweepLow', 'spread', 'rise', 'ring', 'stair']
};

/**
 * 难度 2：新图案打头。
 *
 * 设计原则：**能靠侧移解决的，一律不算难**。
 * 所以 P1 第一招就是跃墙（横跨全场、没有缺口，只能跳），
 * 后面再叠"必须保持移动"的预判狙和"颜色说谎"的假坠。
 */
export const SEQUENCES_D2: Record<number, PatternName[]> = {
  // 跃墙（只能跳）→ 贴地扫 → 预判狙（站桩必中）→ 闸门（穿两道缺口）→ 涌裂 → 弥散
  1: ['jumpWall', 'sweepLow', 'sniper', 'gate', 'risenare', 'spread'],
  // 新几样先上，再回锅上一阶段
  2: ['jumpWall', 'sniper', 'gate', 'feint', 'risenare',
      'sweepHigh', 'rain', 'satBurst', 'lowHigh', 'dive', 'ring', 'stair'],
  // 需要读全局的放前面
  3: ['jumpWall', 'gate', 'sniper', 'feint', 'risenare', 'spiral', 'counterSpiral',
      'wall', 'laser', 'mine', 'orbit',
      'sweepLow', 'sweepHigh', 'rain', 'satBurst', 'dive', 'lowHigh', 'ring', 'stair']
};

export function sequenceFor(phase: number, difficulty: DifficultyKey = 1): PatternName[] {
  const table = difficulty === 2 ? SEQUENCES_D2 : SEQUENCES;
  return table[phase] || table[1];
}

/** 面板与 HUD 用的中文短名 + 解法提示 */
export const PATTERN_LABELS: Record<PatternName, { name: string; hint: string }> = {
  sweepLow: { name: '贴地扫', hint: '低空 0.55m —— 起跳' },
  sweepHigh: { name: '高空扫', hint: '高空 2.45m —— 别跳，从下面过' },
  spread: { name: '弥散', hint: '跨三个高度带 —— 看颜色选动作' },
  ring: { name: '环形', hint: '分层扩散 —— 一层一层处理' },
  stair: { name: '阶梯', hint: '高度逐级抬升 —— 跟着节奏抬/降' },
  rise: { name: '地涌', hint: '从地下升起 —— 必须横移，跳没用' },
  lowHigh: { name: '低接高', hint: '先低扫后高扫 —— 起跳节奏' },
  dive: { name: '俯冲', hint: '悬停读秒后砸落 —— 离开地面圈' },
  rain: { name: '落点雨', hint: '垂直下落 —— 离开地面圈' },
  mine: { name: '地雷', hint: '读秒炸一圈低空弹 —— 离开圈' },
  laser: { name: '激光', hint: '低扫/高扫 —— 看扫过的高度决定跳否' },
  wall: { name: '墙缝', hint: '整面弹墙推进 —— 冲那个缺口' },
  spiral: { name: '螺旋', hint: '高度做正弦 —— 找缝穿过去' },
  counterSpiral: { name: '双螺旋', hint: '两股反向交错 —— 跟着缝走' },
  satBurst: { name: '卫星', hint: '三个发射源 —— 先认源再看弹' },
  orbit: { name: '追踪', hint: '会拐弯 —— 绕圈拉扯' },

  // ---- 难度 2 新增 ----
  jumpWall: { name: '跃墙', hint: '横跨全场、没有缺口 —— 侧移必中，只能跳；高墙那波别跳' },
  sniper: { name: '预判狙', hint: '按你的速度打提前量 —— 站着不动会被三发同时命中' },
  gate: { name: '闸门', hint: '两道墙缺口错开 —— 穿过第一道后必须横移到第二个口' },
  feint: { name: '假坠', hint: '紫色下落，到半空突然改水平冲你 —— 颜色在说谎' },
  risenare: { name: '涌裂', hint: '地涌升到 2.9m 炸开一圈 —— 起手就要拉开距离' }
};
