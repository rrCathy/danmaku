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

/** 弹的朝向正交基：f = 速度方向，u/w 与 f 正交 */
function bulletBasis(b: Bullet): Array<[number, number, number]> {
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  if (sp < 1e-6) return [[0, 0, 1], [1, 0, 0], [0, 1, 0]];
  const fx = b.vx / sp, fy = b.vy / sp, fz = b.vz / sp;
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(fy) > 0.9) { ux = 1; uy = 0; }
  let wx = fy * uz - fz * uy, wy = fz * ux - fx * uz, wz = fx * uy - fy * ux;
  const wl = Math.hypot(wx, wy, wz) || 1;
  wx /= wl; wy /= wl; wz /= wl;
  const u2x = wy * fz - wz * fy, u2y = wz * fx - wx * fz, u2z = wx * fy - wy * fx;
  return [[fx, fy, fz], [u2x, u2y, u2z], [wx, wy, wz]];
}

/** 弹局部坐标 → 世界 → 屏幕（3D 形状用） */
function localToScreen(b: Bullet, B: Array<[number, number, number]>, a: number, c: number, d: number) {
  return project(
    b.x + B[0][0] * a + B[1][0] * c + B[2][0] * d,
    b.y + B[0][1] * a + B[1][1] * c + B[2][1] * d,
    b.z + B[0][2] * a + B[1][2] * c + B[2][2] * d
  );
}

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

  const shape = b.shape || 'ball';
  const g = glowSprite(b.rgb);
  // 3D 形状弹幕只留一圈小柔光：大辉光会在盒子/锥体内部形成一颗"胶囊光斑"
  const is3DShape = shape === 'box' || shape === 'arrow' || shape === 'tetra' || shape === 'octa';
  const gs = is3DShape ? rp * 3.0 : rp * 6.4;
  ctx.globalAlpha = is3DShape ? 0.34 : 0.85;
  ctx.drawImage(g, p.x - gs / 2, p.y - gs / 2, gs, gs);
  ctx.globalAlpha = 1;

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

  const B = bulletBasis(b);
  const col = 'rgba(' + b.rgb + ',';

  if (shape === 'box') {
    /* 真 3D 长方体：8 个顶点投影。转视角能看到厚度 —— 不是贴在屏幕上的方块贴纸 */
    const L = (b.len || 2.2) * b.r;        // 总长（沿运动方向）
    const hw = b.r * 0.92;                 // 半宽 / 半高
    const hx = L / 2;
    const P = [
      localToScreen(b, B, hx, -hw, -hw), localToScreen(b, B, hx, hw, -hw),
      localToScreen(b, B, hx, hw, hw), localToScreen(b, B, hx, -hw, hw),
      localToScreen(b, B, -hx, -hw, -hw), localToScreen(b, B, -hx, hw, -hw),
      localToScreen(b, B, -hx, hw, hw), localToScreen(b, B, -hx, -hw, hw)
    ];
    if (P.every(function (q) { return q !== null; })) {
      const v = P as Array<{ x: number; y: number }>;
      // 6 个面的棱（12 条）
      const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
      ];
      // 半透明填充三个「朝前」的面（用屏幕面积方向粗判）
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y); ctx.lineTo(v[1].x, v[1].y);
      ctx.lineTo(v[2].x, v[2].y); ctx.lineTo(v[3].x, v[3].y);
      ctx.closePath();
      ctx.fillStyle = col + '0.5)';
      ctx.fill();
      ctx.beginPath();
      for (let e = 0; e < edges.length; e++) {
        ctx.moveTo(v[edges[e][0]].x, v[edges[e][0]].y);
        ctx.lineTo(v[edges[e][1]].x, v[edges[e][1]].y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(0.8, rp * 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y); ctx.lineTo(v[4].x, v[4].y);
      ctx.moveTo(v[1].x, v[1].y); ctx.lineTo(v[5].x, v[5].y);
      ctx.moveTo(v[2].x, v[2].y); ctx.lineTo(v[6].x, v[6].y);
      ctx.moveTo(v[3].x, v[3].y); ctx.lineTo(v[7].x, v[7].y);
      ctx.strokeStyle = col + '0.9)';
      ctx.lineWidth = Math.max(1, rp * 0.22);
      ctx.stroke();
    }
    return;
  }

  if (shape === 'octa') {
    /* 狭长八面体（钻石/双锥）：6 顶点 = 前后两尖 + 腰部 4 点，8 个三角面。
     * 放射锥用这个 —— 比锥体更"锐利"，从任何角度看都是立体的 */
    const L = (b.len || 3.4) * b.r;
    const hw = b.r * 0.62;
    const tipF = localToScreen(b, B, L * 0.5, 0, 0);
    const tipB = localToScreen(b, B, -L * 0.5, 0, 0);
    const belt = [
      localToScreen(b, B, 0, hw, hw),
      localToScreen(b, B, 0, -hw, hw),
      localToScreen(b, B, 0, -hw, -hw),
      localToScreen(b, B, 0, hw, -hw)
    ];
    if (tipF && tipB && belt.every(function (q) { return q !== null; })) {
      const f0 = tipF as { x: number; y: number };
      const b0p = tipB as { x: number; y: number };
      const bl = belt as Array<{ x: number; y: number }>;
      // 8 个三角面：每个腰点与前后尖各组成两个面
      for (let i = 0; i < 4; i++) {
        const a1 = bl[i], a2 = bl[(i + 1) % 4];
        // 朝前一侧
        ctx.beginPath();
        ctx.moveTo(f0.x, f0.y);
        ctx.lineTo(a1.x, a1.y);
        ctx.lineTo(a2.x, a2.y);
        ctx.closePath();
        ctx.fillStyle = col + (i % 2 === 0 ? '0.62)' : '0.4)');
        ctx.fill();
        // 朝后一侧
        ctx.beginPath();
        ctx.moveTo(b0p.x, b0p.y);
        ctx.lineTo(a1.x, a1.y);
        ctx.lineTo(a2.x, a2.y);
        ctx.closePath();
        ctx.fillStyle = col + (i % 2 === 0 ? '0.3)' : '0.48)');
        ctx.fill();
      }
      // 腰部方框 + 4 条到两尖的棱
      ctx.beginPath();
      ctx.moveTo(bl[0].x, bl[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(bl[i].x, bl[i].y);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.lineWidth = Math.max(0.8, rp * 0.13);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(f0.x, f0.y);
        ctx.lineTo(bl[i].x, bl[i].y);
        ctx.moveTo(b0p.x, b0p.y);
        ctx.lineTo(bl[i].x, bl[i].y);
      }
      ctx.strokeStyle = col + '0.95)';
      ctx.lineWidth = Math.max(1, rp * 0.18);
      ctx.stroke();
    }
    return;
  }

  if (shape === 'arrow') {
    /* 真 3D 锥体箭头：锥尖 + 4 个底角顶点。从侧面看是立体的锥，不是三角贴纸 */
    const L = (b.len || 3.4) * b.r;
    const hw = b.r * 0.85;
    const tip = localToScreen(b, B, L * 0.5, 0, 0);
    const base = [
      localToScreen(b, B, -L * 0.2, hw, hw),
      localToScreen(b, B, -L * 0.2, -hw, hw),
      localToScreen(b, B, -L * 0.2, -hw, -hw),
      localToScreen(b, B, -L * 0.2, hw, -hw)
    ];
    if (tip && base.every(function (q) { return q !== null; })) {
      const t = tip as { x: number; y: number };
      const bb = base as Array<{ x: number; y: number }>;
      // 4 个侧面（半透明）+ 底框 + 4 条侧棱
      for (let i = 0; i < 4; i++) {
        const a1 = bb[i], a2 = bb[(i + 1) % 4];
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(a1.x, a1.y);
        ctx.lineTo(a2.x, a2.y);
        ctx.closePath();
        ctx.fillStyle = col + (i % 2 === 0 ? '0.55)' : '0.34)');
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(bb[0].x, bb[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(bb[i].x, bb[i].y);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = Math.max(0.8, rp * 0.14);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(bb[i].x, bb[i].y);
      }
      ctx.strokeStyle = col + '0.95)';
      ctx.lineWidth = Math.max(1, rp * 0.2);
      ctx.stroke();
    }
    return;
  }

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(tp ? Math.atan2(p.y - tp.y, p.x - tp.x) : -Math.PI / 2);

  if (shape === 'tetra') {
    // 正四面体：3D 顶点投影成线框 + 半透明面，绕速度轴自旋
    const S = b.r * 1.35;
    const spin = (8 - (b.life || 0)) * 3.1;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const V: Array<[number, number, number]> = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    const pts: Array<{ x: number; y: number }> = [];
    for (let vi = 0; vi < 4; vi++) {
      const vv = V[vi];
      const lu = vv[0] * 0.577, lv0 = (vv[1] * cs - vv[2] * sn) * 0.577, lw0 = (vv[1] * sn + vv[2] * cs) * 0.577;
      const pr = localToScreen(b, B, lu * S, lv0 * S, lw0 * S);
      if (pr) pts.push({ x: pr.x, y: pr.y });
    }
    if (pts.length === 4) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let vi = 1; vi < 4; vi++) ctx.lineTo(pts[vi].x, pts[vi].y);
      ctx.closePath();
      ctx.fillStyle = col + '0.5)';
      ctx.fill();
      ctx.lineWidth = Math.max(1, rp * 0.22);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[3].x, pts[3].y);
      ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[3].x, pts[3].y);
      ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.stroke();
    }
  } else { // ellip：水滴 / 椭球（球体投影本身就是椭圆，屏幕空间画法成立）
    const rx = rp * (b.len || 1.8), ry = rp * 1.02;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fillStyle = col + '0.85)';
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

/* ============ 玩家：3D 几何小人 ============ */

/** 水平横截面圆 → 屏幕多边形（3D 逐点投影，俯视时自然收拢） */
function ringPts(cx: number, cz: number, y: number, r: number, seg: number): Array<{ x: number; y: number }> | null {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg * TAU;
    const q = project(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
    if (!q) return null;
    out.push(q);
  }
  return out;
}

/** 截锥侧面（两个水平环之间的条带，逐段四边形填充） */
function band(cx: number, cz: number, y0: number, r0: number, y1: number, r1: number,
  seg: number, fill: string, stroke?: string): void {
  const A = ringPts(cx, cz, y0, r0, seg);
  const B = ringPts(cx, cz, y1, r1, seg);
  if (!A || !B) return;
  ctx.fillStyle = fill;
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    ctx.beginPath();
    ctx.moveTo(A[i].x, A[i].y);
    ctx.lineTo(A[j].x, A[j].y);
    ctx.lineTo(B[j].x, B[j].y);
    ctx.lineTo(B[i].x, B[i].y);
    ctx.closePath();
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(A[0].x, A[0].y);
    for (let i = 1; i < A.length; i++) ctx.lineTo(A[i].x, A[i].y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(B[0].x, B[0].y);
    for (let i = 1; i < B.length; i++) ctx.lineTo(B[i].x, B[i].y);
    ctx.stroke();
  }
}

export function drawPlayer(p: Projected): void {
  const blink = player.inv > 0 && Math.floor(player.inv * 22) % 2 === 0;
  const air = player.y > 0.08;
  const s = p.s;
  const PX = player.x, PY = player.y, PZ = player.z;

  ctx.globalAlpha = blink ? 0.45 : 1;

  // 辉光：躯干中段一圈柔光，远处也能一眼定位自己
  const gp = project(PX, PY + 1.10, PZ);
  if (gp) {
    const gr = Math.max(12, 1.05 * s);
    const g = glowSprite(COLORS.player);
    ctx.globalAlpha *= 0.30;
    ctx.drawImage(g, gp.x - gr, gp.y - gr, gr * 2, gr * 2);
    ctx.globalAlpha = blink ? 0.45 : 1;
  }

  /* 模型比例（世界单位，脚底 y=0；总高 1.83，约 7.1 头身）：
   *   腿      0    ~ 0.96
   *   短裙    0.78 r0.198（下摆）→ 1.14 r0.118（裙腰）
   *   收腰    1.18 r0.100（最细，直径 0.20 = 肩宽的 0.57）
   *   上腹    1.28 r0.126
   *   胸      1.38 r0.152
   *   肩      1.48 r0.174（肩宽 0.348）
   *   颈      1.52 ~ 1.62
   *   头      球心 1.73 r0.128（头宽 0.256 = 肩宽的 0.73，7.3 头身；总高 1.86）
   * 判定胶囊仍是 0.57~1.03（玩法不动），只在视觉上按"自机判定点"画成小圆环 */

  // 腿（3D 线段，腿根藏在裙内）
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(96,200,180,0.95)';
  ctx.lineWidth = Math.max(1.8, 0.072 * s);
  for (let li = 0; li < 2; li++) {
    const sx = li === 0 ? -1 : 1;
    const a = project(PX + sx * 0.080, PY + 0.98, PZ);
    const b = project(PX + sx * 0.098, PY + (air ? 0.22 : 0.03), PZ);
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // 胯：裙底封口（实心盘，遮住裙内空腔，让腿和身体连成一体）
  const hipBot = ringPts(PX, PZ, PY + 0.76, 0.150, 10);
  const hipTop = ringPts(PX, PZ, PY + 0.80, 0.186, 10);
  if (hipBot && hipTop) {
    ctx.fillStyle = 'rgba(30,96,90,0.97)';
    for (let i = 0; i < 10; i++) {
      const j = (i + 1) % 10;
      ctx.beginPath();
      ctx.moveTo(hipBot[i].x, hipBot[i].y);
      ctx.lineTo(hipBot[j].x, hipBot[j].y);
      ctx.lineTo(hipTop[j].x, hipTop[j].y);
      ctx.lineTo(hipTop[i].x, hipTop[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 短裙：下摆 0.94 r0.196 → 裙腰 1.14 r0.118（只到大腿根）
  band(PX, PZ, PY + 0.78, 0.198, PY + 1.14, 0.118, 12, 'rgba(46,140,130,0.95)', 'rgba(150,255,230,0.40)');

  // 躯干：7 段拟合沙漏（腰 1.18 r0.100 → 胸 1.38 r0.152 → 肩 1.48 r0.174）
  band(PX, PZ, PY + 1.14, 0.118, PY + 1.18, 0.100, 12, 'rgba(88,206,182,0.96)');
  band(PX, PZ, PY + 1.18, 0.100, PY + 1.28, 0.126, 12, 'rgba(92,210,186,0.96)');
  band(PX, PZ, PY + 1.28, 0.126, PY + 1.38, 0.152, 12, 'rgba(96,214,190,0.96)');
  band(PX, PZ, PY + 1.38, 0.152, PY + 1.48, 0.174, 12, 'rgba(100,218,194,0.96)');
  // 肩顶：两级收弧，做出圆肩（避免一条平盖子）
  band(PX, PZ, PY + 1.48, 0.174, PY + 1.52, 0.136, 12, 'rgba(120,226,202,0.96)', 'rgba(226,255,246,0.35)');
  band(PX, PZ, PY + 1.52, 0.136, PY + 1.55, 0.078, 12, 'rgba(150,236,214,0.95)');

  // 手臂（肩 → 手，末端一个小手圆点；跳跃时抬成 V 字）
  ctx.strokeStyle = 'rgba(140,240,215,0.95)';
  ctx.lineWidth = Math.max(1.4, 0.050 * s);
  for (let ai = 0; ai < 2; ai++) {
    const sx = ai === 0 ? -1 : 1;
    const a = project(PX + sx * 0.162, PY + 1.44, PZ);
    const b = project(PX + sx * (air ? 0.30 : 0.238), PY + (air ? 1.56 : 1.00), PZ);
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(1.2, 0.026 * s), 0, TAU);
      ctx.fillStyle = 'rgba(170,250,228,0.95)';
      ctx.fill();
    }
  }

  // 颈
  const na = project(PX, PY + 1.52, PZ);
  const nb = project(PX, PY + 1.62, PZ);
  if (na && nb) {
    ctx.strokeStyle = 'rgba(210,255,240,0.92)';
    ctx.lineWidth = Math.max(1.4, 0.048 * s);
    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    ctx.stroke();
  }

  // 头（球：投影中心 + 半径，俯视永远是个圆）
  const head = project(PX, PY + 1.73, PZ);
  if (head) {
    const hr = Math.max(2.2, 0.128 * (head.s || s));
    ctx.beginPath();
    ctx.arc(head.x, head.y, hr, 0, TAU);
    ctx.fillStyle = 'rgba(245,255,252,0.98)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,235,205,0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 刘海：头顶前半圈的一道弧，给一点朝向感
    ctx.beginPath();
    ctx.arc(head.x, head.y, hr * 0.68, Math.PI * 1.16, Math.PI * 1.84);
    ctx.strokeStyle = 'rgba(90,200,180,0.85)';
    ctx.lineWidth = Math.max(1, hr * 0.18);
    ctx.stroke();
  }

  // 跳跃高度竖线
  if (air) {
    const g0 = project(PX, 0.03, PZ);
    const f0 = project(PX, PY, PZ);
    if (g0 && f0) {
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y);
      ctx.lineTo(g0.x, g0.y);
      ctx.strokeStyle = 'rgba(' + COLORS.player + ',0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 判定（B 开关）：**判定胶囊本体**（半径 hitR、高 bodyLow~bodyHigh）
  if (opts.playerBox) {
    const b0 = project(PX, PY + PLAYER.bodyLow, PZ);   // 下沿
    const b1 = project(PX, PY + PLAYER.bodyHigh, PZ);  // 上沿
    if (b0 && b1) {
      const r0 = Math.max(1.6, PLAYER.hitR * b0.s);
      const r1 = Math.max(1.6, PLAYER.hitR * b1.s);

      // 擦弹圈（K）：判定胶囊外扩 GRAZE_R 的一层柔光壳
      if (opts.hitbox) {
        ctx.strokeStyle = 'rgba(255,214,120,0.16)';
        ctx.lineWidth = Math.max(4, (PLAYER.hitR + GRAZE_R) * 2 * b0.s);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b0.x, b0.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.stroke();
      }

      // 胶囊形状：屏幕空间沿轴线方向做两个半圆 + 两条侧边（任意视角都成立）
      const ax = b1.x - b0.x, ay = b1.y - b0.y;
      const al = Math.hypot(ax, ay) || 1;
      const ux = ax / al, uy = ay / al;          // 轴向（下沿 → 上沿）
      const a0 = Math.atan2(ux, -uy);            // 垂直于轴的起始角
      const path = function (): void {
        ctx.beginPath();
        ctx.arc(b0.x, b0.y, r0, a0, a0 + Math.PI);            // 下帽（背离上沿）
        ctx.arc(b1.x, b1.y, r1, a0 + Math.PI, a0 + TAU);       // 上帽
        ctx.closePath();
      };

      // 半透明体积：看得见"哪里会被打中"
      path();
      ctx.fillStyle = 'rgba(255,120,170,0.16)';
      ctx.fill();

      // 轮廓：细实线（不是虚线圈，也不是椭圆套人）
      path();
      ctx.strokeStyle = 'rgba(255,180,205,0.9)';
      ctx.lineWidth = Math.max(1, Math.min(1.8, r0 * 0.16));
      ctx.stroke();

      // 中心命门点：小实心点，标"判定点在哪"
      const cx = (b0.x + b1.x) / 2, cy = (b0.y + b1.y) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.3, r0 * 0.34), 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();
    }
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
