/**
 * 精灵缓存。子弹每帧都画、颜色每帧都变，所以辉光贴图按 "r,g,b" 字符串缓存，
 * 同一档高度只生成一次 canvas。
 */
import { TAU } from './math';

const glowCache: Record<string, HTMLCanvasElement> = Object.create(null);

/** "r,g,b" × k：k>1 提亮（clamp 255），k<1 调暗 */
function shade(rgb: string, k: number): string {
  const q = rgb.split(',');
  return Math.min(255, Math.round(Number(q[0]) * k)) + ',' +
    Math.min(255, Math.round(Number(q[1]) * k)) + ',' +
    Math.min(255, Math.round(Number(q[2]) * k));
}

export function glowSprite(rgb: string): HTMLCanvasElement {
  const hit = glowCache[rgb];
  if (hit) return hit;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.16, 'rgba(' + rgb + ',0.95)');
  grd.addColorStop(0.40, 'rgba(' + rgb + ',0.32)');
  grd.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  glowCache[rgb] = c;
  return c;
}

/**
 * 大玉（晶格弹等屏幕大弹）预渲染：径向渐变主体（中心提亮 → 边缘压暗）
 * + 暗轮廓环 + 居中白高光 —— 球体感一笔成型，运行时只做 drawImage 缩放。
 * 直接逐帧 createRadialGradient 画 600+ 颗扛不住，贴图按 "r,g,b" 缓存。
 */
const orbCache: Record<string, HTMLCanvasElement> = Object.create(null);

/** 球体画法（orbSprite / orbGlowSprite 共用）：渐变主体 + 暗轮廓 + 白高光 */
function paintOrb(g: CanvasRenderingContext2D, C: number, R: number, rgb: string): void {
  const grd = g.createRadialGradient(C, C, R * 0.1, C, C, R);
  grd.addColorStop(0, 'rgba(' + shade(rgb, 1.3) + ',0.98)');
  grd.addColorStop(0.55, 'rgba(' + rgb + ',0.96)');
  grd.addColorStop(1, 'rgba(' + shade(rgb, 0.45) + ',0.94)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(C, C, R, 0, TAU);
  g.fill();
  // 暗轮廓：勾出球体边缘，和光晕的弥漫分界
  g.strokeStyle = 'rgba(' + shade(rgb, 0.38) + ',0.9)';
  g.lineWidth = Math.max(2, R * 0.05);
  g.beginPath();
  g.arc(C, C, R - R * 0.025, 0, TAU);
  g.stroke();
  // 白高光
  g.fillStyle = 'rgba(255,255,255,0.96)';
  g.beginPath();
  g.arc(C, C, R * 0.3, 0, TAU);
  g.fill();
}

export function orbSprite(rgb: string): HTMLCanvasElement {
  const hit = orbCache[rgb];
  if (hit) return hit;
  const S = 128, C = S / 2, R = S / 2 - 4;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  paintOrb(c.getContext('2d')!, C, R, rgb);
  orbCache[rgb] = c;
  return c;
}

/**
 * 光晕+球体合成贴图：外圈光晕渐变 + 居中球体，晶格弹**一次 drawImage** 画完。
 * 2000 颗 × 每颗省 2~3 次 draw call 是帧率大头（headless 实测 28→45+ fps 的关键）。
 * 球体只占贴图半径的 1/3.2 —— 近景大球分辨率下降，但近景弹有淡出遮掩，可接受。
 */
const orbGlowCache: Record<string, HTMLCanvasElement> = Object.create(null);

export function orbGlowSprite(rgb: string): HTMLCanvasElement {
  const hit = orbGlowCache[rgb];
  if (hit) return hit;
  const S = 192, C = S / 2;
  const orbR = S / 2 / 3.2;                       // 球体半径：光晕全幅的 1/3.2（= rp×6.4 的比例）
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(C, C, 0, C, C, C);
  grd.addColorStop(0, 'rgba(' + rgb + ',0.85)');
  grd.addColorStop(0.25, 'rgba(' + rgb + ',0.32)');
  grd.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  paintOrb(g, C, orbR, rgb);
  orbGlowCache[rgb] = c;
  return c;
}

let shadowSpriteCache: HTMLCanvasElement | null = null;

export function shadowSprite(): HTMLCanvasElement {
  if (shadowSpriteCache) return shadowSpriteCache;
  const w = 128, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.8)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(1, 0.5);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, 64, 0, TAU);
  g.fill();
  g.restore();
  shadowSpriteCache = c;
  return c;
}
