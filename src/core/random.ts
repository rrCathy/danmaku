/**
 * 随机源。
 *
 * 默认就是 Math.random()，行为与 v0.6 完全一致。
 * 带 `?seed=N` 时切到 mulberry32 —— 同一个种子跑出同一条时间线，
 * 「三次测试跑的不是同一套弹幕」这个问题才算解决。
 *
 * 注意：**相机抖动不要用 random()**。它每帧调用次数跟帧率走，
 * 一旦进入种子流，按 ?t= 快进的结果就不可复现了。
 */

let seeded: (() => number) | null = null;
let currentSeed: number | null = null;

function mulberry32(a: number): () => number {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function setSeed(seed: number | null): void {
  if (seed === null || !Number.isFinite(seed)) {
    seeded = null;
    currentSeed = null;
    return;
  }
  currentSeed = seed >>> 0;
  seeded = mulberry32(currentSeed);
}

export function getSeed(): number | null {
  return currentSeed;
}

/** 游戏逻辑里的随机都走这里；带种子时就是可复现的 */
export function random(): number {
  return seeded ? seeded() : Math.random();
}

export function rand(a: number, b: number): number {
  return a + random() * (b - a);
}

/** 随机整数 [0, n) */
export function randInt(n: number): number {
  return Math.floor(random() * n) % n;
}
