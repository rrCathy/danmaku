/** 实体绘制：子弹、玩家弹、粒子、玩家、boss。全部走 project() 的屏幕坐标。 */
import { boss, bullets, opts, pshots, player } from '../state';
import type { Bullet, Particle, Projected, Shot } from '../types';
import { TAU, clamp } from '../core/math';
import { project } from '../core/camera';
import { COLORS } from '../core/color';
import { ctx } from '../core/screen';
import { glowSprite } from '../core/sprites';
import { satPos } from '../systems/boss-geometry';

export function drawBullet(b: Bullet, p: Projected): void {
  const rp = Math.max(1.4, b.r * p.s);
  const tp = project(b.px, b.py, b.pz);
  if (tp) {
    ctx.beginPath();
    ctx.moveTo(tp.x, tp.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = 'rgba(' + b.rgb + ',0.42)';
    ctx.lineWidth = Math.max(1, rp * 1.15);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  const g = glowSprite(b.rgb);
  const gs = rp * 6.4;
  ctx.globalAlpha = 0.85;
  ctx.drawImage(g, p.x - gs / 2, p.y - gs / 2, gs, gs);
  ctx.globalAlpha = 1;

  // 运动方向的屏幕角度：箭头 / 砖块 / 椭球沿它定向
  const ang = tp ? Math.atan2(p.y - tp.y, p.x - tp.x) : -Math.PI / 2;
  const shape = b.shape || 'ball';
  const len = b.len || (shape === 'arrow' ? 3.4 : shape === 'ellip' ? 1.8 : 2.2);

  if (shape === 'ball') {
    ctx.beginPath();
    ctx.arc(p.x, p.y, rp * 0.8, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, rp, 0, TAU);
    ctx.strokeStyle = 'rgba(' + b.rgb + ',0.92)';
    ctx.lineWidth = Math.max(1, rp * 0.28);
    ctx.stroke();
    return;
  }

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  if (shape === 'arrow') {
    const L = rp * len;
    // 尾杆 → 三角头：一眼看出飞行方向
    ctx.beginPath();
    ctx.moveTo(-L, 0);
    ctx.lineTo(rp * 0.4, -rp * 0.62);
    ctx.lineTo(L, 0);
    ctx.lineTo(rp * 0.4, rp * 0.62);
    ctx.closePath();
    ctx.fillStyle = 'rgba(' + b.rgb + ',0.88)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, rp * 0.22);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
  } else if (shape === 'box') {
    const L = rp * len, W = rp * 0.92;
    ctx.beginPath();
    ctx.rect(-L, -W, L * 2, W * 2);
    ctx.fillStyle = 'rgba(' + b.rgb + ',0.82)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, rp * 0.24);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
  } else { // ellip：水滴 / 椭球
    const rx = rp * len, ry = rp * 1.02;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fillStyle = 'rgba(' + b.rgb + ',0.85)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, rp * 0.22);
    ctx.strokeStyle = 'rgba(255,255,255,0.78)';
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPShot(s: Shot, p: Projected): void {
  const rp = Math.max(1.2, s.r * p.s);
  const tp = project(s.px, s.py, s.pz);
  if (tp) {
    ctx.beginPath();
    ctx.moveTo(tp.x, tp.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = 'rgba(' + COLORS.pshot + ',0.55)';
    ctx.lineWidth = Math.max(1, rp * 1.3);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(p.x, p.y, rp * 1.6, 0, TAU);
  ctx.fillStyle = 'rgba(' + COLORS.pshot + ',0.35)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x, p.y, rp, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

export function drawParticle(pa: Particle, p: Projected): void {
  const rp = Math.max(1, pa.size * p.s);
  ctx.globalAlpha = clamp(pa.life / pa.max, 0, 1) * 0.9;
  ctx.drawImage(glowSprite(pa.rgb), p.x - rp * 3, p.y - rp * 3, rp * 6, rp * 6);
  ctx.globalAlpha = 1;
}

export function drawPlayer(p: Projected): void {
  const s = p.s;
  const bh = 1.34 * s;
  const bw = 0.62 * s;

  const blink = player.inv > 0 && Math.floor(player.inv * 22) % 2 === 0;
  ctx.globalAlpha = blink ? 0.42 : 1;

  const g = glowSprite(COLORS.player);
  ctx.globalAlpha *= 0.40;
  ctx.drawImage(g, p.x - bw * 2.4, p.y - bh * 1.05, bw * 4.8, bh * 2.3);
  ctx.globalAlpha = blink ? 0.42 : 1;

  const grd = ctx.createLinearGradient(p.x, p.y - bh * 0.5, p.x, p.y + bh * 0.5);
  grd.addColorStop(0, 'rgba(240,255,252,1)');
  grd.addColorStop(0.55, 'rgba(150,255,210,0.97)');
  grd.addColorStop(1, 'rgba(24,120,96,0.97)');

  ctx.lineCap = 'round';
  // 腿
  ctx.strokeStyle = 'rgba(120,235,195,0.95)';
  ctx.lineWidth = Math.max(2, bw * 0.20);
  ctx.beginPath();
  ctx.moveTo(p.x - bw * 0.13, p.y + bh * 0.20);
  ctx.lineTo(p.x - bw * 0.19, p.y + bh * 0.50);
  ctx.moveTo(p.x + bw * 0.13, p.y + bh * 0.20);
  ctx.lineTo(p.x + bw * 0.19, p.y + bh * 0.50);
  ctx.stroke();

  // 躯干
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - bh * 0.20);
  ctx.lineTo(p.x, p.y + bh * 0.22);
  ctx.strokeStyle = grd;
  ctx.lineWidth = Math.max(3, bw * 0.42);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(235,255,250,0.5)';
  ctx.lineWidth = Math.max(1, bw * 0.10);
  ctx.stroke();

  // 手臂（跳跃时张开，方便读出“在空中”）
  const air = player.y > 0.08;
  const armY = air ? -0.12 : 0.02;
  ctx.strokeStyle = 'rgba(180,255,225,0.9)';
  ctx.lineWidth = Math.max(1.6, bw * 0.16);
  ctx.beginPath();
  ctx.moveTo(p.x - bw * 0.05, p.y + bh * armY);
  ctx.lineTo(p.x - bw * 0.42, p.y + bh * (air ? -0.34 : 0.12));
  ctx.moveTo(p.x + bw * 0.05, p.y + bh * armY);
  ctx.lineTo(p.x + bw * 0.42, p.y + bh * (air ? -0.34 : 0.12));
  ctx.stroke();

  // 头
  ctx.beginPath();
  ctx.arc(p.x, p.y - bh * 0.36, Math.max(2.4, bw * 0.24), 0, TAU);
  ctx.fillStyle = 'rgba(240,255,252,0.98)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,235,195,0.9)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 跳跃高度竖线：让“离地多高”有直接读数
  if (air) {
    const gp2 = project(player.x, 0.03, player.z);
    const fp = project(player.x, player.y + 0.1, player.z);
    if (gp2 && fp) {
      ctx.beginPath();
      ctx.moveTo(fp.x, fp.y);
      ctx.lineTo(gp2.x, gp2.y);
      ctx.strokeStyle = 'rgba(150,255,210,0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.globalAlpha = 1;

  if (opts.hitbox) {
    const a = project(player.x, player.y + 0.18, player.z);
    const b = project(player.x, player.y + 1.42, player.z);
    if (a && b) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(120,255,180,0.30)';
      ctx.lineWidth = 0.52 * a.s;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(a.x, a.y, 0.26 * a.s, 0, TAU);
      ctx.strokeStyle = 'rgba(120,255,180,0.75)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

export function drawBoss(p: Projected): void {
  const rad = 1.25 * p.s;
  const flash = boss.flash > 0;

  const gp = project(boss.x, 0.03, boss.z);
  if (gp) {
    const grd = ctx.createLinearGradient(p.x, p.y, gp.x, gp.y);
    grd.addColorStop(0, 'rgba(255,86,160,0.26)');
    grd.addColorStop(1, 'rgba(255,86,160,0)');
    ctx.strokeStyle = grd;
    ctx.lineWidth = Math.max(2, rad * 0.45);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(gp.x, gp.y);
    ctx.stroke();
  }

  const g = glowSprite(flash ? '255,235,250' : COLORS.boss);
  ctx.globalAlpha = 0.85;
  ctx.drawImage(g, p.x - rad * 3.2, p.y - rad * 3.2, rad * 6.4, rad * 6.4);
  ctx.globalAlpha = 1;

  const ringPts = [];
  let ok = true;
  for (let i = 0; i <= 48; i++) {
    const a = i / 48 * TAU + boss.spin * 0.7;
    const q = project(boss.x + Math.cos(a) * 2.05, boss.y, boss.z + Math.sin(a) * 2.05);
    if (!q) { ok = false; break; }
    ringPts.push(q);
  }
  if (ok) {
    ctx.beginPath();
    ctx.moveTo(ringPts[0].x, ringPts[0].y);
    for (let i = 1; i < ringPts.length; i++) ctx.lineTo(ringPts[i].x, ringPts[i].y);
    ctx.strokeStyle = 'rgba(255,130,195,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const grd = ctx.createRadialGradient(
    p.x - rad * 0.32, p.y - rad * 0.36, rad * 0.1,
    p.x, p.y, rad
  );
  grd.addColorStop(0, 'rgba(255,248,252,1)');
  grd.addColorStop(0.45, 'rgba(255,112,176,0.97)');
  grd.addColorStop(1, 'rgba(112,16,66,0.97)');
  ctx.beginPath();
  ctx.arc(p.x, p.y, rad, 0, TAU);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,205,232,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(p.x, p.y, rad * 0.34, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();

  // 卫星炮：第二个发射源，明确画出来，让玩家知道弹从哪来
  for (let i = 0; i < boss.sats.length; i++) {
    const sp = satPos(i);
    const q = project(sp.x, sp.y, sp.z);
    const gq = project(sp.x, 0.03, sp.z);
    if (gq) {
      ctx.beginPath();
      ctx.arc(gq.x, gq.y, Math.max(1.5, 0.18 * gq.s), 0, TAU);
      ctx.fillStyle = 'rgba(255,176,64,0.5)';
      ctx.fill();
    }
    if (!q) continue;
    const rr = Math.max(2, 0.20 * q.s);
    ctx.drawImage(glowSprite('255,196,110'), q.x - rr * 4, q.y - rr * 4, rr * 8, rr * 8);
    ctx.beginPath();
    ctx.arc(q.x, q.y, rr, 0, TAU);
    ctx.fillStyle = 'rgba(255,240,220,0.98)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(q.x, q.y, rr * 1.7, 0, TAU);
    ctx.strokeStyle = 'rgba(255,176,64,0.7)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}
