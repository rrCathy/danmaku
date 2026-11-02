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

import { CAM_PRESETS, DIFFICULTIES } from './config';
import { cam, updateCamera } from './core/camera';
import { canvas, H, W, onAfterResize, resize } from './core/screen';
import { isTouch } from './core/device';
import { heightRGB } from './core/color';
import { boss, bullets, clock, freeze, later, lasers, player, reset, rings, session, state, stats, training, walls } from './state';
import { getSeed, setSeed } from './core/random';
import { SEQUENCES, getSequenceMode, setSequenceMode, sequenceFor } from './patterns/sequence';
import { setSpeed } from './systems/training';
import { refreshTrainPanel } from './ui/training';
import { updateGame } from './systems/loop';
import { render } from './render';
import { keys, initKeyboard } from './input/keyboard';
import { initPointer } from './input/pointer';
import { initTouchButtons, stickHome } from './input/touch';
import { flags } from './input/flags';
import { endGame, initUi, setDifficulty, startGame, startTraining, togglePolar } from './ui/flow';
import { updateHud } from './ui/hud';
import { ALL_PATTERNS, runPattern } from './patterns';
import { addBullet, shapeDist } from './systems/bullets';
import type { PatternName } from './patterns';
import type { DifficultyKey } from './types';

/* ============ 主循环 ============ */
let lastT = 0;

function frame(t: number): void {
  if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
  const raw = lastT ? (t - lastT) / 1000 : 0.016;
  lastT = t;
  const rdt = Math.min(0.05, Math.max(0, raw));

  // 训练场定格（F）：时间冻结、相机仍可转 —— 用来看子弹的 3D 建模
  if ((state === 'playing' || state === 'training') && !(freeze.on && state === 'training')) {
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
// 先挂 resize 回调再首次 resize，否则摇杆停在 (0,0) 直到用户改变窗口大小
onAfterResize(stickHome);
resize();

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
/** 兼容旧写法（sat / counter / lowhigh / sweeplow …） */
const PAT_ALIAS: Record<string, PatternName> = {
  ring: 'ring', spiral: 'spiral', wall: 'wall', laser: 'laser', sat: 'satBurst',
  spread: 'spread', rain: 'rain', orbit: 'orbit', stair: 'stair', dive: 'dive',
  mine: 'mine', rise: 'rise', counter: 'counterSpiral', lowhigh: 'lowHigh',
  sweeplow: 'sweepLow', sweephigh: 'sweepHigh',
  // 难度 2
  jump: 'jumpWall', jumpwall: 'jumpWall', sniper: 'sniper', gate: 'gate',
  feint: 'feint', snare: 'risenare', risenare: 'risenare',
  // 难度 3
  petal: 'petal', radial: 'radial', downpour: 'downpour', fountain: 'fountain',
  uprain: 'uprain', cone: 'cone',
  // 难度 4（跳跃必要性）
  aim: 'aimed', aimed: 'aimed', random: 'random', rand: 'random',
  smoke: 'smoke', lightning: 'lightning', bolt: 'lightning', grenade: 'grenade',
  wave: 'wave', sweepline: 'sweepLine', gaster: 'gaster',
  pinwheel: 'pinwheel', toho: 'toho', stack: 'stack', ripple: 'ripple'
};

function resolvePattern(raw: string): PatternName | undefined {
  const key = raw.toLowerCase();
  return PAT_ALIAS[key] || (ALL_PATTERNS as string[]).find((n) => n.toLowerCase() === key) as PatternName | undefined;
}

const SEARCH = location.search;

// ?diff=4 直接进跳跃必要性；必须在开局前设好，出招池与弹速都看它
const diffMatch = SEARCH.match(/[?&]diff=([1-4])/);
if (diffMatch) {
  setDifficulty(parseInt(diffMatch[1], 10) as DifficultyKey);
}

// 种子必须在任何出招之前设好：?seed=20261101
const seedMatch = SEARCH.match(/[?&]seed=(-?\d+)/);
if (seedMatch) setSeed(parseInt(seedMatch[1], 10));

// ?seq=random 退回 v0.6 的随机抽（对照用）；默认是固定序列
const seqMatch = SEARCH.match(/[?&]seq=(\w+)/);
if (seqMatch && seqMatch[1] === 'random') setSequenceMode('random');

/** 训练场：不计时不计死，?pat= 选初招，?speed= 调弹速 */
const trainMatch = /[?&]train=1/.test(SEARCH);
if (trainMatch) {
  const pt = SEARCH.match(/[?&]pat=([a-zA-Z]+)/);
  startTraining(pt ? resolvePattern(pt[1]) : undefined);
  const sp = SEARCH.match(/[?&]speed=([\d.]+)/);
  if (sp) { setSpeed(parseFloat(sp[1])); refreshTrainPanel(); }
  const cm = SEARCH.match(/[?&]cam=(\d)/);
  if (cm) {
    const idx = Math.min(3, Math.max(0, parseInt(cm[1], 10)));
    cam.preset = idx;
    cam.yaw = CAM_PRESETS[idx].yaw;
    cam.pitch = CAM_PRESETS[idx].pitch;
    cam.dist = CAM_PRESETS[idx].dist;
  }
  const dv = SEARCH.match(/[?&]drive=([wasd]+)/);
  if (dv) { for (let i = 0; i < dv[1].length; i++) keys[dv[1][i]] = true; }
}

if (/[?&]auto=1/.test(SEARCH) && !trainMatch) {
  startGame();
  if (/[?&]fire=1/.test(SEARCH)) flags.fire = true;
  const bh = SEARCH.match(/[?&]boss=(\d+)/);
  if (bh) {
    boss.hp = Math.min(boss.maxHp, parseInt(bh[1], 10));
    boss.phase = boss.hp <= boss.maxHp * 0.33 ? 3 : boss.hp <= boss.maxHp * 0.66 ? 2 : 1;
  }
  const cm = SEARCH.match(/[?&]cam=(\d)/);
  if (cm) {
    const idx = Math.min(3, Math.max(0, parseInt(cm[1], 10)));
    cam.preset = idx;
    cam.yaw = CAM_PRESETS[idx].yaw;
    cam.pitch = CAM_PRESETS[idx].pitch;
    cam.dist = CAM_PRESETS[idx].dist;
  }
  const ym = SEARCH.match(/[?&]yaw=([-\d.]+)/);
  if (ym) {
    cam.orbit = true;
    cam.preset = 3;
    cam.yaw = parseFloat(ym[1]);
    cam.cy = cam.yaw;
  }
  if (/[?&]polar=1/.test(SEARCH)) togglePolar(true);
  const dv = SEARCH.match(/[?&]drive=([wasd]+)/);
  if (dv) { for (let i = 0; i < dv[1].length; i++) keys[dv[1][i]] = true; }

  const pt = SEARCH.match(/[?&]pat=([a-zA-Z]+)/);
  if (pt) {
    const nm = resolvePattern(pt[1]);
    if (nm) later(0.35, function () { runPattern(nm); });
  }
}

// ?t=N 同步快进（对局或训练场都行），配合 ?seed= 可逐位复现
const ffMatch = SEARCH.match(/[?&]t=([\d.]+)/);
if (ffMatch) {
  const ff = Math.min(120, parseFloat(ffMatch[1]) || 0);
  const step = 1 / 60;
  for (let s = 0; s < ff && (state === 'playing' || state === 'training'); s += step) {
    updateGame(step);
    updateCamera(step);
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
    get training() { return training; },
    get session() { return session; },
    get difficulty() { return DIFFICULTIES[session.difficulty]; },
    get sequence() {
      const seq = sequenceFor(boss.phase, session.difficulty);
      return { mode: getSequenceMode(), index: boss.seq, next: seq[boss.seq % seq.length] };
    },
    get history() { return boss.cast; },
    sequences: SEQUENCES,
    seed: function () { return getSeed(); },
    train: function (n?: string) { startTraining(n ? resolvePattern(n) : undefined); },
    setSpeed: function (v: number) { setSpeed(v); },
    get stats() { return stats; },
    heightRGB,
    dash: function () { flags.dash = true; },
    run: function (n: string) { runPattern(n); },
    /** 精确放弹（擦弹/碰撞冒烟用）：add(x,y,z,vx,vy,vz,r,cls,kind,shape?) */
    add: function (x: number, y: number, z: number, vx: number, vy: number, vz: number,
      r: number, cls: string, kind: string, shape?: string) {
      addBullet(x, y, z, vx, vy, vz, r, cls as never, kind as never, shape as never);
    },
    /** 判定距离探针：任取一颗弹看 shapeDist（碰撞/擦弹调试） */
    dist: function (i: number) { return bullets[i] ? shapeDist(bullets[i]) : null; },
    /** 直接走结算链路（成就/无伤徽章都在 endGame 里） */
    end: function (win: boolean) { endGame(win, win ? undefined : 'hp'); }
  };
}

requestAnimationFrame(frame);
