/** 激光与弹墙：都是"持续存在的危险物"，跟子弹的单帧碰撞分开。 */
import { COLORS } from '../core/color';
import { lasers, player, walls } from '../state';
import { onPlayerHit } from './bullets';
import type { Laser } from '../types';

/** 贯穿场地的直线：判定 = 点到直线的距离，再加上高度区间 */
function laserHits(l: Laser): boolean {
  const dx = Math.cos(l.ang), dz = Math.sin(l.ang);
  const px = player.x - l.x, pz = player.z - l.z;
  const dh = Math.abs(px * dz - pz * dx) - (0.26 + l.r);
  const y0 = player.y + 0.18, y1 = player.y + 1.42;
  const dy = l.y < y0 ? y0 - l.y : (l.y > y1 ? l.y - y1 : 0);
  return dh <= 0 && dy <= 0;
}

export function updateLasers(dt: number): void {
  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i];
    l.ang += l.spin * dt;
    l.warm -= dt;
    l.life -= dt;

    if (l.warm <= 0 && player.inv <= 0 && laserHits(l)) {
      onPlayerHit({ cls: l.cls, rgb: COLORS[l.cls], x: player.x, y: l.y, z: player.z });
      player.inv = 0.9;
    }
    if (l.life <= 0) lasers.splice(i, 1);
  }
}

export function updateWalls(dt: number): void {
  for (let i = walls.length - 1; i >= 0; i--) {
    walls[i].t -= dt;
    if (walls[i].t <= -0.2) walls.splice(i, 1);
  }
}
