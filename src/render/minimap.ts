/**
 * 俯视雷达（左上角小圆）。
 *
 * 方向与相机对齐：雷达上方 = 屏幕前方。颜色同样 = 高度，
 * 实心 = 低空（要跳），空心 = 高空（别跳）—— 这条区分是小地图最关键的信息。
 */
import { TAU } from '../core/math';
import { cam } from '../core/camera';
import { COLORS } from '../core/color';
import { boss, bullets, lasers, opts, player, walls } from '../state';
import { satPos } from '../systems/boss-geometry';
import { ARENA_R } from '../config';

const miniEl = document.getElementById('minimap') as HTMLCanvasElement | null;
const miniCtx = miniEl ? miniEl.getContext('2d') : null;
const MINI_RANGE = 19.5;

export function drawMinimap(): void {
  if (!miniCtx || !miniEl || !opts.mini) return;
  const c = miniCtx;
  const MW = miniEl.width, MH = miniEl.height;
  c.clearRect(0, 0, MW, MH);

  const cx = MW / 2, cy = MH / 2;
  const R = Math.min(MW, MH) / 2 - 7;
  const k = R / MINI_RANGE;

  // 与相机对齐：雷达上方 = 屏幕前方，右侧 = 屏幕右方
  const fx = -Math.sin(cam.cy), fz = -Math.cos(cam.cy);
  const rx = Math.cos(cam.cy), rz = -Math.sin(cam.cy);
  const P = function (wx: number, wz: number) {
    const u = wx * rx + wz * rz;
    const v = wx * fx + wz * fz;
    return { x: cx + u * k, y: cy - v * k };
  };

  // 同心圆距离环
  for (let i = 1; i <= 3; i++) {
    const rr = R * (i / 3);
    c.beginPath();
    c.arc(cx, cy, rr, 0, TAU);
    c.strokeStyle = 'rgba(110,200,255,' + (i === 3 ? 0.26 : 0.11) + ')';
    c.lineWidth = i === 3 ? 1.6 : 1;
    c.stroke();
  }
  // 十字
  c.beginPath();
  c.moveTo(cx - R, cy); c.lineTo(cx + R, cy);
  c.moveTo(cx, cy - R); c.lineTo(cx, cy + R);
  c.strokeStyle = 'rgba(110,200,255,0.08)';
  c.lineWidth = 1;
  c.stroke();

  // 玩家 → boss 的射击方位线
  const pp = P(player.x, player.z);
  const bp = P(boss.x, boss.z);
  if (boss.alive) {
    c.beginPath();
    c.moveTo(pp.x, pp.y);
    c.lineTo(bp.x, bp.y);
    c.strokeStyle = 'rgba(255,86,160,0.16)';
    c.lineWidth = 1;
    c.setLineDash([3, 4]);
    c.stroke();
    c.setLineDash([]);
  }

  // 激光：俯视线段
  for (let i = 0; i < lasers.length; i++) {
    const l = lasers[i];
    const dx = Math.cos(l.ang), dz = Math.sin(l.ang);
    const LEN = ARENA_R + 6;
    const a = P(l.x - dx * LEN, l.z - dz * LEN), b = P(l.x + dx * LEN, l.z + dz * LEN);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.strokeStyle = 'rgba(' + (COLORS[l.cls] || COLORS.mid) + ',' + (l.warm > 0 ? 0.35 : 0.8) + ')';
    c.lineWidth = l.warm > 0 ? 1.4 : 3;
    c.stroke();
  }

  // 墙缝预警：红线 + 缺口
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const a = P(w.nx * w.D + w.tx * -w.halfW, w.nz * w.D + w.tz * -w.halfW);
    const b = P(w.nx * w.D + w.tx * w.halfW, w.nz * w.D + w.tz * w.halfW);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.strokeStyle = 'rgba(255,96,120,0.75)';
    c.lineWidth = 2.4;
    c.stroke();
    const ga = P(w.nx * w.D + w.tx * (w.gapPos - w.gapW), w.nz * w.D + w.tz * (w.gapPos - w.gapW));
    const gb = P(w.nx * w.D + w.tx * (w.gapPos + w.gapW), w.nz * w.D + w.tz * (w.gapPos + w.gapW));
    c.beginPath();
    c.moveTo(ga.x, ga.y);
    c.lineTo(gb.x, gb.y);
    c.strokeStyle = 'rgba(120,255,190,0.9)';
    c.lineWidth = 2.4;
    c.stroke();
  }

  // 弹幕：实心 = 低空 / 空心 = 高空
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    const q = P(b.x, b.z);
    if (q.x < 2 || q.x > MW - 2 || q.y < 2 || q.y > MH - 2) continue;
    if (b.cls === 'high') {
      c.beginPath();
      c.arc(q.x, q.y, 3.4, 0, TAU);
      c.strokeStyle = 'rgba(' + b.rgb + ',0.95)';
      c.lineWidth = 1.7;
      c.stroke();
    } else {
      c.beginPath();
      c.arc(q.x, q.y, b.cls === 'low' ? 3.4 : 2.9, 0, TAU);
      c.fillStyle = 'rgba(' + b.rgb + ',0.95)';
      c.fill();
    }
  }

  // boss + 卫星
  if (boss.alive) {
    for (let i = 0; i < boss.sats.length; i++) {
      const sp = satPos(i);
      const q = P(sp.x, sp.z);
      c.beginPath();
      c.arc(q.x, q.y, 3, 0, TAU);
      c.fillStyle = 'rgba(255,196,110,0.9)';
      c.fill();
    }
    c.beginPath();
    c.arc(bp.x, bp.y, 10, 0, TAU);
    c.fillStyle = 'rgba(255,86,160,0.25)';
    c.fill();
    c.beginPath();
    c.arc(bp.x, bp.y, 6, 0, TAU);
    c.fillStyle = 'rgba(255,140,190,0.98)';
    c.fill();
  }

  // 玩家：光晕 + 实心点
  c.beginPath();
  c.arc(pp.x, pp.y, 13, 0, TAU);
  c.fillStyle = 'rgba(150,255,210,0.12)';
  c.fill();
  c.beginPath();
  c.arc(pp.x, pp.y, 5.2, 0, TAU);
  c.fillStyle = 'rgba(190,255,235,1)';
  c.fill();
  c.beginPath();
  c.arc(pp.x, pp.y, 5.2, 0, TAU);
  c.strokeStyle = 'rgba(20,80,60,0.9)';
  c.lineWidth = 1.6;
  c.stroke();

  // 外框刻度
  c.fillStyle = 'rgba(120,160,200,0.42)';
  c.font = '15px "PingFang SC",system-ui,sans-serif';
  c.textAlign = 'center';
  c.fillText('前', cx, 16);
  c.fillText('后', cx, MH - 5);
}
