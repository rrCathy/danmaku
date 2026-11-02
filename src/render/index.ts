/**
 * 一帧的绘制总入口。
 *
 * 顺序 = 「地面 → 预警 → 墙体 → 影子 → 拖尾 → 残影 → 引导线 → 激光 → 实体（按深度排序）
 * → 玩家轮廓 → 受击闪红 → 暗角扫描线 → 雷达」。
 * 深度排序只对实体做，其它层都是"贴地/贴屏"的辅助信息。
 */
import { bgGrad, ctx, DPR, H, W, fxCanvas } from '../core/screen';
import { project } from '../core/camera';
import { boss, bullets, clock, opts, particles, player, pshots } from '../state';
import { drawFloor, drawTelegraphs } from './floor';
import { drawGhostsLayer, drawGuides, drawPlaneTrails, drawShadows } from './aids';
import { drawBoss, drawBullet, drawParticle, drawPlayer, drawPShot } from './entities';
import { drawLasers, drawWalls } from './hazards';
import { drawMinimap } from './minimap';
import { lasers, walls } from '../state';
import { TAU } from '../core/math';
import type { Bullet, Particle, Projected, Shot } from '../types';

export function render(): void {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  ctx.fillStyle = bgGrad || '#04060e';
  ctx.fillRect(0, 0, W, H);

  drawFloor();
  drawTelegraphs();
  if (walls.length) drawWalls();
  if (opts.shadows) drawShadows();
  drawPlaneTrails();
  drawGhostsLayer();
  if (opts.guides) drawGuides();
  if (lasers.length) drawLasers();

  const items: Array<{ z: number; fn: () => void }> = [];

  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    const p = project(b.x, b.y, b.z);
    if (!p) continue;
    items.push({ z: p.z, fn: (function (bb: Bullet, pp: Projected) { return function () { drawBullet(bb, pp); }; })(b, p) });
  }

  for (let i = 0; i < pshots.length; i++) {
    const s = pshots[i];
    const p = project(s.x, s.y, s.z);
    if (!p) continue;
    items.push({ z: p.z, fn: (function (ss: Shot, pp: Projected) { return function () { drawPShot(ss, pp); }; })(s, p) });
  }

  for (let i = 0; i < particles.length; i++) {
    const pa = particles[i];
    const p = project(pa.x, pa.y, pa.z);
    if (!p) continue;
    items.push({ z: p.z, fn: (function (qq: Particle, pp: Projected) { return function () { drawParticle(qq, pp); }; })(pa, p) });
  }

  if (boss.alive) {
    const p = project(boss.x, boss.y, boss.z);
    if (p) items.push({ z: p.z, fn: function () { drawBoss(p); } });
  }

  const pp = project(player.x, player.y + 0.7, player.z);
  if (pp) items.push({ z: pp.z - 0.001, fn: function () { drawPlayer(pp); } });

  items.sort(function (a, b) { return b.z - a.z; });
  for (let i = 0; i < items.length; i++) items[i].fn();

  // 注意：这里曾经画过一个「玩家高亮轮廓椭圆」（0.33×0.70 屏幕空间，竖直长椭圆），
  // 用来在被弹幕遮住时定位玩家。它和判定胶囊的画法叠在一起，看起来就像
  // "人物被一个莫名的椭圆套着"。现在玩家 = 判定光棒本身（带辉光），这层已删除。

  if (clock.dmgFlash > 0) {
    ctx.fillStyle = 'rgba(255,44,76,' + (clock.dmgFlash * 0.22) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  // 暗角 + 扫描线（预渲染）
  if (fxCanvas) ctx.drawImage(fxCanvas, 0, 0, W, H);

  drawMinimap();
}
