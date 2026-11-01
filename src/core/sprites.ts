/**
 * 精灵缓存。子弹每帧都画、颜色每帧都变，所以辉光贴图按 "r,g,b" 字符串缓存，
 * 同一档高度只生成一次 canvas。
 */
import { TAU } from './math';

const glowCache: Record<string, HTMLCanvasElement> = Object.create(null);

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
