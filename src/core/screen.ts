/**
 * 画布与分辨率。
 *
 * 背景渐变 + 暗角 + 扫描线在 resize 时预渲染成一张离屏图，
 * 移动端每帧只贴一次，不重复画 300 条扫描线。
 */
import { isTouch } from './device';

export const canvas = document.getElementById('game') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d', { alpha: false })!;

export let W = 1280;
export let H = 720;
export let DPR = 1;
export let bgGrad: CanvasGradient | null = null;
export let fxCanvas: HTMLCanvasElement | null = null;

/** resize 之后的附加动作（触屏要把摇杆归位），用回调注册避免 screen ↔ touch 互相 import。 */
let afterResize: (() => void) | null = null;
export function onAfterResize(fn: () => void): void {
  afterResize = fn;
}

export function resize(): void {
  DPR = Math.min(window.devicePixelRatio || 1, isTouch ? 1.75 : 2);
  W = canvas.clientWidth || window.innerWidth;
  H = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  buildFx();
  if (afterResize) afterResize();
}

function buildFx(): void {
  bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#04060e');
  bgGrad.addColorStop(0.5, '#070b18');
  bgGrad.addColorStop(1, '#0a1024');

  fxCanvas = document.createElement('canvas');
  fxCanvas.width = Math.max(1, Math.floor(W * DPR));
  fxCanvas.height = Math.max(1, Math.floor(H * DPR));
  const g = fxCanvas.getContext('2d')!;
  g.scale(DPR, DPR);
  const vg = g.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.34, W / 2, H * 0.5, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.70)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.045;
  g.fillStyle = '#a8dcff';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
}
