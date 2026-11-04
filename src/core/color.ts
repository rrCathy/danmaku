/**
 * 高度 → 颜色（连续彩虹）。
 *
 * 0m 红 → 12m 紫，中间走彩虹。颜色只由「弹幕此刻的高度」决定，
 * 所以一颗弹从高空落下来会自己从紫变蓝变青变黄变红 —— 玩家读到的
 * 永远是它现在在几层，而不是它出生时贴的标签。
 *
 * 采样点前密后疏：0~3m 是主要交战高度，这一段必须分得清。
 */
import type { HClass } from '../types';

export const H_MAX = 12;
/** 0.1m 一档，共 121 个缓存 */
export const H_STEPS = 120;

/** [高度, r, g, b] */
export const H_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, 255, 52, 92],      // 红  —— 贴地，必须跳
  [0.9, 255, 128, 56],     // 橙
  [1.8, 255, 214, 74],     // 黄
  [3.0, 138, 255, 126],    // 绿
  [4.6, 58, 226, 255],     // 青
  [7.6, 86, 140, 255],     // 蓝
  [12.0, 196, 108, 255]    // 紫  —— 上限，别跳，从下面穿
];

/** 121 档字符串缓存，heightRGB() 零分配 */
const hRGB: Array<string | undefined> = new Array(H_STEPS + 1);

export function heightRGB(y: number): string {
  const i = Math.round((y < 0 ? 0 : y > H_MAX ? H_MAX : y) / H_MAX * H_STEPS);
  const cached = hRGB[i];
  if (cached) return cached;
  const h = i / H_STEPS * H_MAX;
  let a = H_STOPS[0], b = H_STOPS[H_STOPS.length - 1];
  for (let k = 0; k < H_STOPS.length - 1; k++) {
    if (h >= H_STOPS[k][0] && h <= H_STOPS[k + 1][0]) { a = H_STOPS[k]; b = H_STOPS[k + 1]; break; }
  }
  const f = b[0] === a[0] ? 0 : (h - a[0]) / (b[0] - a[0]);
  const s = Math.round(a[1] + (b[1] - a[1]) * f) + ',' +
            Math.round(a[2] + (b[2] - a[2]) * f) + ',' +
            Math.round(a[3] + (b[3] - a[3]) * f);
  hRGB[i] = s;
  return s;
}

/**
 * 诊断文案按「段」说话，段界与 CLASS_INFO 的措辞对齐，颜色和说法不会打架。
 *
 * 两刀来自判定物理（docs/danmaku-framework.md §2.2）：
 * 1.37 = 站立命中上界（胶囊顶 1.16 + 弹半径 0.21），其下站着会中、必须离地；
 * 1.87 = 单跳越顶上限（跳峰 1.64 + 胶囊底 0.44 − 弹半径 0.21），其上单跳会撞、别起跳。
 * 1.37~1.87 为宽容带：站、跳皆安全。
 */
export function clsName(y: number): HClass {
  if (y < 1.37) return 'low';
  if (y < 1.87) return 'mid';
  return 'high';
}

/** 生成时用的粗分段（和 clsName 的段界不同，这是历史行为，1:1 保留）。 */
export function clsByHeight(h: number): HClass {
  return h < 1.05 ? 'low' : h < 2.05 ? 'mid' : 'high';
}

export const CLASS_INFO: Record<HClass, { name: string; tip: string }> = {
  low: { name: '低空弹', tip: '贴地 —— 起跳可以躲过' },
  mid: { name: '中空弹', tip: '中段高度 —— 站稳或起跳都能躲过' },
  high: { name: '高空弹', tip: '头顶上方 —— 别起跳，贴地从下方穿过' },
  rain: { name: '落点雨', tip: '垂直下落 —— 离开地面标记圈' },
  grid: { name: '点阵弹', tip: '晶体点阵 —— 挪进点与点之间的空格，别站在点上' }
};

/** 非高度语义的固定色（玩家 / boss / 弹幕粒子 / 激光）。都写成 "r,g,b" 便于拼 rgba。 */
export const COLORS = {
  low: '255,64,104',
  mid: '255,176,64',
  high: '163,124,255',
  rain: '74,224,255',
  grid: '170,190,255',
  player: '150,255,210',
  boss: '255,86,160',
  pshot: '190,240,255'
} as const;

export type ColorKey = keyof typeof COLORS;
