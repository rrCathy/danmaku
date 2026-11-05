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
  /* FCC 专场 · **状态链编排**（v5.4，用户「招式的连接」观点落地；v5.4.1 按用户复核修正两处）。
   * 三条同族链：链首生成一次晶体，链内招**接管同一批弹**（不 retire、不重新生成，
   * 只切 LatticeFrame 驱动字段）；链尾接休息段硬切。跨族（轴对齐 / 立式）不接管。
   * 轮长 = 各招 holdCd 之和（v5.4.3 二次收紧后）：P1 ≈ 17.5s（5 招）→ P2 ≈ 15s（3 招）→ P3 ≈ 34.5s（8 招）。
   * 详见 docs/danmaku-framework.md §3.3.1 / §3.3.2。 */
  // P1 · 轴对齐链：长出 → 脉动 → 密度波 → 翻滚 ‖ 合胞（休息）
  1: ['latticeBurst', 'latticeBreath', 'latticePhonon', 'latticeSpin', 'latticeAssemble'],
  // P2 · 立式链：六层摞成静止全空间 → 逐层化雨落尽 ‖ 晶锥（休息）—— 用户指定：叠层直接接晶雨
  2: ['latticeStack', 'latticeRain', 'latticeCone'],
  // P3 · 轴对齐链：漏光晶体钉场 → 劈裂 → BCC 定型（链尾，晶体定型后由 life 自然散场）
  //     ‖ 螺旋 → 111 → 位错 → 晶轮 → 齐狙（休息段，全部硬切）
  //     螺旋不进链（用户 2026-11-04 指正）：接管 = 继承滑移劈出的上下错位晶体，旋转下沉时
  //     错位跟着转，怎么排都丑 —— 错位长在弹上，不是相邻关系问题，只有硬切自带新晶体才干净
  3: ['latticeVac', 'latticeShear', 'latticePhase',
      'latticeScrew', 'lattice111', 'latticeDisloc', 'latticeWheel', 'latticeVolley']
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
  stack: { name: '堆叠', hint: '三层交错 + 高空钉 —— 必须跳，但别一直跳' },

  // ---- 难度 4 新增（晶格系 · 沿体对角线运动的真三维晶体）----
  lattice111: { name: '晶格·111', hint: 'FCC 晶片沿体对角线压下来 —— 密排面一层层扫过，ABC 堆垛没有站桩点' },
  latticeShear: { name: '晶格·滑移', hint: '晶体沿对角滑移面裂成两半反向错开 —— 裂缝是唯一通道' },
  latticeWheel: { name: '晶轮', hint: '六条密排晶列边转边涨到场地边缘 —— 待在臂缝里' },
  latticeSpin: { name: '晶格·自旋', hint: '晶体钉在场心绕水平轴翻滚 —— 脚下的点卷上头顶、头顶的点卷下来；离翻滚轴越远上下扫得越快，场心有颗钉子别站' },
  latticeVac: { name: '晶格·空位', hint: '晶体漏光了 30% 的点 —— 空位串成的通道就是路，快速读图穿过去' },
  latticeScrew: { name: '晶格·螺旋', hint: '晶体边转边沉 —— 网眼带着你转，同时要读层跳蹲，双层威胁' },
  latticeBreath: { name: '晶格·呼吸', hint: '晶体原地缩放脉动 —— 网眼按节拍开合，读秒决定动没动' },
  latticePhonon: { name: '晶格·声子', hint: '一列密度波在晶体里跑 —— 波前挤死、波谷大开，读波的走向' },
  latticeDisloc: { name: '晶格·位错', hint: '立式晶体的密排层间往复滑移 —— 错位阶跃每 2.2s 横扫一遍，安全缝每拍跳一个 ABC 偏移，跟着缝挪' },
  latticePhase: { name: '晶格·相变', hint: '晶体流动重排成另一种结构 —— 迁移期网眼全失效，定型瞬间看脚下' },
  latticeBurst: { name: '晶格·聚散', hint: '所有弹从场心长成全空间晶体 —— 链首，长出后交给下一棒继续演化（单独选招时才解体飞散）' },
  latticeVolley: { name: '晶格·齐狙', hint: '稀疏晶体逐点朝你开火 —— 读发射顺序，子弹间隔走位' },
  latticeRain: { name: '晶格·晶雨', hint: '晶体压阵 + 落点雨 —— 晶体管站位，雨管脚下，两边都要读' },
  // ---- v5.3：晶胞 / 层为单位的三种新招 ----
  latticeAssemble: { name: '晶格·合胞', hint: '8 个晶胞从空间四处飞到你脚下拼成 2×2×2 晶体 —— 站桩必被包住，拼合前先走开' },
  latticeStack: { name: '晶格·叠层', hint: 'A/B/C 层从远处一层层横扫进场、摞成全空间晶体 —— 读下一层从哪来，别站在扫过的线上' },
  latticeCone: { name: '晶格·晶锥', hint: '8 个晶胞（2³）从一点爆出，各自边飞边撑大 —— 锥轴锁你施法瞬间的位置，贴锥边持续挪' },
  wallFlow: { name: '对流墙', hint: '左右两列高过二段跳的墙反向滑动 —— 对齐时是一整面无缝墙，在原点附近绕圈等错开的缝再横穿' },
  wallFlowY: { name: '对流墙·立', hint: '把整招立起来：墙法向 y、沿 y 上下反向滑动，每片是半个场地大的水平板；对齐时拼成整面，等错开的缝横穿' }
};
