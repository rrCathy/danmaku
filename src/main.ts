/**
 * 入口：装配模块、启动主循环、处理 URL 调试参数。
 *
 * 调试参数（做自动化验证用，见 README）：
 *   ?auto=1        直接开打
 *   ?dbg=1         把相机/实体挂到 window.__dbg
 *   ?pat=rain      开局触发指定图案
 *   ?t=30          无渲染快进 30 秒
 *   ?drive=wasd    模拟按住移动键
 *   ?boss=300      直接把 boss 血量设成 300（测 P2/P3）
 *   ?cam=1 &yaw=   指定镜头
 *   ?polar=1       直接进极坐标
 */
import './styles/base.css';
import './styles/app.css';

import { CAM_PRESETS } from './config';
import { cam, updateCamera } from './core/camera';
import { canvas, H, W, onAfterResize, resize } from './core/screen';
import { isTouch } from './core/device';
import { heightRGB } from './core/color';
import { boss, bullets, clock, later, lasers, player, reset, rings, state, walls } from './state';
import { updateGame } from './systems/loop';
import { render } from './render';
import { keys, initKeyboard } from './input/keyboard';
import { initPointer } from './input/pointer';
import { initTouchButtons, stickHome } from './input/touch';
import { flags } from './input/flags';
import { initUi, startGame, togglePolar } from './ui/flow';
import { updateHud } from './ui/hud';
import { ALL_PATTERNS, runPattern } from './patterns';
import type { PatternName } from './patterns';

/* ============ 主循环 ============ */
let lastT = 0;

function frame(t: number): void {
  if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
  const raw = lastT ? (t - lastT) / 1000 : 0.016;
  lastT = t;
  const rdt = Math.min(0.05, Math.max(0, raw));

  if (state === 'playing') {
    clock.slowT = Math.max(0, clock.slowT - rdt);
    const dt = rdt * (clock.slowT > 0 ? 0.3 : 1);
    updateGame(dt);
  }

  cam.shakeAmp *= Math.pow(0.015, rdt);
  if (cam.shakeAmp < 0.06) cam.shakeAmp = 0;
  cam.shakeX = (Math.random() - 0.5) * 2 * cam.shakeAmp;
  cam.shakeY = (Math.random() - 0.5) * 2 * cam.shakeAmp;

  updateCamera(rdt);
  render();

  requestAnimationFrame(frame);
}

/* ============ 启动 ============ */
resize();
onAfterResize(stickHome);

if (isTouch) {
  cam.dist = 13.4; cam.cd = 13.4;
  cam.pitch = 0.46; cam.cp = 0.46;
  cam.yaw = 0.26; cam.cy = 0.26;
  cam.target.y = 2.4;
}
if (/[?&]vp=1/.test(location.search)) {
  document.title = 'VP ' + W + 'x' + H + ' inner ' + window.innerWidth + 'x' + window.innerHeight;
}

initKeyboard();
initPointer();
initTouchButtons();
initUi();

reset();
updateHud();

/* ============ URL 参数 ============ */
/** 兼容旧写法（sat / counter / lowhigh）+ 新增 sweepLow / sweepHigh */
const PAT_ALIAS: Record<string, PatternName> = {
  ring: 'ring', spiral: 'spiral', wall: 'wall', laser: 'laser', sat: 'satBurst',
  spread: 'spread', rain: 'rain', orbit: 'orbit', stair: 'stair', dive: 'dive',
  mine: 'mine', rise: 'rise', counter: 'counterSpiral', lowhigh: 'lowHigh',
  sweeplow: 'sweepLow', sweephigh: 'sweepHigh'
};

if (/[?&]auto=1/.test(location.search)) {
  startGame();
  if (/[?&]fire=1/.test(location.search)) flags.fire = true;
  const bh = location.search.match(/[?&]boss=(\d+)/);
  if (bh) {
    boss.hp = Math.min(boss.maxHp, parseInt(bh[1], 10));
    boss.phase = boss.hp <= boss.maxHp * 0.33 ? 3 : boss.hp <= boss.maxHp * 0.66 ? 2 : 1;
  }
  const cm = location.search.match(/[?&]cam=(\d)/);
  if (cm) {
    const idx = Math.min(3, Math.max(0, parseInt(cm[1], 10)));
    cam.preset = idx;
    cam.yaw = CAM_PRESETS[idx].yaw;
    cam.pitch = CAM_PRESETS[idx].pitch;
    cam.dist = CAM_PRESETS[idx].dist;
  }
  const ym = location.search.match(/[?&]yaw=([-\d.]+)/);
  if (ym) {
    cam.orbit = true;
    cam.preset = 3;
    cam.yaw = parseFloat(ym[1]);
    cam.cy = cam.yaw;
  }
  if (/[?&]polar=1/.test(location.search)) togglePolar(true);
  const dv = location.search.match(/[?&]drive=([wasd]+)/);
  if (dv) { for (let i = 0; i < dv[1].length; i++) keys[dv[1][i]] = true; }

  const pt = location.search.match(/[?&]pat=([a-zA-Z]+)/);
  if (pt) {
    const key = pt[1].toLowerCase();
    const nm = PAT_ALIAS[key] || (ALL_PATTERNS as string[]).find((n) => n.toLowerCase() === key);
    if (nm) later(0.35, function () { runPattern(nm); });
  }

  const m = location.search.match(/[?&]t=([\d.]+)/);
  if (m) {
    const ff = Math.min(120, parseFloat(m[1]) || 0);
    const step = 1 / 60;
    for (let s = 0; s < ff && state === 'playing'; s += step) {
      updateGame(step);
      updateCamera(step);
    }
  }
}

/* ============ 调试钩子 ============ */
if (/[?&]dbg=1/.test(location.search)) {
  (window as unknown as { __dbg: unknown }).__dbg = {
    cam,
    get state() { return state; },
    get counts() {
      return {
        b: bullets.length,
        l: lasers.length,
        w: walls.length,
        r: rings.length,
        hp: boss.hp
      };
    },
    /** 按 kind 统计当前场上弹幕数量 —— 研究图案构成时比总数有用 */
    get kinds() {
      return bullets.reduce<Record<string, number>>((acc, x) => {
        acc[x.kind] = (acc[x.kind] || 0) + 1;
        return acc;
      }, {});
    },
    get player() { return player; },
    get boss() { return boss; },
    get bullets() { return bullets; },
    get clock() { return clock; },
    heightRGB,
    dash: function () { flags.dash = true; },
    run: function (n: string) { runPattern(n); }
  };
}

requestAnimationFrame(frame);
