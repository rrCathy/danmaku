/** boss：环绕运动、出招节奏、阶段与狂暴。 */
import { BOSS, DIFFICULTIES, ROUND } from '../config';
import { COLORS } from '../core/color';
import { clamp, lerp, rand } from '../core/math';
import { boss, clock, session, state } from '../state';
import { spawnSpark } from './effects';
import { pickPattern, runPattern } from '../patterns';
import { updateHud } from '../ui/hud';
import { toast } from '../ui/toast';
import { endGame } from '../ui/flow';

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
    // 占台机制：晶格招等"舞台时间"长的招式声明 holdCd —— 晶体在场时它就是全部威胁，
    // boss 停顿该时长再抽下一招（招式的持续时间决定抽招节奏，序列编排的基石）。
    // 普通招不设 holdCd，照常走难度节奏。
    if (boss.holdCd) {
      boss.cd = boss.holdCd;
      boss.holdCd = 0;
    } else {
      const diff = DIFFICULTIES[session.difficulty];
      boss.cd = diff.cdBase * (1 - (boss.phase - 1) * BOSS.cdPerPhase)
        / (boss.enraged ? BOSS.cdRage : 1)
        * rand(diff.cdJitter[0], diff.cdJitter[1]);
    }
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
  // 换阶段只切"从哪一招开始教"（phase + seq 归零）。
  // **不碰 boss.cd、不清场**：当前招可能正在 holdCd 占台（晶格招 6~10s），
  // 强行缩短 cd / wipeField 会把进行中的招式拦腰砍断 —— 让它走完，
  // 新阶段第一招在当前招 hold 结束后自然抽到（retire 会收走旧晶体）。
  if (p <= ROUND.phase2 && boss.phase === 1) {
    boss.phase = 2;
    boss.seq = 0;
    toast('BOSS 进入第二阶段', 1500, COLORS.boss);
  } else if (p <= ROUND.phase3 && boss.phase === 2) {
    boss.phase = 3;
    boss.seq = 0;
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
