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

export function drawPlayer(p: Projected): void {
  if (!opts.playerBox) return;   // 碰撞箱显示开关（B）
  const blink = player.inv > 0 && Math.floor(player.inv * 22) % 2 === 0;
  const air = player.y > 0.08;

  /* 玩家 = 判定胶囊本身（不画人物模型）。
   * 画法用「一根粗光棒 + 核心点」而不是圆头胶囊 —— 端圆在低角度透视下会缩成椭圆，
   * 看起来像"套着一个莫名的椭圆"。光棒在屏幕上的粗细直接就是判定截面。 */
  const b0 = project(player.x, player.y + PLAYER.bodyLow, player.z);
  const b1 = project(player.x, player.y + PLAYER.bodyHigh, player.z);
  if (!b0 || !b1) return;
  const r0 = Math.max(2, PLAYER.hitR * b0.s);
  const cx = (b0.x + b1.x) / 2, cy = (b0.y + b1.y) / 2;

  ctx.globalAlpha = blink ? 0.42 : 1;

  // 辉光：远处也能看见自己
  const gr = Math.max(10, 0.8 * p.s);
  const g = glowSprite(COLORS.player);
  ctx.globalAlpha *= 0.5;
  ctx.drawImage(g, cx - gr, cy - gr, gr * 2, gr * 2);
  ctx.globalAlpha = blink ? 0.42 : 1;

  // 擦弹圈（K 开时）：判定胶囊外扩 GRAZE_R 的半透明光壳。
  // 用「比本体粗一圈的柔和实线」表达范围 —— 不画虚线（会变成一排横杠）、不画线框椭圆。
  if (opts.hitbox) {
    ctx.strokeStyle = 'rgba(255,214,120,0.15)';
    ctx.lineWidth = Math.max(4, (PLAYER.hitR + GRAZE_R) * 2 * b0.s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.stroke();
    // 边缘一圈极淡的描边，让范围边界可读
    ctx.strokeStyle = 'rgba(255,214,120,0.05)';
    ctx.lineWidth = Math.max(5, (PLAYER.hitR + GRAZE_R) * 2 * b0.s + 1.5);
    ctx.stroke();
  }

  // 本体光棒：屏幕上的粗细 = 判定截面直径
  ctx.strokeStyle = 'rgba(' + COLORS.player + ',0.9)';
  ctx.lineWidth = r0 * 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(b0.x, b0.y);
  ctx.lineTo(b1.x, b1.y);
  ctx.stroke();

  // 内芯：细白线，指示胶囊轴
  ctx.strokeStyle = 'rgba(240,255,252,0.55)';
  ctx.lineWidth = Math.max(1, r0 * 0.35);
  ctx.beginPath();
  ctx.moveTo(b0.x, b0.y);
  ctx.lineTo(b1.x, b1.y);
  ctx.stroke();

  // 判定核心点
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, r0 * 0.5), 0, TAU);
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
