/** 实体绘制：子弹、玩家弹、粒子、玩家、boss。全部走 project() 的屏幕坐标。 */
import { boss, bullets, opts, pshots, player } from '../state';
import { GRAZE_R, PLAYER } from '../config';
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
  } else if (shape === 'tetra') {
    // 正四面体：3D 顶点投影成线框 + 半透明面，绕速度轴自旋
    const S = b.r * 1.35;
    const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
    const fx = b.vx / sp, fy = b.vy / sp, fz = b.vz / sp;
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(fy) > 0.9) { ux = 1; uy = 0; }
    let wx = fy * uz - fz * uy, wy = fz * ux - fx * uz, wz = fx * uy - fy * ux;
    const wl = Math.hypot(wx, wy, wz) || 1;
    wx /= wl; wy /= wl; wz /= wl;
    const u2x = wy * fz - wz * fy, u2y = wz * fx - wx * fz, u2z = wx * fy - wy * fx;
    const spin = (8 - (b.life || 0)) * 3.1;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const V: Array<[number, number, number]> = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    const pts: Array<{ x: number; y: number }> = [];
    for (let vi = 0; vi < 4; vi++) {
      const v = V[vi];
      const lu = v[0], lv0 = v[1] * cs - v[2] * sn, lw0 = v[1] * sn + v[2] * cs;
      const wxx = b.x + (fx * lu + u2x * lv0 + wx * lw0) * S;
      const wyy = b.y + (fy * lu + u2y * lv0 + wy * lw0) * S;
      const wzz = b.z + (fz * lu + u2z * lv0 + wz * lw0) * S;
      const pr = project(wxx, wyy, wzz);
      if (pr) pts.push({ x: pr.x, y: pr.y });
    }
    if (pts.length === 4) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let vi = 1; vi < 4; vi++) ctx.lineTo(pts[vi].x, pts[vi].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + b.rgb + ',0.5)';
      ctx.fill();
      ctx.lineWidth = Math.max(1, rp * 0.22);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      // 三条内棱，让"体"感出来
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[3].x, pts[3].y);
      ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[3].x, pts[3].y);
      ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.stroke();
    }
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
  const blink = player.inv > 0 && Math.floor(player.inv * 22) % 2 === 0;
  const air = player.y > 0.08;

  /* 玩家 = 判定胶囊本身（不画人物模型）。
   * 东方式：自机就是那个判定点 —— 看得见的就是会被打中的范围，没有"模型比判定大"的错觉。 */
  const b0 = project(player.x, player.y + PLAYER.bodyLow, player.z);
  const b1 = project(player.x, player.y + PLAYER.bodyHigh, player.z);
  if (!b0 || !b1) return;
  const r0 = Math.max(2, PLAYER.hitR * b0.s);
  const r1 = Math.max(2, PLAYER.hitR * b1.s);
  const cx = (b0.x + b1.x) / 2, cy = (b0.y + b1.y) / 2;

  ctx.globalAlpha = blink ? 0.42 : 1;

  // 辉光：胶囊整体发光，远处也看得见自己
  const gr = Math.max(10, 0.85 * p.s);
  const g = glowSprite(COLORS.player);
  ctx.globalAlpha *= 0.5;
  ctx.drawImage(g, cx - gr, cy - gr, gr * 2, gr * 2);
  ctx.globalAlpha = blink ? 0.42 : 1;

  // 胶囊体积：上下两个圆 + 中间柱段（半透明）
  ctx.fillStyle = 'rgba(' + COLORS.player + ',0.14)';
  ctx.beginPath();
  ctx.arc(b0.x, b0.y, r0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(b1.x, b1.y, r1, 0, TAU);
  ctx.fill();
  ctx.fillRect(b0.x - r0, b0.y, r0 * 2, b1.y - b0.y);

  // 胶囊轮廓
  ctx.strokeStyle = 'rgba(' + COLORS.player + ',0.85)';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(b0.x, b0.y, r0, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(b1.x, b1.y, r1, 0, TAU); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b0.x - r0, b0.y); ctx.lineTo(b1.x - r1, b1.y);
  ctx.moveTo(b0.x + r0, b0.y); ctx.lineTo(b1.x + r1, b1.y);
  ctx.stroke();

  // 判定核心点
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, r0 * 0.42), 0, TAU);
  ctx.fillStyle = 'rgba(240,255,252,0.98)';
  ctx.fill();

  // 跳跃高度竖线：让「离地多高」有直接读数
  if (air) {
    const gp2 = project(player.x, 0.03, player.z);
    const fp = project(player.x, player.y + PLAYER.bodyLow, player.z);
    if (gp2 && fp) {
      ctx.beginPath();
      ctx.moveTo(fp.x, fp.y);
      ctx.lineTo(gp2.x, gp2.y);
      ctx.strokeStyle = 'rgba(' + COLORS.player + ',0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // K：擦弹圈（判定胶囊向外膨胀 GRAZE_R 的虚线范围）
  if (opts.hitbox) {
    const g0 = Math.max(1.5, (PLAYER.hitR + GRAZE_R) * b0.s);
    const g1 = Math.max(1.5, (PLAYER.hitR + GRAZE_R) * b1.s);
    ctx.strokeStyle = 'rgba(255,224,138,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(b0.x, b0.y, g0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(b1.x, b1.y, g1, 0, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b0.x - g0, b0.y); ctx.lineTo(b1.x - g1, b1.y);
    ctx.moveTo(b0.x + g0, b0.y); ctx.lineTo(b1.x + g1, b1.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.globalAlpha = 1;
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
