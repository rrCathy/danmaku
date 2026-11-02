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

/**
 * 难度 3：形状弹幕 · 微操穿梭（参考东方）。
 *
 * 全部是规则形状 —— 花瓣 / 光芒 / 雨 / 喷泉 / 柱 / 锥，
 * 每一招的缝隙都清晰可读，靠在缝里挪一小步过。
 * 顺序：先教形状阅读（花瓣/圆圈/放射/螺旋），再教环境弹幕（雨/喷泉），最后全混合。
 */
export const SEQUENCES_D3: Record<number, PatternName[]> = {
  // 花瓣（形状基线）→ 圆圈（同心对照）→ 放射光芒 → 螺旋 → 喷泉（抛物线入门）
  1: ['petal', 'ring', 'radial', 'spiral', 'fountain'],
  // 环境弹幕打头：全图雨（读多个圈）→ 锥（贴边微移）→ 花瓣 → 双螺旋 → 喷泉 → 光芒
  2: ['downpour', 'cone', 'petal', 'counterSpiral', 'fountain', 'radial', 'ring', 'spiral'],
  // 反雨最难读（预判上升），放开头压轴交替；墙类一概不进
  3: ['uprain', 'cone', 'downpour', 'petal', 'fountain', 'spiral', 'counterSpiral',
      'radial', 'ring', 'feint', 'satBurst']
};

/**
 * 难度 4：跳跃必要性（v1.15）。
 *
 * 主题一句话：**站着不动的解不存在，但一直跳也不是解**。
 * 低空弹（0.45~0.55）站着重、跳起躲；高弹（2.3~2.35）站着躲、跳起重。
 * 成对出现时（波浪 / 堆叠 / 东方对称 / 风车）要求「跟着节奏跳、跟着节奏落」。
 *
 * 顺序：先教"读"（自机狙/随机弹/闪电/手雷/烟雾），
 * 再教"跳"（波浪/龙骨炮/扫描线/风车），最后叠成节奏（堆叠/东方对称）。
 */
export const SEQUENCES_D4: Record<number, PatternName[]> = {
  // P1：环 + 一次波浪。环类同场也好看（同心的），所以敢让它们隔一招
  1: ['toho', 'lightning', 'wave', 'aimed', 'ring', 'smoke'],
  // P2：**只放推进类**（波浪 / 龙骨炮 / 扫描线），中间必定隔一个点状招；
  //     不含风车 —— 风车在 P3，扫描线在 P2，两者永不同场
  2: ['wave', 'smoke', 'gaster', 'aimed', 'sweepLine', 'lightning'],
  // P3：**只放环 / 旋转类**（堆叠 / 风车 / 东方对称），不放扫描线和波浪
  3: ['stack', 'grenade', 'pinwheel', 'smoke', 'toho', 'lightning', 'aimed', 'random']
};

export function sequenceFor(phase: number, difficulty: DifficultyKey = 1): PatternName[] {
  const table = difficulty === 4 ? SEQUENCES_D4
    : difficulty === 3 ? SEQUENCES_D3
    : difficulty === 2 ? SEQUENCES_D2 : SEQUENCES;
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
  risenare: { name: '涌裂', hint: '地涌升到 2.9m 炸开一圈 —— 起手就要拉开距离' },

  // ---- 难度 3 新增（形状弹幕 · 微操）----
  petal: { name: '花瓣环', hint: '俯视呈花瓣 —— 沿花瓣之间的沟挪，别横穿' },
  radial: { name: '放射光芒', hint: '多束光线，束间低/高交替 —— 挪到两束之间的扇形缝' },
  downpour: { name: '全图雨', hint: '满场读秒落雨 —— 看亮圈挪半步，别跑，跑会撞下一批' },
  fountain: { name: '喷泉', hint: '抛物线落点在环带 —— 贴 boss 或退到 12m 外都安全' },
  uprain: { name: '反雨', hint: '从地面背面穿地升到 1.5m —— 横移出柱，或跳过它的顶' },
  cone: { name: '放射锥', hint: '锥状喷射、逐波重瞄 —— 贴着锥边持续微移' },

  // ---- 难度 4 新增（跳跃必要性）----
  aimed: { name: '自机狙', hint: '每发都瞄你现在的位置 —— 一直走，别停' },
  random: { name: '随机弹', hint: '方向和速度都随机 —— 读密度，找缝' },
  smoke: { name: '烟雾弹', hint: '爆开一团滞空的云 —— 绕开它，别往里穿' },
  lightning: { name: '闪电', hint: '落点圈只亮 0.35 秒 —— 看到就挪，别等' },
  grenade: { name: '手雷', hint: '读秒后半球炸开 —— 读秒期间先拉开距离' },
  wave: { name: '波浪', hint: '高度做正弦 —— 波谷跳、波峰落地，跟着波形走' },
  sweepLine: { name: '扫描线', hint: '低墙在场地里来回扫 —— 跳过去，等它折返会挨打' },
  gaster: { name: '龙骨炮', hint: '一束粗弹贴地推过来 —— 跳过它，或离开这条线' },
  pinwheel: { name: '风车', hint: '高低臂交替旋转 —— 跟着臂缝走，别乱跳' },
  toho: { name: '东方对称', hint: '16 向高低交替 —— 跳低臂、落高臂' },
  stack: { name: '堆叠', hint: '三层交错 + 高空钉 —— 必须跳，但别一直跳' }
};
