/** 危险物绘制：旋转激光、弹墙预警面。 */
import { project } from '../core/camera';
import { COLORS } from '../core/color';
import { TAU } from '../core/math';
import { ctx } from '../core/screen';
import { ARENA_R } from '../config';
import { clock, lasers, walls } from '../state';

export function drawLasers(): void {
  for (let i = 0; i < lasers.length; i++) {
    const l = lasers[i];
    const dx = Math.cos(l.ang), dz = Math.sin(l.ang);
    const LEN = ARENA_R + 6;
    const sx = l.x - dx * LEN, sz = l.z - dz * LEN;
    const ex = l.x + dx * LEN, ez = l.z + dz * LEN;
    const rgb = COLORS[l.cls] || COLORS.mid;
    const warm = l.warm > 0;
    const flick = warm ? (0.18 + 0.22 * Math.abs(Math.sin(clock.elapsed * 22))) : 1;

    // 地面投影线（告诉玩家这条激光扫过哪条地线）
    const ga = project(sx, 0.02, sz);
    const gb = project(ex, 0.02, ez);
    if (ga && gb) {
      if (warm) {
        // 预警：地面虚线，先告诉玩家危险要来
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(ga.x, ga.y);
        ctx.lineTo(gb.x, gb.y);
        ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.30 + 0.3 * flick) + ')';
        ctx.lineWidth = Math.max(1.5, 0.16 * ga.s);
        ctx.stroke();
        ctx.restore();
      } else if (l.y < 1.0) {
        // 低激光：贴地亮线，让“它就在地面上”这件事无可争议
        ctx.beginPath();
        ctx.moveTo(ga.x, ga.y);
        ctx.lineTo(gb.x, gb.y);
        ctx.strokeStyle = 'rgba(' + rgb + ',0.42)';
        ctx.lineWidth = Math.max(2, 0.16 * ga.s);
        ctx.stroke();
      }
    }

    // 高激光：两端画落地支脚，明确“它是悬空的”
    if (l.y > 1.2) {
      const feet = [[sx, sz], [ex, ez]];
      for (let f = 0; f < 2; f++) {
        const top = project(feet[f][0], l.y, feet[f][1]);
        const bot = project(feet[f][0], 0.02, feet[f][1]);
        if (!top || !bot) continue;
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bot.x, bot.y);
        ctx.strokeStyle = 'rgba(' + rgb + ',' + (warm ? 0.25 : 0.4) + ')';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    const a = project(sx, l.y, sz);
    const b = project(ex, l.y, ez);
    if (a && b) {
      const wAvg = (a.s + b.s) * 0.5;
      // 外层辉光
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.20 * flick) + ')';
      ctx.lineWidth = Math.max(4, 0.85 * wAvg);
      ctx.stroke();
      // 核心
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = warm
        ? 'rgba(' + rgb + ',' + (0.9 * flick) + ')'
        : 'rgba(255,255,255,' + (0.92 * flick) + ')';
      ctx.lineWidth = Math.max(1.5, 0.17 * wAvg);
      ctx.stroke();

      // 中心发射源
      const c0 = project(l.x, l.y, l.z);
      if (c0) {
        ctx.beginPath();
        ctx.arc(c0.x, c0.y, Math.max(4, 0.46 * c0.s), 0, TAU);
        ctx.fillStyle = 'rgba(' + rgb + ',' + (warm ? 0.5 : 0.95) + ')';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(c0.x, c0.y, Math.max(2, 0.2 * c0.s), 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
      }
    }
  }
}

export function drawWalls(): void {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const pulse = 0.18 + 0.2 * Math.abs(Math.sin(clock.elapsed * 12));
    const HGT = 3.0;
    const halfW = w.halfW;
    const gs = w.gapPos - w.gapW * 0.5;
    const ge = w.gapPos + w.gapW * 0.5;

    const panel = function (u0: number, u1: number, alpha: number, fillRgb: string) {
      const A = project(w.nx * w.D + w.tx * u0, 0, w.nz * w.D + w.tz * u0);
      const B = project(w.nx * w.D + w.tx * u1, 0, w.nz * w.D + w.tz * u1);
      const C = project(w.nx * w.D + w.tx * u1, HGT, w.nz * w.D + w.tz * u1);
      const D = project(w.nx * w.D + w.tx * u0, HGT, w.nz * w.D + w.tz * u0);
      if (!A || !B || !C || !D) return;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(C.x, C.y);
      ctx.lineTo(D.x, D.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + fillRgb + ',' + alpha + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + fillRgb + ',0.55)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    };

    panel(-halfW, gs, 0.05 + pulse * 0.35, '255,96,120');
    panel(ge, halfW, 0.05 + pulse * 0.35, '255,96,120');

    // 缺口提示：地面绿色箭头
    const gapX = w.nx * w.D + w.tx * w.gapPos;
    const gapZ = w.nz * w.D + w.tz * w.gapPos;
    const gp = project(gapX, 0.03, gapZ);
    if (gp) {
      ctx.beginPath();
      ctx.arc(gp.x, gp.y, Math.max(3, 0.9 * gp.s), 0, TAU);
      ctx.strokeStyle = 'rgba(120,255,190,' + (0.45 + 0.4 * pulse) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const tip = project(gapX - w.nx * 1.6, 0.03, gapZ - w.nz * 1.6);
    if (gp && tip) {
      const ang = Math.atan2(tip.y - gp.y, tip.x - gp.x);
      const L = Math.max(6, 0.55 * gp.s);
      ctx.beginPath();
      ctx.moveTo(gp.x, gp.y);
      ctx.lineTo(gp.x + Math.cos(ang) * L, gp.y + Math.sin(ang) * L);
      ctx.strokeStyle = 'rgba(120,255,190,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
