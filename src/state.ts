/**
 * 全局可变状态。
 *
 * 刻意用扁平数组 + 裸结构体，而不是「实体类 + 组件」：
 * 这个项目要在控制台里随时 dump 一份快照做量化对比，结构越简单越好。
 *
 * 惯例：实体容器用 `export let`，只有 reset() 会整体替换；
 * 其它模块只做原地修改（push / splice / 改字段），不要重新赋值。
 */
import { ROUND, TRAINING } from './config';
import { resetCameraTarget } from './core/camera';
import { updateHud } from './ui/hud';
import { renderDiag } from './ui/diag';
import type {
  Boss, Bullet, GameState, Ghost, HitLog, Laser, Particle,
  PatternName, Player, Ring, Shot, Stats, Timer, Wall
} from './types';

function freshPlayer(): Player {
  return {
    x: 0, y: 0, z: 8, vx: 0, vz: 0, vy: 0,
    jumps: 2, hp: 100, maxHp: 100, inv: 0, fireCd: 0, hitFlash: 0,
    pr: 8, pa: Math.PI * 0.5, pvr: 0, pw: 0,
    dashT: 0, dashCd: 0, dashDX: 0, dashDZ: -1
  };
}

function freshBoss(): Boss {
  return {
    x: 0, y: 5.5, z: -6, hp: ROUND.bossHp, maxHp: ROUND.bossHp,
    phase: 1, ang: -1.2, flash: 0, cd: 1.8, last: '', alive: true,
    spin: 0, enraged: false, sats: [0, 2.15, 4.3], seq: 0, cast: []
  };
}

/* ============ 训练场运行时状态 ============ */
/** 只被 systems/training.ts 与面板读写；放在这里是为了让 reset() 能一并清掉 */
export const training = {
  pattern: TRAINING.first as PatternName,
  speed: 1,
  /** 距离下一次循环还有多久 */
  nextIn: 0
};

/* ============ 开关 ============ */
export const opts = { shadows: true, guides: true, hitbox: false, trailMode: 1, mini: true };

/* ============ 流程状态 ============ */
export let state: GameState = 'menu';

export function setState(v: GameState): void {
  state = v;
}

/** 只在 updateGame / frame / reset 里写，渲染层只读 */
export const clock = {
  elapsed: 0,
  timeLeft: ROUND.time as number,
  /** 受击后的短暂慢动作剩余时间 */
  slowT: 0,
  dmgFlash: 0
};

/* ============ 实体 ============ */
export let player: Player = freshPlayer();
export let boss: Boss = freshBoss();

export let bullets: Bullet[] = [];
export let pshots: Shot[] = [];
export let rings: Ring[] = [];
export let lasers: Laser[] = [];
export let walls: Wall[] = [];
export let particles: Particle[] = [];
export let timers: Timer[] = [];
export let logs: HitLog[] = [];
export let stats: Stats = { hits: 0, low: 0, mid: 0, high: 0, rain: 0 };

/** 冲刺残影 */
export const ghosts: Ghost[] = [];

/* ============ 延迟回调 ============ */
/** 图案的时序全靠它，单位秒。注意：timers 在 reset 时整体清空。 */
export function later(t: number, fn: () => void): void {
  timers.push({ t, fn });
}

export function updateTimers(dt: number): void {
  for (let i = timers.length - 1; i >= 0; i--) {
    timers[i].t -= dt;
    if (timers[i].t <= 0) {
      const fn = timers[i].fn;
      timers.splice(i, 1);
      fn();
    }
  }
}

/* ============ 重置 ============ */
export function reset(): void {
  player = freshPlayer();
  boss = freshBoss();
  bullets = [];
  pshots = [];
  rings = [];
  lasers = [];
  walls = [];
  particles = [];
  timers = [];
  logs = [];
  ghosts.length = 0;
  stats = { hits: 0, low: 0, mid: 0, high: 0, rain: 0 };
  clock.elapsed = 0;
  clock.timeLeft = ROUND.time;
  clock.slowT = 0;
  clock.dmgFlash = 0;
  training.speed = 1;
  training.nextIn = 0;
  resetCameraTarget();
  updateHud();
  renderDiag();
}
