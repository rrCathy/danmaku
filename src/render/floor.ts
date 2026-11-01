/** 地面：圆形战场、世界锚定的网格、坐标轴、极坐标距离环、地面预警圈。 */
import { ARENA_R } from '../config';
import { project, polar } from '../core/camera';
import { ctx, H, W } from '../core/screen';
import { TAU, clamp } from '../core/math';
import { clock, rings } from '../state';

export function drawGroundCircle(
  x: number, z: number, r: number,
  stroke: string | null, fill: string | null, lw?: number
): void {
  const pts = [];
  for (let i = 0; i <= 44; i++) {
    const a = i / 44 * TAU;
    const p = project(x + Math.cos(a) * r, 0.03, z + Math.sin(a) * r);
    if (!p) return;
    pts.push(p);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
}

/** 预警圈：即将落下的东西。读秒越接近 0，外圈越亮、内圈越缩。 */
export function drawTelegraphs(): void {
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    const p = 1 - clamp(r.t / r.dur, 0, 1);
    const pulse = 0.35 + 0.55 * Math.abs(Math.sin(clock.elapsed * 9 + i));
    const rad = r.r * (1.18 - 0.18 * p);
    drawGroundCircle(r.x, r.z, rad,
      'rgba(74,224,255,' + (0.45 + 0.5 * pulse) + ')',
      'rgba(74,224,255,' + (0.06 + 0.10 * p) + ')',
      2);
    drawGroundCircle(r.x, r.z, rad * p,
      'rgba(74,224,255,' + (0.25 * pulse) + ')', null, 1.5);
  }
}

export function drawFloor(): void {
  const R = ARENA_R;

  const pts = [];
  let ok = true;
  for (let i = 0; i <= 72; i++) {
    const a = i / 72 * TAU;
    const p = project(Math.cos(a) * R, 0, Math.sin(a) * R);
    if (!p) { ok = false; break; }
    pts.push(p);
  }

  if (ok && pts.length > 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    const g = ctx.createRadialGradient(W / 2, H * 0.46, 40, W / 2, H * 0.56, Math.max(W, H) * 0.8);
    g.addColorStop(0, 'rgba(26,40,80,0.62)');
    g.addColorStop(0.55, 'rgba(14,22,48,0.72)');
    g.addColorStop(1, 'rgba(6,10,24,0.9)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(96,196,255,0.30)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // 网格是世界锚定的：转动镜头时网格跟着一起转，玩家才能感知到自己转了
  ctx.lineWidth = 1;
  for (let gx = -R; gx <= R + 0.01; gx += 3) {
    const half = Math.sqrt(Math.max(0, R * R - gx * gx));
    if (half < 0.6) continue;
    const a = project(gx, 0, -half), b = project(gx, 0, half);
    if (!a || !b) continue;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = 'rgba(80,140,220,0.16)';
    ctx.stroke();
  }
  for (let gz = -R; gz <= R + 0.01; gz += 3) {
    const half = Math.sqrt(Math.max(0, R * R - gz * gz));
    if (half < 0.6) continue;
    const a = project(-half, 0, gz), b = project(half, 0, gz);
    if (!a || !b) continue;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = 'rgba(80,140,220,0.16)';
    ctx.stroke();
  }

  // 中轴十字（世界坐标 X/Z 轴），做方位参照
  const ax1 = project(-R, 0, 0), ax2 = project(R, 0, 0);
  if (ax1 && ax2) {
    ctx.beginPath(); ctx.moveTo(ax1.x, ax1.y); ctx.lineTo(ax2.x, ax2.y);
    ctx.strokeStyle = 'rgba(120,200,255,0.30)'; ctx.lineWidth = 1.3; ctx.stroke();
  }
  const az1 = project(0, 0, -R), az2 = project(0, 0, R);
  if (az1 && az2) {
    ctx.beginPath(); ctx.moveTo(az1.x, az1.y); ctx.lineTo(az2.x, az2.y);
    ctx.strokeStyle = 'rgba(120,200,255,0.30)'; ctx.lineWidth = 1.3; ctx.stroke();
  }

  // 世界 +Z 方向的方位标：镜头一转，这个标记就会跑到屏幕侧面，能直接看出转了多少
  drawGroundCircle(0, 0, 0.9, 'rgba(120,200,255,0.28)', null, 1.4);
  const np = project(0, 0.02, R - 0.9);
  if (np) {
    ctx.beginPath();
    ctx.arc(np.x, np.y, Math.max(2.5, 0.22 * np.s), 0, TAU);
    ctx.fillStyle = 'rgba(150,255,210,0.75)';
    ctx.fill();
  }

  // 极坐标模式：叠加同心距离环 + 径向辐条（世界锚定，转圈时辐条会真实移动）
  if (polar.on) {
    for (let rr = 3; rr <= R; rr += 3) {
      const pts2 = [];
      let pok = true;
      for (let i = 0; i <= 64; i++) {
        const a2 = i / 64 * TAU;
        const q = project(Math.cos(a2) * rr, 0.012, Math.sin(a2) * rr);
        if (!q) { pok = false; break; }
        pts2.push(q);
      }
      if (!pok) continue;
      ctx.beginPath();
      ctx.moveTo(pts2[0].x, pts2[0].y);
      for (let i = 1; i < pts2.length; i++) ctx.lineTo(pts2[i].x, pts2[i].y);
      ctx.strokeStyle = rr % 9 === 0 ? 'rgba(110,232,255,0.26)' : 'rgba(110,200,255,0.12)';
      ctx.lineWidth = rr % 9 === 0 ? 1.5 : 1;
      ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a2 = i / 24 * TAU;
      const p1 = project(Math.cos(a2) * 1.0, 0.014, Math.sin(a2) * 1.0);
      const p2 = project(Math.cos(a2) * R, 0.014, Math.sin(a2) * R);
      if (!p1 || !p2) continue;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = i % 6 === 0 ? 'rgba(150,255,210,0.30)' : 'rgba(110,180,255,0.11)';
      ctx.lineWidth = i % 6 === 0 ? 1.4 : 1;
      ctx.stroke();
    }
  }
}
