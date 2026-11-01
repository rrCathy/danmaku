/**
 * 触屏：左半屏虚拟摇杆 + 右下跳跃 / 冲刺 / 视角键。
 *
 * 摇杆本身不拦 pointer 事件（pointer-events:none），位置由按下点决定 ——
 * 手机上手指出处不固定，固定摇杆会让人找不到。
 */
import { state } from '../state';
import { cycleCam, togglePause } from '../ui/flow';
import { flags } from './flags';
import { keys } from './keyboard';
import type { InputDir } from '../types';

export const touch = {
  active: false,
  id: null as number | null,
  ox: 0, oy: 0,
  dx: 0, dy: 0,
  rotId: null as number | null,
  rotX: 0
};

const stickEl = document.getElementById('stick');
const knobEl = document.getElementById('stickKnob');
const jumpEl = document.getElementById('btnJump');
const dashEl = document.getElementById('btnDash');
const camBtn = document.getElementById('btnCam');

const STICK_R = 56;

/** 把摇杆挪到按下手指的位置（左半屏任意处都能起手） */
export function placeStick(clientX: number, clientY: number): void {
  if (!stickEl) return;
  stickEl.style.left = (clientX - 65) + 'px';
  stickEl.style.top = (clientY - 65) + 'px';
  stickEl.style.opacity = '0.9';
  if (knobEl) knobEl.style.transform = '';
}

export function stickHome(): void {
  if (!stickEl) return;
  stickEl.style.left = '26px';
  stickEl.style.top = (window.innerHeight - 30 - 130) + 'px';
  stickEl.style.opacity = '0.55';
  if (knobEl) knobEl.style.transform = '';
}

/** 摇杆拖动（由 pointer.ts 的 pointermove 驱动，因为要跟转视角共用同一套手势状态） */
export function moveStick(dxRaw: number, dyRaw: number): void {  let dx = dxRaw, dy = dyRaw;
  const m = Math.hypot(dx, dy);
  if (m > STICK_R) { dx = dx / m * STICK_R; dy = dy / m * STICK_R; }
  touch.dx = dx;
  touch.dy = dy;
  if (knobEl) knobEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
}

export function releaseStickVisual(): void {
  touch.active = false;
  touch.dx = 0;
  touch.dy = 0;
  stickHome();
}

export function initTouchButtons(): void {
  if (camBtn) {
    camBtn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      cycleCam();
    });
  }

  // 触屏没有 P 键，暂停（进而返回主界面）要靠这个按钮
  const pauseEl = document.getElementById('btnPause');
  if (pauseEl) {
    pauseEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      togglePause();
    });
  }

  if (jumpEl) {
    jumpEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (state === 'playing' || state === 'training') flags.jump = true;
      jumpEl.classList.add('down');
    });
    jumpEl.addEventListener('pointerup', function () { jumpEl.classList.remove('down'); });
    jumpEl.addEventListener('pointercancel', function () { jumpEl.classList.remove('down'); });
    jumpEl.addEventListener('pointerleave', function () { jumpEl.classList.remove('down'); });
  }

  if (dashEl) {
    dashEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (state === 'playing' || state === 'training') flags.dash = true;
      dashEl.classList.add('down');
    });
    dashEl.addEventListener('pointerup', function () { dashEl.classList.remove('down'); });
    dashEl.addEventListener('pointercancel', function () { dashEl.classList.remove('down'); });
    dashEl.addEventListener('pointerleave', function () { dashEl.classList.remove('down'); });
  }
}

export function dashButtonEl(): HTMLElement | null {
  return dashEl;
}

/**
 * 返回「屏幕意图」：f = 向上推（前），r = 向右推，len = 推杆幅度。
 * 摇杆幅度小于 14% 视为没推，避免手指抖动导致原地微移。
 */
export function inputDir(): InputDir {
  if (touch.active) {
    const jl = Math.hypot(touch.dx, touch.dy);
    if (jl / STICK_R > 0.14) {
      const nx = touch.dx / jl, ny = touch.dy / jl;
      return { f: -ny, r: nx, len: Math.min(1, jl / STICK_R) };
    }
    return { f: 0, r: 0, len: 0 };
  }

  let f = 0, r = 0;
  if (keys['w'] || keys['arrowup']) f += 1;
  if (keys['s'] || keys['arrowdown']) f -= 1;
  if (keys['d'] || keys['arrowright']) r += 1;
  if (keys['a'] || keys['arrowleft']) r -= 1;

  const l = Math.hypot(f, r);
  if (l > 0.001) return { f: f / l, r: r / l, len: 1 };
  return { f: 0, r: 0, len: 0 };
}
