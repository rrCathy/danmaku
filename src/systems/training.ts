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

/** 选中某个图案：立刻来一发，放完 + 间隔之后再来下一发 */
export function selectPattern(name: PatternName): void {
  training.pattern = name;
  clearField();
  runPattern(name);
  training.nextIn = TRAINING.loop;
  training.gapIn = training.gap;
}

export function setSpeed(v: number): void {
  training.speed = v;
}

/** 调整"放完之后的间隔"档位（面板） */
export function setGap(v: number): void {
  training.gap = v;
}

/** 手动重放一次（面板上的「再来一发」） */
export function replay(): void {
  clearField();
  runPattern(training.pattern);
  training.nextIn = TRAINING.loop;
  training.gapIn = training.gap;
}

/** 场上还有会飞 / 会炸 / 会延迟触发的东西 = 上一招没放完 */
function fieldBusy(): boolean {
  return bullets.length > 0 || lasers.length > 0 || walls.length > 0 ||
    pshots.length > 0 || rings.length > 0 || timers.length > 0;
}

export function updateTraining(dt: number): void {
  training.nextIn -= dt;
  if (training.nextIn > 0) return;
  // 循环间隔到点后：先等上一招**彻底放完**（场清），绝不叠招。
  // 长招式（晶格系要走 6s+）在这里自然被等完；意外永挂时 20s 后强制放行兜底。
  if (fieldBusy() && training.nextIn > -20) return;
  // 场清了 → 再等用户设定的间隔 → 重放
  if (training.gapIn > 0) {
    training.gapIn -= dt;
    return;
  }
  runPattern(training.pattern);
  training.nextIn = TRAINING.loop;
  training.gapIn = training.gap;
}
