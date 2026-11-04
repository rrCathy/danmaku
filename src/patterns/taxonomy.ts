/**
 * 弹幕分类器 —— 把研究分类学固化成可查询的数据。
 *
 * 分类轴与词汇来自 docs/danmaku-3d-taxonomy.md（七条分类轴）与 docs/danmaku-framework.md（解法动词表），
 * 39 个条目逐一对应 taxonomy §8 纯度审计与 §1 威胁五类。
 *
 * 用途：
 *   1. 训练场选招面板按「主解法」分组过滤（主解法 = verbs[0]，训练聚类的分组键）；
 *   2. 关卡编排检查：coverageReport() 对固定序列做解法/威胁/纯度覆盖统计（__dbg.coverage）；
 *   3. 研究查询：PATTERN_TAXONOMY 直接挂 __dbg.taxonomy。
 *
 * 完整性由类型保证：Record<PatternName, …> —— 新增图案漏填分类直接编译报错。
 */
import type { PatternName } from '../types';
import { PATTERN_LABELS } from './sequence';

/* ============ 分类词汇 ============ */

/** 威胁几何：弹的世界线与玩家可达时空域的交集结构（taxonomy §1） */
export type ThreatClass = 'inBand' | 'marginal' | 'crossing' | 'transition';

/** 高度剖面：y(t) 的形状（taxonomy §2） */
export type HeightProfile =
  | 'fixed' | 'ladder' | 'spreadBands' | 'monotonic' | 'oscillating' | 'field' | 'ballistic' | 'hoverDrop';

/** 几何排列：载面 × 原语（taxonomy §3；ray 为激光类特有，lattice 为点阵族） */
export type ArrangeKind =
  | 'spread' | 'ring' | 'stack' | 'cone' | 'column' | 'dome' | 'field' | 'cluster' | 'ray' | 'lattice';

/** 瞄准语义（taxonomy §5） */
export type AimKind = 'none' | 'aimed' | 'predictive' | 'offset' | 'locked' | 'toward' | 'homing';

/** 源的形态（taxonomy §4） */
export type SourceKind =
  | 'boss' | 'blaster' | 'anchor' | 'aroundPlayer' | 'scatter' | 'edge' | 'underground';

/** 解法动词（framework §3.5 九词表） */
export type DodgeVerb =
  | 'jump' | 'restraint' | 'shift' | 'thread' | 'leaveCircle' | 'followGap' | 'wavePhase' | 'detour' | 'orbitPull';

/** 3D 纯度（taxonomy §8 审计） */
export type Purity = '2d' | '2.5d' | '3d';

/** 解法签名：动词 + 结构的指纹（taxonomy §6） */
export type SignatureId =
  | 'jump' | 'restraint' | 'jumpRhythm' | 'bandChoice' | 'colorRead' | 'gapThread'
  | 'followGap' | 'leaveCircle' | 'dualThreat' | 'readFake' | 'microStep' | 'orbitPull'
  | 'ballisticBand' | 'columnDodge' | 'detour' | 'wavePhase'
  | 'latticeBody' | 'latticeSlip' | 'latticeWheelSig' | 'latticeSpinSig'
  | 'latticeScrewSig' | 'latticeDislocSig' | 'latticePhaseSig' | 'latticeBurstSig'
  | 'latticeCellSig' | 'latticeStackSig' | 'latticeConeSig';

export interface PatternClass {
  /** 威胁类（可有多个，首个为主类） */
  threats: ThreatClass[];
  height: HeightProfile;
  arrange: ArrangeKind;
  aim: AimKind;
  source: SourceKind;
  /** 解法动词；**首个 = 主解法**，训练分组键 */
  verbs: DodgeVerb[];
  purity: Purity;
  sig: SignatureId;
}

/* ============ 39 图案分类总表 ============ */

export const PATTERN_TAXONOMY: Record<PatternName, PatternClass> = {
  /* ---- 难度 1 ---- */
  sweepLow:      { threats: ['marginal'],                 height: 'fixed',       arrange: 'spread',  aim: 'aimed',      source: 'boss',         verbs: ['jump'],                       purity: '3d',   sig: 'jump' },
  sweepHigh:     { threats: ['marginal'],                 height: 'fixed',       arrange: 'spread',  aim: 'aimed',      source: 'boss',         verbs: ['restraint'],                  purity: '3d',   sig: 'restraint' },
  spread:        { threats: ['inBand', 'marginal'],       height: 'spreadBands', arrange: 'cluster', aim: 'offset',     source: 'boss',         verbs: ['shift', 'jump'],              purity: '3d',   sig: 'colorRead' },
  ring:          { threats: ['inBand'],                   height: 'fixed',       arrange: 'ring',    aim: 'none',       source: 'boss',         verbs: ['thread'],                     purity: '2.5d', sig: 'gapThread' },
  stair:         { threats: ['inBand'],                   height: 'ladder',      arrange: 'cluster', aim: 'locked',     source: 'boss',         verbs: ['shift'],                      purity: '3d',   sig: 'microStep' },
  rise:          { threats: ['crossing'],                 height: 'monotonic',   arrange: 'column',  aim: 'none',       source: 'aroundPlayer', verbs: ['leaveCircle'],                purity: '3d',   sig: 'leaveCircle' },
  lowHigh:       { threats: ['marginal'],                 height: 'fixed',       arrange: 'spread',  aim: 'aimed',      source: 'boss',         verbs: ['jump', 'restraint'],          purity: '3d',   sig: 'jumpRhythm' },
  dive:          { threats: ['transition'],               height: 'hoverDrop',   arrange: 'cluster', aim: 'none',       source: 'aroundPlayer', verbs: ['leaveCircle'],                purity: '3d',   sig: 'leaveCircle' },
  rain:          { threats: ['crossing'],                 height: 'monotonic',   arrange: 'cluster', aim: 'none',       source: 'aroundPlayer', verbs: ['leaveCircle'],                purity: '3d',   sig: 'leaveCircle' },
  mine:          { threats: ['crossing', 'transition'],   height: 'monotonic',   arrange: 'cluster', aim: 'none',       source: 'aroundPlayer', verbs: ['leaveCircle', 'jump'],        purity: '3d',   sig: 'leaveCircle' },
  laser:         { threats: ['marginal'],                 height: 'fixed',       arrange: 'ray',     aim: 'none',       source: 'anchor',       verbs: ['jump', 'restraint'],          purity: '3d',   sig: 'bandChoice' },
  wall:          { threats: ['inBand'],                   height: 'fixed',       arrange: 'stack',   aim: 'toward',     source: 'edge',         verbs: ['thread'],                     purity: '2d',   sig: 'gapThread' },
  spiral:        { threats: ['inBand'],                   height: 'oscillating', arrange: 'ring',    aim: 'none',       source: 'boss',         verbs: ['followGap'],                  purity: '2.5d', sig: 'followGap' },
  counterSpiral: { threats: ['inBand'],                   height: 'oscillating', arrange: 'ring',    aim: 'none',       source: 'boss',         verbs: ['followGap'],                  purity: '2.5d', sig: 'followGap' },
  satBurst:      { threats: ['inBand'],                   height: 'ladder',      arrange: 'cluster', aim: 'aimed',      source: 'boss',         verbs: ['shift'],                      purity: '3d',   sig: 'microStep' },
  orbit:         { threats: ['inBand'],                   height: 'fixed',       arrange: 'ring',    aim: 'homing',     source: 'boss',         verbs: ['orbitPull'],                  purity: '2.5d', sig: 'orbitPull' },

  /* ---- 难度 2 ---- */
  jumpWall:      { threats: ['marginal'],                 height: 'ladder',      arrange: 'stack',   aim: 'toward',     source: 'edge',         verbs: ['jump', 'restraint'],          purity: '3d',   sig: 'jumpRhythm' },
  sniper:        { threats: ['inBand'],                   height: 'fixed',       arrange: 'cluster', aim: 'predictive', source: 'boss',         verbs: ['shift'],                      purity: '2d',   sig: 'microStep' },
  gate:          { threats: ['inBand'],                   height: 'fixed',       arrange: 'stack',   aim: 'toward',     source: 'edge',         verbs: ['thread'],                     purity: '2d',   sig: 'gapThread' },
  risenare:      { threats: ['crossing', 'inBand'],       height: 'monotonic',   arrange: 'column',  aim: 'none',       source: 'aroundPlayer', verbs: ['leaveCircle', 'shift'],       purity: '3d',   sig: 'dualThreat' },
  feint:         { threats: ['transition'],               height: 'hoverDrop',   arrange: 'cluster', aim: 'homing',     source: 'aroundPlayer', verbs: ['leaveCircle', 'shift'],       purity: '3d',   sig: 'readFake' },

  /* ---- 难度 3 ---- */
  petal:         { threats: ['inBand'],                   height: 'fixed',       arrange: 'ring',    aim: 'none',       source: 'boss',         verbs: ['followGap'],                  purity: '2.5d', sig: 'followGap' },
  radial:        { threats: ['inBand'],                   height: 'ladder',      arrange: 'spread',  aim: 'none',       source: 'boss',         verbs: ['thread'],                     purity: '2.5d', sig: 'gapThread' },
  downpour:      { threats: ['crossing'],                 height: 'monotonic',   arrange: 'field',   aim: 'none',       source: 'scatter',      verbs: ['leaveCircle'],                purity: '3d',   sig: 'leaveCircle' },
  fountain:      { threats: ['crossing'],                 height: 'ballistic',   arrange: 'ring',    aim: 'none',       source: 'boss',         verbs: ['shift'],                      purity: '3d',   sig: 'ballisticBand' },
  uprain:        { threats: ['crossing'],                 height: 'monotonic',   arrange: 'column',  aim: 'none',       source: 'underground',  verbs: ['shift', 'jump'],              purity: '3d',   sig: 'columnDodge' },
  cone:          { threats: ['inBand'],                   height: 'fixed',       arrange: 'cone',    aim: 'aimed',      source: 'boss',         verbs: ['shift'],                      purity: '3d',   sig: 'microStep' },

  /* ---- 难度 4 ---- */
  aimed:         { threats: ['inBand', 'marginal'],       height: 'ladder',      arrange: 'cluster', aim: 'predictive', source: 'boss',         verbs: ['jump', 'restraint', 'shift'], purity: '3d',   sig: 'bandChoice' },
  random:        { threats: ['inBand'],                   height: 'monotonic',   arrange: 'cluster', aim: 'offset',     source: 'boss',         verbs: ['thread'],                     purity: '2d',   sig: 'gapThread' },
  smoke:         { threats: ['inBand'],                   height: 'monotonic',   arrange: 'dome',    aim: 'none',       source: 'aroundPlayer', verbs: ['detour'],                     purity: '3d',   sig: 'detour' },
  lightning:     { threats: ['crossing'],                 height: 'monotonic',   arrange: 'cluster', aim: 'none',       source: 'aroundPlayer', verbs: ['leaveCircle'],                purity: '3d',   sig: 'leaveCircle' },
  grenade:       { threats: ['crossing', 'inBand'],       height: 'ballistic',   arrange: 'dome',    aim: 'none',       source: 'aroundPlayer', verbs: ['leaveCircle', 'shift'],       purity: '3d',   sig: 'leaveCircle' },
  wave:          { threats: ['marginal'],                 height: 'field',       arrange: 'stack',   aim: 'toward',     source: 'edge',         verbs: ['wavePhase', 'jump'],          purity: '3d',   sig: 'wavePhase' },
  sweepLine:     { threats: ['marginal'],                 height: 'fixed',       arrange: 'field',   aim: 'none',       source: 'edge',         verbs: ['jump'],                       purity: '3d',   sig: 'jump' },
  gaster:        { threats: ['marginal'],                 height: 'fixed',       arrange: 'spread',  aim: 'aimed',      source: 'blaster',      verbs: ['jump', 'shift'],              purity: '3d',   sig: 'jump' },
  pinwheel:      { threats: ['inBand'],                   height: 'ladder',      arrange: 'field',   aim: 'none',       source: 'boss',         verbs: ['followGap'],                  purity: '2.5d', sig: 'followGap' },
  toho:          { threats: ['marginal'],                 height: 'ladder',      arrange: 'ring',    aim: 'none',       source: 'boss',         verbs: ['jump', 'restraint'],          purity: '3d',   sig: 'jumpRhythm' },
  stack:         { threats: ['marginal', 'inBand'],       height: 'fixed',       arrange: 'stack',   aim: 'none',       source: 'edge',         verbs: ['jump', 'restraint'],          purity: '3d',   sig: 'jumpRhythm' },

  /* ---- 难度 4 晶格系（沿体对角线运动的真三维晶体）---- */
  lattice111:    { threats: ['inBand', 'marginal'],       height: 'monotonic',   arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['shift', 'thread'],            purity: '3d',   sig: 'latticeBody' },
  latticeShear:  { threats: ['inBand'],                   height: 'fixed',       arrange: 'lattice', aim: 'toward',     source: 'anchor',       verbs: ['thread', 'shift'],            purity: '3d',   sig: 'latticeSlip' },
  latticeWheel:  { threats: ['inBand'],                   height: 'fixed',       arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['followGap'],                  purity: '3d',   sig: 'latticeWheelSig' },
  latticeSpin:   { threats: ['inBand'],                   height: 'oscillating', arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['thread', 'shift'],            purity: '3d',   sig: 'latticeSpinSig' },
  latticeVac:    { threats: ['inBand', 'marginal'],       height: 'monotonic',   arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['thread', 'shift'],            purity: '3d',   sig: 'latticeBody' },
  latticeScrew:  { threats: ['inBand', 'marginal'],       height: 'monotonic',   arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['followGap', 'jump'],          purity: '3d',   sig: 'latticeScrewSig' },
  latticeBreath: { threats: ['inBand'],                   height: 'oscillating', arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['wavePhase', 'thread'],        purity: '3d',   sig: 'wavePhase' },
  latticePhonon: { threats: ['inBand'],                   height: 'oscillating', arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['wavePhase', 'thread'],        purity: '3d',   sig: 'wavePhase' },
  latticeDisloc: { threats: ['inBand'],                   height: 'oscillating', arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['thread', 'shift'],            purity: '3d',   sig: 'latticeDislocSig' },
  latticePhase:  { threats: ['inBand'],                   height: 'oscillating', arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['shift', 'thread'],            purity: '3d',   sig: 'latticePhaseSig' },
  latticeBurst:  { threats: ['inBand', 'marginal'],       height: 'field',       arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['detour', 'shift'],            purity: '3d',   sig: 'latticeBurstSig' },
  latticeVolley: { threats: ['inBand'],                   height: 'fixed',       arrange: 'lattice', aim: 'aimed',      source: 'anchor',       verbs: ['shift', 'restraint'],         purity: '3d',   sig: 'microStep' },
  latticeRain:   { threats: ['inBand', 'crossing'],       height: 'field',       arrange: 'lattice', aim: 'none',       source: 'anchor',       verbs: ['thread', 'leaveCircle'],      purity: '3d',   sig: 'dualThreat' },
  /* v5.3：晶胞 / 层为单位 */
  latticeAssemble: { threats: ['transition', 'inBand'],   height: 'fixed',       arrange: 'lattice', aim: 'aimed',      source: 'scatter',      verbs: ['detour', 'shift'],            purity: '3d',   sig: 'latticeCellSig' },
  latticeStack:  { threats: ['crossing', 'inBand'],       height: 'ladder',      arrange: 'lattice', aim: 'none',       source: 'edge',         verbs: ['thread', 'shift'],            purity: '3d',   sig: 'latticeStackSig' },
  latticeCone:   { threats: ['crossing', 'transition'],   height: 'field',       arrange: 'lattice', aim: 'aimed',      source: 'boss',         verbs: ['detour', 'shift'],            purity: '3d',   sig: 'latticeConeSig' }
};

/* ============ 词汇中文标注 ============ */

export const THREAT_INFO: Record<ThreatClass, { name: string; tip: string }> = {
  inBand:     { name: '恒在', tip: '全程落在可达高度带——2D 语法适用' },
  marginal:   { name: '临界', tip: '贴着可达边界——跳/不跳 + 时机' },
  crossing:   { name: '穿行', tip: '单次穿越可达带——读标记躲事件' },
  transition: { name: '转入', tip: '从带外变轨进入——读转变征兆' }
};

export const VERB_INFO: Record<DodgeVerb, { name: string; tip: string }> = {
  jump:        { name: '跳',   tip: '贴地带——起跳越过' },
  restraint:   { name: '忌跳', tip: '空中带——克制不起跳' },
  shift:       { name: '微移', tip: '单向走位拉开距离' },
  thread:      { name: '穿缝', tip: '找缺口/缝隙穿过' },
  leaveCircle: { name: '离圈', tip: '离开读秒标记区' },
  followGap:   { name: '跟缝', tip: '跟随旋转结构的缝隙' },
  wavePhase:   { name: '等谷', tip: '等波谷相位再动作' },
  detour:      { name: '绕行', tip: '绕开慢速区域' },
  orbitPull:   { name: '拉扯', tip: '持续位移甩开追踪' }
};

export const HEIGHT_INFO: Record<HeightProfile, string> = {
  fixed: '定高', ladder: '阶梯', spreadBands: '跨带铺', monotonic: '单调升降',
  oscillating: '振荡', field: '场驱动', ballistic: '弹道', hoverDrop: '悬停突变'
};

export const ARRANGE_INFO: Record<ArrangeKind, string> = {
  spread: '扇', ring: '环', stack: '叠(墙层)', cone: '锥', column: '柱',
  dome: '穹顶', field: '场', cluster: '点簇', ray: '射线', lattice: '点阵'
};

export const AIM_INFO: Record<AimKind, string> = {
  none: '全向', aimed: '自机狙', predictive: '预判狙', offset: '瞄散',
  locked: '施法锁定', toward: '环境向', homing: '追踪'
};

export const SOURCE_INFO: Record<SourceKind, string> = {
  boss: '本体', blaster: '炮口', anchor: '场地锚点', aroundPlayer: '围玩家',
  scatter: '全场撒点', edge: '边缘推进', underground: '地下'
};

export const PURITY_INFO: Record<Purity, string> = {
  '2d': '2D 本质', '2.5d': '2.5D', '3d': '3D 本质'
};

export const SIG_INFO: Record<SignatureId, string> = {
  jump: '单跳绕开', restraint: '克制不跳', jumpRhythm: '跳跃节律', bandChoice: '选带决策',
  colorRead: '读色选动', gapThread: '穿缝', followGap: '跟缝走', leaveCircle: '离圈避险',
  dualThreat: '双威胁拆解', readFake: '识破假象', microStep: '单向微移', orbitPull: '拉扯甩尾',
  ballisticBand: '弹道落点', columnDodge: '柱间穿行', detour: '绕行规避', wavePhase: '波相位等待',
  latticeBody: '体对角线扫层', latticeSlip: '滑移裂缝', latticeWheelSig: '晶轮臂缝', latticeSpinSig: '翻滚扫描',
  latticeScrewSig: '螺旋跟转', latticeDislocSig: '错位缝', latticePhaseSig: '相变读表', latticeBurstSig: '聚散读形',
  latticeCellSig: '晶胞合围', latticeStackSig: '层扫叠砌', latticeConeSig: '晶胞锥穿行'
};

/* ============ 查询与聚合 ============ */

export function taxonomyOf(name: PatternName): PatternClass {
  return PATTERN_TAXONOMY[name];
}

/** 主解法（训练分组键） */
export function primaryVerb(name: PatternName): DodgeVerb {
  return PATTERN_TAXONOMY[name].verbs[0];
}

/** 完整分类一行（悬浮提示/报告用） */
export function classifyLine(name: PatternName): string {
  const t = PATTERN_TAXONOMY[name];
  return THREAT_INFO[t.threats[0]].name + ' · ' + HEIGHT_INFO[t.height] + ' · ' +
    ARRANGE_INFO[t.arrange] + ' · ' + AIM_INFO[t.aim] + ' · ' +
    SOURCE_INFO[t.source] + ' · ' + PURITY_INFO[t.purity] +
    ' · 解法:' + t.verbs.map(function (v) { return VERB_INFO[v].name; }).join('/') +
    ' · 签名:' + SIG_INFO[t.sig];
}

/** 短分类（状态栏用） */
export function classifyShort(name: PatternName): string {
  const t = PATTERN_TAXONOMY[name];
  return THREAT_INFO[t.threats[0]].name + '·' + VERB_INFO[t.verbs[0]].name + '·' + PURITY_INFO[t.purity];
}

/** 按主解法分组（训练课程分组的现成答案） */
export function groupByPrimaryVerb(): Record<DodgeVerb, PatternName[]> {
  const out = {} as Record<DodgeVerb, PatternName[]>;
  for (const v of Object.keys(VERB_INFO) as DodgeVerb[]) out[v] = [];
  for (const name of Object.keys(PATTERN_TAXONOMY) as PatternName[]) {
    out[primaryVerb(name)].push(name);
  }
  return out;
}

/* ============ 覆盖分析（关卡编排用） ============ */

export interface CoverageReport {
  count: number;
  verbs: Partial<Record<DodgeVerb, number>>;
  threats: Partial<Record<ThreatClass, number>>;
  purity: Partial<Record<Purity, number>>;
  sigs: Partial<Record<SignatureId, number>>;
  /** 九词表中未覆盖的动词 —— 编排补位的方向 */
  missingVerbs: DodgeVerb[];
  /** 人类可读报告 */
  text: string;
}

function countBy<T extends string>(list: T[], into: Partial<Record<T, number>>): Partial<Record<T, number>> {
  for (const k of list) into[k] = (into[k] || 0) + 1;
  return into;
}

export function coverageReport(names: readonly PatternName[]): CoverageReport {
  const verbs: Partial<Record<DodgeVerb, number>> = {};
  const threats: Partial<Record<ThreatClass, number>> = {};
  const purity: Partial<Record<Purity, number>> = {};
  const sigs: Partial<Record<SignatureId, number>> = {};

  const lines: string[] = [];
  for (const name of names) {
    const t = PATTERN_TAXONOMY[name];
    countBy(t.verbs, verbs);
    countBy(t.threats, threats);
    purity[t.purity] = (purity[t.purity] || 0) + 1;
    sigs[t.sig] = (sigs[t.sig] || 0) + 1;
    lines.push(PATTERN_LABELS[name].name + '（' + name + '）· ' + classifyLine(name));
  }

  const allVerbs = Object.keys(VERB_INFO) as DodgeVerb[];
  const missingVerbs = allVerbs.filter(function (v) { return !verbs[v]; });

  const text = lines.join('\n') +
    '\n—— 覆盖：解法动词 ' + (allVerbs.length - missingVerbs.length) + '/9' +
    (missingVerbs.length ? '（缺：' + missingVerbs.map(function (v) { return VERB_INFO[v].name; }).join('、') + '）' : '') +
    '；纯度 3D ' + (purity['3d'] || 0) + ' / 2.5D ' + (purity['2.5d'] || 0) + ' / 2D ' + (purity['2d'] || 0) +
    '；签名 ' + Object.keys(sigs).length + ' 种';

  return { count: names.length, verbs, threats, purity, sigs, missingVerbs, text };
}
