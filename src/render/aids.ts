/**
 * 可读性辅助层：地面投影、高度引导线、拖尾 / 预测线、冲刺残影。
 * 这些都能用 G / H / T 单独关掉，方便做「有辅助 vs 无辅助」的对照实验。
 */
import { project } from '../core/camera';
import { COLORS } from '../core/color';
import { clamp } from '../core/math';
import { ctx, W } from '../core/screen';
import { shadowSprite, glowSprite } from '../core/sprites';
import { boss, bullets, ghosts, opts, player } from '../state';
import { drawGroundCircle } from './floor';
import { TAU } from '../core/math';

function drawShadowAt(x: number, z: number, worldR: number, alpha: number): void {
  const p = project(x, 0.02, z);
  if (!p) return;
  const rp = worldR * p.s;
  if (rp < 0.5) return;
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.drawImage(shadowSprite(), p.x - rp, p.y - rp * 0.5, rp * 2, rp * 1.0);
  ctx.globalAlpha = 1;
}

export function drawShadows(): void {
  // 子弹投影：只给「明显离地」的弹画，并限制总数 —— 全量画是 gate 那种弹墙卡顿的主因
  const MAX_SHADOWS = 56;
  let drawn = 0;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (b.y < 0.9) continue;                 // 贴地弹不需要投影
    if (drawn >= MAX_SHADOWS) break;
    drawn++;
    const a = clamp(1 - b.y / 14, 0.18, 0.8);
    drawGroundCircle(
      b.x, b.z, b.r * 1.5,
      'rgba(' + b.rgb + ',' + (0.62 * a).toFixed(3) + ')',
      'rgba(' + b.rgb + ',' + (0.11 * a).toFixed(3) + ')',
      1.7, 10
    );
    // 影子中心的小亮点，帮助判断落点
    const c = project(b.x, 0.04, b.z);
    if (c) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(1, b.r * c.s * 0.55), 0, TAU);
      ctx.fillStyle = 'rgba(' + b.rgb + ',' + (0.75 * a).toFixed(3) + ')';
      ctx.fill();
    }
  }

  if (boss.alive) drawShadowAt(boss.x, boss.z, 1.9, 0.42);
  drawShadowAt(player.x, player.z, 0.66 * clamp(1 - player.y * 0.16, 0.4, 1), 0.62);
}

export function drawGuides(): void {
  ctx.lineWidth = 1;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (b.y < 1.2) continue;      // 低弹的引导线没信息量，还费 —— 只画明显离地的
    const p1 = project(b.x, b.y, b.z);
    const p2 = project(b.x, 0.03, b.z);
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = 'rgba(' + b.rgb + ',0.18)';
    ctx.stroke();
  }
  if (boss.alive) {
    const p1 = project(boss.x, boss.y, boss.z);
    const p2 = project(boss.x, 0.03, boss.z);
    if (p1 && p2) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = 'rgba(255,86,160,0.16)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

export function drawPlaneTrails(): void {
  const mode = opts.trailMode;
  if (!mode) return;

  const showTrail = (mode === 1 || mode === 3);
  const showPredict = (mode === 2 || mode === 3);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 小屏幕上按比例收细，否则近处弹的拖尾会粗得比弹还抢眼
  const lwScale = Math.min(1, Math.max(0.52, W / 1500));

  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (b.kind === 'rain') continue;
    const dist = Math.hypot(b.x - player.x, b.z - player.z);
    if (dist > 13) continue;

    /* ---- 拖尾：子弹已经飞过的路径，画在它自己的高度上，永远落在弹的后面 ---- */
    if (showTrail) {
      const tr = b.trail;
      if (tr && tr.length >= 12) {
        const n = tr.length;

        // 后半段淡、靠近弹头的部分亮
        const strokeRange = function (from: number, to: number, alpha: number, lw: number) {
          ctx.beginPath();
          let started = false;
          for (let k = from; k < to; k += 3) {
            const q = project(tr[k], tr[k + 1], tr[k + 2]);
            if (!q) { started = false; continue; }
            if (!started) { ctx.moveTo(q.x, q.y); started = true; }
            else ctx.lineTo(q.x, q.y);
          }
          if (!started) return;
          ctx.strokeStyle = 'rgba(' + b.rgb + ',' + alpha + ')';
          ctx.lineWidth = lw;
          ctx.stroke();
        };

        const SEG = 5;
        for (let g = 0; g < SEG; g++) {
          const a0 = Math.floor(n * g / SEG / 3) * 3;
          const a1 = Math.min(n, Math.floor(n * (g + 1) / SEG / 3) * 3 + 3);
          const t2 = g / (SEG - 1);
          strokeRange(a0, a1, 0.04 + 0.28 * t2 * t2, (1.3 + 1.1 * t2) * lwScale);
        }
        strokeRange(Math.max(0, n - 9), n, 0.85, 2.4 * lwScale);
      }
    }

    /* ---- 预测：很短的一段虚线，从弹头往前 0.5 秒，不会跑到很远 ---- */
    if (showPredict) {
      let x = b.x, y = b.y, z = b.z;
      const s0 = project(x, y, z);
      if (!s0) continue;
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      let drew = false;
      for (let k = 0; k < 9; k++) {
        x += b.vx * 0.06; y += b.vy * 0.06; z += b.vz * 0.06;
        if (y < 0.05) break;
        const q = project(x, y, z);
        if (!q) break;
        ctx.lineTo(q.x, q.y);
        drew = true;
      }
      if (!drew) continue;
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(' + b.rgb + ',0.22)';
      ctx.lineWidth = 1.2 * lwScale;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
}

export function drawGhostsLayer(): void {
  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    const p = project(g.x, g.y + 0.7, g.z);
    if (!p) continue;
    const a = clamp(g.life / g.max, 0, 1);
    const s = p.s;
    ctx.globalAlpha = a * 0.30;
    ctx.drawImage(glowSprite(COLORS.player), p.x - 1.0 * s, p.y - 1.35 * s, 2.0 * s, 2.7 * s);
    ctx.globalAlpha = a * 0.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2, 0.22 * s), 0, TAU);
    ctx.fillStyle = 'rgba(190,255,235,0.85)';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
