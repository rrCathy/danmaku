/**
 * 手写透视相机。没有 WebGL，没有 3D 库，所有绘制都是 project() 出来的屏幕坐标。
 *
 * 三种姿态：
 *   - 极坐标：相机站在玩家所在半径上、更靠外一点，镜头钉死朝场地中心（不插值，必须跟手）
 *   - 环绕：绕场地中心自由旋转（Q/E 或拖动）
 *   - 自由：标准第三人称，绕玩家转，只留一点权重给 boss 让它保持在画面里
 */
import { CAM_PRESETS, CAMERA } from '../config';
import { lerp } from './math';
import { W as screenW, H as screenH } from './screen';
import { keys } from '../input/keyboard';
import { player } from '../state';
import type { Projected } from '../types';

export const cam = {
  yaw: 0.30, pitch: 0.40, dist: 15.5,
  /** 当前插值值（cy/cp/cd 追 yaw/pitch/dist） */
  cy: 0.30, cp: 0.40, cd: 15.5,
  target: { x: 0, y: 2.1, z: 8 },
  eye: { x: 0, y: 0, z: 0 },
  fwd: { x: 0, y: 0, z: -1 },
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  f: 800,
  shakeX: 0, shakeY: 0, shakeAmp: 0,
  /** -1 = 自由视角（没有预设名字） */
  preset: 0,
  orbit: false
};

/**
 * 极坐标模式（径向朝前）：玩家以场地中心为原点做 (r, θ) 运动，相机永远沿径向朝内。
 * pitch / dist 单独存一份：这个模式下相机姿态不跟 cam.pitch 走，只由鼠标俯仰与滚轮缩放改。
 */
export const polar = { on: false, pitch: 0.40, dist: 13.6 };

/** 环绕视角的角速度惯性。当前没有输入源，保留给滚轮/手势扩展。 */
export let camOrbitVel = 0;

export function resetCameraTarget(): void {
  cam.target.x = 0;
  cam.target.y = 2.1;
  cam.target.z = 8;
}

/** 相机姿态求值。dt 用真实帧间隔，不跟慢动作走 —— 转视角不该被子弹时间拖慢。 */
export function updateCamera(dt: number): void {
  if (polar.on) {
    // 相机站在玩家所在的半径上、更靠外一点，镜头沿径向朝场地中心看
    const outx = Math.cos(player.pa), outz = Math.sin(player.pa);
    cam.yaw = Math.atan2(outx, outz);
    cam.cy = cam.yaw;          // 不留插值，旋转必须刚性跟手
    cam.pitch = polar.pitch;
    cam.dist = polar.dist;
  } else if (cam.orbit) {
    let rot = 0;
    if (keys['q']) rot -= 1;
    if (keys['e']) rot += 1;
    cam.yaw += (rot * 1.9 + camOrbitVel) * dt;
    camOrbitVel *= Math.pow(0.02, dt);
  }
  const k = 1 - Math.pow(0.0015, dt);
  cam.cy = lerp(cam.cy, cam.yaw, k);
  cam.cp = lerp(cam.cp, cam.pitch, k);
  cam.cd = lerp(cam.cd, cam.dist, 1 - Math.pow(0.02, dt));

  const t = cam.target;
  const cp = Math.cos(cam.cp), sp = Math.sin(cam.cp);
  cam.eye.x = t.x + Math.sin(cam.cy) * cp * cam.cd;
  cam.eye.y = t.y + sp * cam.cd;
  cam.eye.z = t.z + Math.cos(cam.cy) * cp * cam.cd;

  let fx = t.x - cam.eye.x, fy = t.y - cam.eye.y, fz = t.z - cam.eye.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;

  // right = normalize(fwd × worldUp)
  let rx = -fz, ry = 0, rz = fx;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;

  // up = right × fwd
  let ux = ry * fz - rz * fy;
  let uy = rz * fx - rx * fz;
  let uz = rx * fy - ry * fx;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;

  cam.fwd.x = fx; cam.fwd.y = fy; cam.fwd.z = fz;
  cam.right.x = rx; cam.right.y = ry; cam.right.z = rz;
  cam.up.x = ux; cam.up.y = uy; cam.up.z = uz;

  cam.f = (screenH * 0.5) / Math.tan(CAMERA.fov * Math.PI / 180 * 0.5);
}

/** 世界坐标 → 屏幕坐标。zv 小于近裁剪阈值返回 null，调用方必须判空。 */
export function project(x: number, y: number, z: number): Projected | null {
  const dx = x - cam.eye.x, dy = y - cam.eye.y, dz = z - cam.eye.z;
  const zv = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
  if (zv < CAMERA.near) return null;
  const xv = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const yv = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  const s = cam.f / zv;
  return {
    x: screenW * 0.5 + xv * s + cam.shakeX,
    y: screenH * 0.5 - yv * s + cam.shakeY,
    z: zv,
    s
  };
}

/** 切到预设镜头。orbit 预设只改姿态，不强制开关环绕模式。 */
export function applyPreset(idx: number): void {
  cam.preset = idx;
  cam.yaw = CAM_PRESETS[idx].yaw;
  cam.pitch = CAM_PRESETS[idx].pitch;
  cam.dist = CAM_PRESETS[idx].dist;
  cam.orbit = !!(CAM_PRESETS[idx] as { orbit?: boolean }).orbit;
}
