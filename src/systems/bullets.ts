/**
 * 子弹生命周期与碰撞。
 *
 * 所有「弹幕长什么样、会不会打中人」的判断都集中在这一个循环里：
 * 位置积分 → 每帧重算高度色 → 生命周期（落雨 / 地雷 / 地涌）→ 出界 → 碰玩家。
 */
import { ARENA_R, DIAG_KEEP, PLAYER } from '../config';
import { CLASS_INFO, COLORS, clsByHeight, clsName, heightRGB } from '../core/color';
import { random } from '../core/random';
import { segPointDist } from '../core/math';
import { cam } from '../core/camera';
import { isTouch } from '../core/device';
import { boss, bullets, clock, logs, opts, player, pshots, rings, session, state, stats, training } from '../state';
import { spawnSpark } from './effects';
import { damageBoss } from './boss';
import { updateHud } from '../ui/hud';
import { renderDiag } from '../ui/diag';
import { toast } from '../ui/toast';
import { endGame } from '../ui/flow';
import type { Bullet, BulletShape, HClass } from '../types';

export function addBullet(
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  r: number, cls: HClass, kind: Bullet['kind'],
  shape?: BulletShape, len?: number
): void {
  // 难度倍率 × 训练场倍率，在这里统一生效：所有图案都走这个工厂，不用各自改
  const k = session.bulletSpeed * training.speed;
  bullets.push({
    x, y, z,
    px: x, py: y, pz: z,
    vx: k === 1 ? vx : vx * k,
    vy: k === 1 ? vy : vy * k,
    vz: k === 1 ? vz : vz * k,
    r, cls, kind,
    rgb: heightRGB(y),
    homing: kind === 'orbit' ? 1 : 0,
    life: kind === 'orbit' ? 7 : 8,
    shape, len,
    trail: null, tk: 0
  });
}

/** 地雷爆炸：一圈低空弹（可以起跳躲） */
export function explodeMine(b: Bullet): void {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + random() * 0.28;
    addBullet(b.x, 0.55, b.z, Math.cos(a) * 7.6, 0, Math.sin(a) * 7.6, 0.20, 'low', 'mineBurst');
  }
  for (let k = 0; k < 14; k++) spawnSpark(b.x, 0.5, b.z, COLORS.low, 1.2);
  cam.shakeAmp = Math.max(cam.shakeAmp, 3);
}

/** 玩家判定：竖直胶囊，半径 0.26，下沿 +0.18、上沿 +1.42 */
export function hitPlayer(b: Bullet): boolean {
  const d = segPointDist(
    b.x, b.y, b.z,
    player.x, player.y + PLAYER.bodyLow, player.z,
    player.x, player.y + PLAYER.bodyHigh, player.z
  );
  return d < PLAYER.hitR + b.r;
}

/** 非球形弹的尾部球（上一帧位置）：头 + 尾 = 扫掠胶囊的离散近似，防快速弹隧穿 */
function hitPlayerTail(b: Bullet): boolean {
  const d = segPointDist(
    b.px, b.py, b.pz,
    player.x, player.y + PLAYER.bodyLow, player.z,
    player.x, player.y + PLAYER.bodyHigh, player.z
  );
  return d < PLAYER.hitR + b.r;
}

export function updateBullets(dt: number): void {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.px = b.x; b.py = b.y; b.pz = b.z;

    // 俯冲弹：先悬停读秒，时间到垂直砸向地面标记点
    if (b.kind === 'dive') {
      if (b.fuse !== undefined && b.fuse > 0) {
        b.fuse -= dt;
        if (b.fuse <= 0) {
          b.vy = -23;
          for (let k = 0; k < 4; k++) spawnSpark(b.x, b.y, b.z, COLORS.rain, 0.8);
        }
      }
    }

    // 诱饵：降到 1.78m 突然改成水平冲刺 —— 紫色说"还很高"，实际在打你腰
    if (b.kind === 'feint' && b.fuse && b.y <= 1.78) {
      b.fuse = 0;
      b.y = 1.78;
      const dx = player.x - b.x, dz = player.z - b.z;
      const dl = Math.hypot(dx, dz) || 1;
      const sp = 9.6;
      b.vx = dx / dl * sp;
      b.vz = dz / dl * sp;
      b.vy = 0;
      for (let k = 0; k < 5; k++) spawnSpark(b.x, b.y, b.z, COLORS.high, 0.7);
    }

    if (b.homing) {
      const spd = 4.2;
      const dx = player.x - b.x;
      const dy = (player.y + 0.85) - b.y;
      const dz = player.z - b.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const k = Math.min(1, dt * 1.4);
      b.vx += (dx / l * spd - b.vx) * k;
      b.vy += (dy / l * spd - b.vy) * k;
      b.vz += (dz / l * spd - b.vz) * k;
    }

    // 抛物线弹（喷泉）：只有显式带 grav 的弹受影响，旧图案 grav=undefined 零变化
    if (b.grav) b.vy -= b.grav * dt;

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.life -= dt;
    b.rgb = heightRGB(b.y);   // 颜色永远跟着当前高度走
    // 落雨类的语义分段固定为 rain（诊断文案「落点雨」），其余按当前高度重算
    b.cls = (b.kind === 'rain' || b.kind === 'downpour') ? 'rain' : clsName(b.y);

    if (opts.trailMode === 1 || opts.trailMode === 3) {
      b.tk -= dt;
      if (b.tk <= 0) {
        b.tk = 0.045;
        if (!b.trail) b.trail = [];
        b.trail.push(b.x, b.y, b.z);
        if (b.trail.length > 66) b.trail.splice(0, 3);
      }
    }

    if ((b.kind === 'rain' || b.kind === 'downpour' || b.kind === 'fountain') && b.y <= 0.12) {
      for (let k = 0; k < 5; k++) spawnSpark(b.x, 0.15, b.z, COLORS.rain, 0.8);
      bullets.splice(i, 1);
      continue;
    }

    // 反雨（真反雨）：从地面背面穿地升到约 1.5m 就结束 —— 轨迹短，颜色全程在低层
    if (b.kind === 'uprain' && b.y > 1.5) {
      for (let k = 0; k < 3; k++) spawnSpark(b.x, b.y, b.z, b.rgb, 0.5);
      bullets.splice(i, 1);
      continue;
    }

    // 地雷：砸到地面后固定住，读秒结束向四周炸开一圈低空弹
    if (b.kind === 'mine' && b.y <= 0.32) {
      b.y = 0.32;
      b.vx = 0; b.vy = 0; b.vz = 0;
      b.kind = 'mineLive';
      b.fuse = 1.9;
      b.life = 99;
      rings.push({ x: b.x, z: b.z, r: 1.45, t: 1.9, dur: 1.9, cls: 'mine' });
      for (let k = 0; k < 4; k++) spawnSpark(b.x, 0.3, b.z, COLORS.rain, 0.5);
    }
    if (b.kind === 'mineLive') {
      if (b.fuse !== undefined) {
        b.fuse -= dt;
        if (b.fuse <= 0) {
          explodeMine(b);
          bullets.splice(i, 1);
          continue;
        }
      }
    }

    // 地涌：上升途中实时换色 —— 高度色带永远说实话
    // 注意：这里用离散 COLORS 覆盖连续色的分支是 v0.6 遗留，只在 0.85–1.05m 波段触发一帧。
    // 1:1 搬家阶段先原样保留，改配色时一并清掉。
    if (b.kind === 'rise') {
      const c2 = clsByHeight(b.y);
      if (c2 !== b.cls) { b.cls = c2; b.rgb = COLORS[c2]; }
      if (b.y > 7.2) {
        for (let k = 0; k < 3; k++) spawnSpark(b.x, b.y, b.z, b.rgb, 0.5);
        bullets.splice(i, 1);
        continue;
      }
    }

    // 出界清除。uprain 出生在负 y（地面背面），下界放宽到 -3.5，其余弹维持 -1.2
    const yOut = b.kind === 'uprain' ? b.y < -3.5 : b.y < -1.2;
    if (b.life <= 0 || yOut || Math.hypot(b.x, b.z) > ARENA_R + 8) {
      bullets.splice(i, 1);
      continue;
    }

    // 球形弹：瞬时球判定（1:1 保持）；非球形弹加尾球 = 头+尾扫掠近似
    const tailHit = b.shape !== undefined && b.shape !== 'ball' && hitPlayerTail(b);
    if (!b.noHit && player.inv <= 0 && (hitPlayer(b) || tailHit)) {
      onPlayerHit(b);
      bullets.splice(i, 1);
      continue;
    }
  }
}

/** 能打中玩家的东西的公共形状：子弹也行，激光也行。 */
export interface HitSource {
  cls: HClass;
  rgb: string;
  x: number; y: number; z: number;
}

/** 受击诊断链：扣血、无敌帧、写日志、toast。这里是"为什么被打中"的唯一出口。 */
export function onPlayerHit(b: HitSource): void {
  const info = CLASS_INFO[b.cls] || CLASS_INFO.mid;
  const dmg = b.cls === 'rain' ? PLAYER.dmgRain : PLAYER.dmgBullet;
  const isTraining = state === 'training';

  // 训练场不扣血：练习的目标是"读懂"，不是"活下来"
  if (!isTraining) player.hp = Math.max(0, player.hp - dmg);
  player.inv = PLAYER.invTime;
  clock.dmgFlash = 0.45;
  clock.slowT = 0.3;
  cam.shakeAmp = 7;

  stats.hits++;
  stats[b.cls]++;

  logs.unshift({ info, y: b.y, cls: b.cls, t: clock.elapsed });
  if (logs.length > DIAG_KEEP) logs.pop();
  renderDiag();

  if (!isTouch && !isTraining) toast('被「' + info.name + '」命中 · ' + info.tip, 1600, b.rgb);
  for (let i = 0; i < 16; i++) spawnSpark(b.x, b.y, b.z, b.rgb, 1.4);

  updateHud();
  if (!isTraining && player.hp <= 0) endGame(false, 'hp');
}

export function updateShots(dt: number): void {
  for (let i = pshots.length - 1; i >= 0; i--) {
    const s = pshots[i];
    s.px = s.x; s.py = s.y; s.pz = s.z;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.life -= dt;

    if (boss.alive) {
      const d = Math.hypot(s.x - boss.x, s.y - boss.y, s.z - boss.z);
      if (d < 1.32 + s.r) {
        damageBoss(s.dmg);
        for (let k = 0; k < 3; k++) spawnSpark(s.x, s.y, s.z, COLORS.pshot, 0.6);
        pshots.splice(i, 1);
        continue;
      }
    }

    if (s.life <= 0 || Math.hypot(s.x, s.z) > ARENA_R + 8 || s.y < -1) pshots.splice(i, 1);
  }
}
