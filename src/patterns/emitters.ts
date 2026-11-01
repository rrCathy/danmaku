/**
 * 通用发射器：把"瞄准点 + 数量 + 速度"变成一串子弹。
 * 具体图案只负责决定「朝哪打、打几发、什么高度」，不重复写弹道数学。
 */
import { addBullet } from '../systems/bullets';
import { boss, player } from '../state';
import { random } from '../core/random';
import { rand } from '../core/math';
import type { HClass } from '../types';

export function aimVel(
  from: { x: number; y: number; z: number },
  tx: number, ty: number, tz: number,
  speed: number
): { x: number; y: number; z: number } {
  const dx = tx - from.x, dy = ty - from.y, dz = tz - from.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / l * speed, y: dy / l * speed, z: dz / l * speed };
}

/** 扇形贴地/定高扫射：以玩家为中心横向铺开 count 发 */
export function fanShot(
  targetY: number, count: number, speed: number,
  r: number, cls: HClass, gap?: number
): void {
  const px = player.x, pz = player.z;
  let dx = px - boss.x, dz = pz - boss.z;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  const perpX = -dz, perpZ = dx;
  const step = gap || 1.6;

  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * step;
    const tx = px + perpX * off;
    const tz = pz + perpZ * off;
    const vx = tx - boss.x, vy = targetY - boss.y, vz = tz - boss.z;
    const vl = Math.hypot(vx, vy, vz) || 1;
    addBullet(boss.x, boss.y, boss.z, vx / vl * speed, vy / vl * speed, vz / vl * speed, r, cls, 'sweep');
  }
}

/** 瞄准点弥散：9 发，目标高度从 0.7m 铺到 3.3m，覆盖三个高度带 */
export function spreadShot(): void {
  for (let i = 0; i < 9; i++) {
    const ty = 0.7 + (i / 8) * 2.6;
    const tx = player.x + rand(-1.2, 1.2);
    const tz = player.z + rand(-1.2, 1.2);
    const vx = tx - boss.x, vy = ty - boss.y, vz = tz - boss.z;
    const l = Math.hypot(vx, vy, vz) || 1;
    const sp = rand(6.2, 7.4);
    const cls: HClass = ty < 1.05 ? 'low' : ty < 2.05 ? 'mid' : 'high';
    addBullet(boss.x, boss.y, boss.z, vx / l * sp, vy / l * sp, vz / l * sp, 0.22, cls, 'spread');
  }
}

/** 单层环形扩散：同一高度、同速，从中心向四周推开 */
export function ringShot(
  src: { x: number; z: number },
  h: number, count: number, speed: number, r?: number
): void {
  const cls: HClass = h < 1.05 ? 'low' : h < 2.05 ? 'mid' : 'high';
  const rot = random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = rot + (i / count) * Math.PI * 2;
    addBullet(src.x, h, src.z,
      Math.cos(a) * speed, 0, Math.sin(a) * speed,
      r || 0.22, cls, 'ring');
  }
}
