/**
 * 训练场。
 *
 * 和正常对局的区别只有四条：
 *   1. 不计时、不狂暴
 *   2. boss 不掉血、玩家不扣血（只记受击诊断）
 *   3. 出招不由 boss 的节奏驱动，而是「选中一个图案，每 loop 秒重放一次」
 *   4. 切图案时清场，避免上一招的残留干扰判断
 *
 * 除此之外的所有逻辑（碰撞、判定、配色、诊断）都走同一套代码 ——
 * 训练场里读到的东西，就是实战里会读到的东西。
 */
import { TRAINING } from '../config';
import { runPattern } from '../patterns';
import { bullets, lasers, particles, pshots, rings, timers, training, walls } from '../state';
import type { PatternName } from '../types';

/** 清空场上一切会飞、会炸、会延迟触发的东西 */
export function clearField(): void {
  bullets.length = 0;
  pshots.length = 0;
  lasers.length = 0;
  walls.length = 0;
  rings.length = 0;
  particles.length = 0;
  timers.length = 0;
}

/** 选中某个图案：立刻来一发，之后按 loop 循环 */
export function selectPattern(name: PatternName): void {
  training.pattern = name;
  clearField();
  runPattern(name);
  training.nextIn = TRAINING.loop;
}

export function setSpeed(v: number): void {
  training.speed = v;
}

/** 手动重放一次（面板上的「再来一发」） */
export function replay(): void {
  clearField();
  runPattern(training.pattern);
  training.nextIn = TRAINING.loop;
}

export function updateTraining(dt: number): void {
  training.nextIn -= dt;
  if (training.nextIn <= 0) {
    runPattern(training.pattern);
    training.nextIn = TRAINING.loop;
  }
}
