/**
 * 玩家运动：冲刺 → 极坐标 / 笛卡尔移动 → 跳跃 → 自动开火。
 *
 * 三套移动互斥：冲刺期间速度被直接覆盖；极坐标用 (r, θ) 积分后回写世界坐标；
 * 其余情况走带阻尼的加速度模型。
 */
import { ARENA_R, DASH, PLAYER } from '../config';
import { cam, polar } from '../core/camera';
import { isTouch } from '../core/device';
import { COLORS } from '../core/color';
import { rand } from '../core/math';
import { boss, ghosts, player, pshots } from '../state';
import { flags } from '../input/flags';
import { inputDir } from '../input/touch';
import { keys } from '../input/keyboard';
import { spawnSpark } from './effects';
import type { InputDir } from '../types';

/** 冲刺残影的采样间隔 */
let ghostT = 0;

export function startDash(inp: InputDir): void {
  let dx = -Math.sin(cam.cy), dz = -Math.cos(cam.cy);
  if (inp.len > 0.05) {
    const cy = cam.cy;
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    dx = fx * inp.f + rx * inp.r;
    dz = fz * inp.f + rz * inp.r;
  }
  const l = Math.hypot(dx, dz);
  if (l < 1e-4) { dx = -Math.sin(cam.cy); dz = -Math.cos(cam.cy); }
  else { dx /= l; dz /= l; }
  player.dashDX = dx;
  player.dashDZ = dz;
  player.dashT = DASH.time;
  player.dashCd = DASH.cd;
  ghostT = 0;
  for (let i = 0; i < 10; i++) {
    spawnSpark(player.x, player.y + rand(0.1, 0.9), player.z, COLORS.player, 0.6);
  }
  cam.shakeAmp = Math.max(cam.shakeAmp, 1.6);
}

export function updatePlayer(dt: number): void {
  const inp = inputDir();

  /* ---- 冲刺 ---- */
  player.dashCd = Math.max(0, player.dashCd - dt);
  if (flags.dash) {
    flags.dash = false;
    if (player.dashCd <= 0 && player.dashT <= 0) startDash(inp);
  }

  if (player.dashT > 0) {
    player.dashT -= dt;
    player.vx = player.dashDX * DASH.speed;
    player.vz = player.dashDZ * DASH.speed;
    player.x += player.vx * dt;
    player.z += player.vz * dt;

    const dr = Math.hypot(player.x, player.z), dlim = ARENA_R - 1.0;
    if (dr > dlim) { player.x = player.x / dr * dlim; player.z = player.z / dr * dlim; }

    if (polar.on) {
      player.pr = Math.max(PLAYER.polarRMin, Math.min(PLAYER.polarRMax, Math.hypot(player.x, player.z)));
      player.pa = Math.atan2(player.z, player.x);
      player.pvr = 0;
      player.pw = 0;
    }

    ghostT -= dt;
    if (ghostT <= 0) {
      ghostT = 0.02;
      ghosts.push({ x: player.x, y: player.y, z: player.z, life: 0.30, max: 0.30 });
    }

    if (player.dashT <= 0) { player.vx *= 0.22; player.vz *= 0.22; }
  } else if (polar.on) {
    /* ---- 极坐标：上下 = 径向（上推向内），左右 = 绕中心的角度 ---- */
    const tVr = -inp.f * PLAYER.maxSpeed * inp.len;
    // 切向线速度恒定 → 角速度按半径缩放；再封顶，避免贴近中心时画面狂转
    let tW = -inp.r * (PLAYER.maxSpeed / Math.max(player.pr, 3.2)) * inp.len;
    if (tW > PLAYER.polarWMax) tW = PLAYER.polarWMax;
    if (tW < -PLAYER.polarWMax) tW = -PLAYER.polarWMax;
    const k = 1 - Math.exp(-11 * dt);
    player.pvr += (tVr - player.pvr) * k;
    player.pw += (tW - player.pw) * k;

    player.pr += player.pvr * dt;
    player.pa += player.pw * dt;

    if (player.pr < PLAYER.polarRMin) { player.pr = PLAYER.polarRMin; if (player.pvr < 0) player.pvr = 0; }
    if (player.pr > PLAYER.polarRMax) { player.pr = PLAYER.polarRMax; if (player.pvr > 0) player.pvr = 0; }

    const nx = Math.cos(player.pa) * player.pr;
    const nz = Math.sin(player.pa) * player.pr;
    player.vx = (nx - player.x) / Math.max(dt, 1e-5);
    player.vz = (nz - player.z) / Math.max(dt, 1e-5);
    player.x = nx;
    player.z = nz;
  } else {
    /* ---- 笛卡尔：摇杆方向按镜头朝向投到世界 ---- */
    const cy = cam.cy;
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    let dx = fx * inp.f + rx * inp.r;
    let dz = fz * inp.f + rz * inp.r;
    const dl = Math.hypot(dx, dz);
    if (dl > 0.001) { dx /= dl; dz /= dl; }

    if (inp.len > 0.05 && dl > 0.001) {
      const ak = 0.5 + 0.5 * Math.min(1, inp.len);
      player.vx += dx * PLAYER.acc * ak * dt;
      player.vz += dz * PLAYER.acc * ak * dt;
    } else {
      const k = Math.exp(-PLAYER.damp * dt);
      player.vx *= k;
      player.vz *= k;
    }

    const sp = Math.hypot(player.vx, player.vz);
    if (sp > PLAYER.maxSpeed) {
      player.vx = player.vx / sp * PLAYER.maxSpeed;
      player.vz = player.vz / sp * PLAYER.maxSpeed;
    }

    player.x += player.vx * dt;
    player.z += player.vz * dt;

    const rr = Math.hypot(player.x, player.z);
    const lim = ARENA_R - 1.0;
    if (rr > lim) {
      player.x = player.x / rr * lim;
      player.z = player.z / rr * lim;
      player.vx *= 0.2;
      player.vz *= 0.2;
    }
  }

  if (flags.jump) {
    flags.jump = false;
    if (player.jumps > 0) {
      player.vy = player.jumps === 2 ? PLAYER.jumpVy[0] : PLAYER.jumpVy[1];
      player.jumps--;
      for (let i = 0; i < 6; i++) spawnSpark(player.x, player.y + 0.1, player.z, COLORS.player, 0.5);
    }
  }

  player.vy -= PLAYER.gravity * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) {
    player.y = 0;
    player.vy = 0;
    player.jumps = 2;
  }

  player.fireCd -= dt;
  if ((flags.fire || keys['j'] || isTouch) && player.fireCd <= 0 && boss.alive) {
    player.fireCd = 0.105;
    fireShot();
  }
}

export function fireShot(): void {
  const sx = player.x, sy = player.y + 0.95, sz = player.z;
  const dx = boss.x - sx, dy = boss.y - sy, dz = boss.z - sz;
  const l = Math.hypot(dx, dy, dz) || 1;
  const sp = 46;
  pshots.push({
    x: sx, y: sy, z: sz, px: sx, py: sy, pz: sz,
    vx: dx / l * sp, vy: dy / l * sp, vz: dz / l * sp,
    r: 0.14, dmg: 2.6, life: 2
  });
  for (let i = 0; i < 2; i++) spawnSpark(sx, sy, sz, COLORS.pshot, 0.35);
}
