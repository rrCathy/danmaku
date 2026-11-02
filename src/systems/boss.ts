/** boss：环绕运动、出招节奏、阶段与狂暴。 */
import { BOSS, DIFFICULTIES, ROUND } from '../config';
import { COLORS } from '../core/color';
import { clamp, lerp, rand } from '../core/math';
import { boss, bullets, clock, lasers, rings, session, state, timers, walls } from '../state';
import { spawnSpark } from './effects';
import { pickPattern, runPattern } from '../patterns';
import { updateHud } from '../ui/hud';
import { toast } from '../ui/toast';
import { endGame } from '../ui/flow';

/**
 * 换阶段清场。
 *
 * 不清的话，上一阶段的大范围招会带进下一阶段：P2 的扫描线正扫到一半、P3 的风车已经转起来，
 * 玩家面对的是两个阶段的叠加。later 也要清，否则扫描线的后两道墙会在 P3 开场 0.5s 后才补出来。
 */
function wipeField(): void {
  bullets.length = 0;
  lasers.length = 0;
  walls.length = 0;
  rings.length = 0;
  timers.length = 0;
}

export function updateBoss(dt: number): void {
  if (!boss.alive) return;
  boss.spin += dt * BOSS.spin;

  const rage = boss.enraged ? BOSS.rageSpeed : 1;
  boss.ang += dt * (BOSS.angSpeed + (boss.phase - 1) * BOSS.angPerPhase) * rage;

  const tx = Math.cos(boss.ang) * BOSS.orbitX;
  const tz = Math.sin(boss.ang) * BOSS.orbitZ + BOSS.orbitZOff;
  const f = Math.min(1, dt * 1.5);
  boss.x = lerp(boss.x, tx, f);
  boss.z = lerp(boss.z, tz, f);
  boss.y = BOSS.hoverY + Math.sin(clock.elapsed * 1.05) * BOSS.hoverAmp + Math.sin(clock.elapsed * 2.3) * BOSS.hoverAmp2;

  boss.flash = Math.max(0, boss.flash - dt);

  // 训练场：boss 只做环绕运动，出招由面板驱动（patterns/training.ts）
  if (state === 'training') return;

  boss.cd -= dt;
  if (boss.cd <= 0) {
    runPattern(pickPattern());
    const diff = DIFFICULTIES[session.difficulty];
    boss.cd = diff.cdBase * (1 - (boss.phase - 1) * BOSS.cdPerPhase)
      / (boss.enraged ? BOSS.cdRage : 1)
      * rand(diff.cdJitter[0], diff.cdJitter[1]);
  }
}

export function damageBoss(d: number): void {
  if (!boss.alive) return;
  // 训练场：不掉血，只给一点受击反馈，玩家可以一直练
  if (state === 'training') {
    boss.flash = Math.max(boss.flash, 0.1);
    return;
  }
  boss.hp = Math.max(0, boss.hp - d);
  boss.flash = Math.max(boss.flash, 0.1);

  const p = boss.hp / boss.maxHp;
  if (p <= ROUND.phase2 && boss.phase === 1) {
    boss.phase = 2;
    boss.seq = 0;                 // 新阶段从该阶段的第一招重新教
    boss.cd = Math.min(boss.cd, 1.2);
    wipeField();                  // 上一阶段的招不带进来
    toast('BOSS 进入第二阶段', 1500, COLORS.boss);
  } else if (p <= ROUND.phase3 && boss.phase === 2) {
    boss.phase = 3;
    boss.seq = 0;
    boss.cd = Math.min(boss.cd, 1.0);
    wipeField();
    toast('BOSS 进入第三阶段 · 弹幕加速', 1500, COLORS.boss);
  }

  if (boss.hp <= 0) {
    boss.alive = false;
    for (let i = 0; i < 60; i++) spawnSpark(boss.x, boss.y, boss.z, COLORS.boss, 2.2);
    endGame(true);
  }
  updateHud();
}

/** 血条比例，给 UI 用（避免 UI 自己再写一遍 clamp） */
export function bossHpRatio(): number {
  return clamp(boss.hp / boss.maxHp, 0, 1);
}
