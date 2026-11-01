/**
 * 鼠标 / 指针：指针锁定转视角、右键拖动兜底、滚轮拉远近、触屏摇杆与转视角。
 *
 * 手势状态只有一份（drag），谁先按下算谁的：右键拖动转视角，左半屏按下是摇杆。
 * 两者互斥，避免一边搓视角一边跑动。
 */
import { LOOK } from '../config';
import { isTouch } from '../core/device';
import { cam, polar } from '../core/camera';
import { canvas } from '../core/screen';
import { state } from '../state';
import { el } from '../ui/dom';
import { togglePause } from '../ui/flow';
import { flags } from './flags';
import { moveStick, placeStick, releaseStickVisual, touch } from './touch';

export const look = {
  locked: false,
  ok: !isTouch && !!canvas.requestPointerLock,
  /** 锁定后要丢弃的补发事件条数 */
  warm: 0,
  yawSens: LOOK.yawSens,
  pitchSens: LOOK.pitchSens
};

const drag = { id: null as number | null, x: 0, y: 0, mode: '' };

export function reqLock(): void {
  if (!look.ok || document.pointerLockElement === canvas) return;
  try {
    const pr = canvas.requestPointerLock({ unadjustedMovement: true }) as unknown as Promise<void> | undefined;
    if (pr && pr.catch) {
      pr.catch(function () {
        // 兜底：部分浏览器不支持 unadjustedMovement，退回普通锁定。
        // 注意这里也要 catch —— 否则失败会变成一条未捕获的 Promise 拒绝。
        try {
          const p2 = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
          if (p2 && p2.catch) p2.catch(function () {});
        } catch (e) {}
      });
    }
  } catch (err) {
    try { canvas.requestPointerLock(); } catch (e2) {}
  }
}

export function lookHintOn(): void {
  const on = look.ok && !look.locked && (state === 'playing' || state === 'paused');
  if (el.lookHint) el.lookHint.classList.toggle('on', on);
}

function releaseStick(e?: PointerEvent): void {
  if (drag.id !== null && (!e || e.pointerId === drag.id)) {
    drag.id = null;
    drag.mode = '';
  }
  if (touch.rotId && (!e || e.pointerId === touch.rotId)) touch.rotId = null;
  if (!touch.active) return;
  if (e && e.pointerId !== touch.id) return;
  releaseStickVisual();
}

export function initPointer(): void {
  document.addEventListener('pointerlockchange', function () {
    const was = look.locked;
    look.locked = document.pointerLockElement === canvas;
    document.body.classList.toggle('locked', look.locked);
    if (look.locked) {
      drag.id = null; drag.mode = '';
      look.warm = 1;
      if (el.camName) el.camName.textContent = '自由视角 · 鼠标锁定';
    } else if (was && state === 'playing') {
      // 锁定被解除（多半是按了 ESC）：停下火力并暂停，别让玩家在丢失视角时继续挨打
      flags.fire = false;
      togglePause();
    }
    lookHintOn();
  });

  document.addEventListener('mousemove', function (e) {
    if (!look.locked) return;
    // 刚锁定时浏览器可能补一个“指针归位”的巨幅位移，丢掉第一条
    if (look.warm > 0) { look.warm--; return; }
    let mx = e.movementX || 0, my = e.movementY || 0;
    if (!mx && !my) return;
    // 单帧位移限幅：防止个别设备/系统加速产生的异常跳变把镜头甩飞
    mx = Math.max(-LOOK.maxStep, Math.min(LOOK.maxStep, mx));
    my = Math.max(-LOOK.maxStep, Math.min(LOOK.maxStep, my));
    if (polar.on) {
      // 极坐标模式相机刚性朝中心，横向转视角没有意义，横向位移一律忽略（更不能拿它推角色）
      polar.pitch = Math.max(0.12, Math.min(0.98, polar.pitch + my * look.pitchSens));
    } else {
      cam.yaw -= mx * look.yawSens;                       // 鼠标右移 → 视角右转
      cam.pitch = Math.max(0.06, Math.min(1.28, cam.pitch + my * look.pitchSens));
      cam.cy = cam.yaw;                                   // 零延迟：不给插值
      cam.cp = cam.pitch;
      cam.preset = -1;
    }
  });

  // 滚轮拉近拉远（第三人称习惯）
  canvas.addEventListener('wheel', function (e) {
    if (isTouch) return;
    e.preventDefault();
    const d = e.deltaY > 0 ? 1 : -1;
    if (polar.on) polar.dist = Math.max(9, Math.min(22, polar.dist + d * 0.9));
    else cam.dist = Math.max(8, Math.min(26, cam.dist + d * 0.9));
  }, { passive: false });

  // 点画面：锁定鼠标；暂停中点画面 = 继续
  canvas.addEventListener('click', function () {
    if (!look.ok) return;
    if (state === 'paused') togglePause();
    if (state === 'playing') reqLock();
  });

  window.addEventListener('mousedown', function (e) {
    if (e.target === canvas) flags.fire = true;
  });
  window.addEventListener('mouseup', function () { flags.fire = false; });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('blur', function () {
    drag.id = null;
    drag.mode = '';
    flags.fire = false;
  });

  window.addEventListener('pointerdown', function (e) {
    // 训练场同样需要摇杆 / 转视角手势
    if (state !== 'playing' && state !== 'training') return;
    const target = e.target as HTMLElement | null;
    const onBtn = target && target.closest && target.closest('button');
    if (onBtn) return;

    if (e.pointerType === 'mouse') {
      if (look.locked) return;
      if (e.button === 2) { drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; drag.mode = 'rot'; }
      return;
    }

    // 触屏右半屏 = 转视角；极坐标下朝向锁死中心，只留俯仰可用
    if (e.clientX > window.innerWidth * 0.54) {
      drag.id = e.pointerId;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.mode = 'rot';
      touch.rotId = e.pointerId;
      return;
    }

    touch.active = true;
    touch.id = e.pointerId;
    touch.ox = e.clientX;
    touch.oy = e.clientY;
    touch.dx = 0;
    touch.dy = 0;
    placeStick(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('pointermove', function (e) {
    if (drag.id !== null && e.pointerId === drag.id) {
      if (polar.on) {
        // 极坐标：横向转视角没有意义（相机刚性朝中心），纵向留给俯仰
        polar.pitch = Math.max(0.10, Math.min(1.02, polar.pitch + (e.clientY - drag.y) * LOOK.dragPitch));
        drag.x = e.clientX;
        drag.y = e.clientY;
        return;
      }
      // 向右搓 → 视角右转（镜头绕玩家逆时针走），与主流第三人称一致
      cam.yaw -= (e.clientX - drag.x) * LOOK.dragYaw;
      cam.pitch = Math.max(0.06, Math.min(1.28, cam.pitch + (e.clientY - drag.y) * LOOK.dragPitch));
      cam.cy = cam.yaw;           // 立即生效，不要插值拖拽
      cam.cp = cam.pitch;
      cam.preset = -1;
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }
    if (!touch.active || e.pointerId !== touch.id) return;
    moveStick(e.clientX - touch.ox, e.clientY - touch.oy);
  }, { passive: true });

  window.addEventListener('pointerup', releaseStick);
  window.addEventListener('pointercancel', releaseStick);
}
