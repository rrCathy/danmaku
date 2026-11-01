/**
 * 出招顺序。
 *
 * 默认不再是「随机抽」——随机抽意味着三次测试跑的不是同一套弹幕，结论不可比。
 * 现在每个阶段走一条固定序列，教学顺序是按"先教最容易读的，再教需要新动作的"排的：
 *
 *   P1  只教四件事：跳、读三层、横移、连续高度
 *   P2  换成"别跳/离圈/认发射源"的活儿，再回锅 P1
 *   P3  上弹墙、激光、追踪这类需要读全局的
 *
 * `?seq=random` 可以退回 v0.6 的随机抽，用来对照"固定顺序是否改变了难度曲线"。
 */
import type { PatternName } from '../types';

export type SequenceMode = 'sequence' | 'random';

let mode: SequenceMode = 'sequence';

export function getSequenceMode(): SequenceMode {
  return mode;
}

export function setSequenceMode(m: SequenceMode): void {
  mode = m;
}

export const SEQUENCES: Record<number, PatternName[]> = {
  // 跳 → 读三层 → 横移（跳没用）→ 三层齐发 → 跟着高度抬
  1: ['sweepLow', 'spread', 'rise', 'ring', 'stair'],
  // 新机制先上，再回锅上一阶段
  2: ['sweepHigh', 'rain', 'satBurst', 'dive', 'lowHigh',
      'sweepLow', 'spread', 'rise', 'ring', 'stair'],
  // 需要读全局的放前面，后面是全部回收
  3: ['wall', 'laser', 'orbit', 'mine', 'spiral', 'counterSpiral',
      'sweepHigh', 'rain', 'satBurst', 'dive', 'lowHigh',
      'sweepLow', 'spread', 'rise', 'ring', 'stair']
};

export function sequenceFor(phase: number): PatternName[] {
  return SEQUENCES[phase] || SEQUENCES[1];
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
  orbit: { name: '追踪', hint: '会拐弯 —— 绕圈拉扯' }
};
