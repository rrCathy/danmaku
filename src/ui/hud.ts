/** 顶部血条 / 计时 / 阶段标签。每帧刷新一次，纯 DOM 文本与宽度。 */
import { DIFFICULTIES, ROUND } from '../config';
import { polar } from '../core/camera';
import { clamp } from '../core/math';
import { PATTERN_LABELS } from '../patterns/sequence';
import { boss, clock, freeze, player, session, state, stats, training } from '../state';
import { dashButtonEl } from '../input/touch';
import { camSubEl, el } from './dom';

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

export function updateHud(): void {
  const inTraining = state === 'training';

  if (polar.on && camSubEl) {
    const deg = (player.pa * 180 / Math.PI + 360) % 360;
    camSubEl.textContent = 'r ' + player.pr.toFixed(1) + 'm · θ ' + deg.toFixed(0) + '° · 上下=进出 左右=绕圈';
  } else if (camSubEl) {
    camSubEl.textContent = inTraining
      ? '训练场 · 不计时不计死 · 右键拖动转视角'
      : '目标：击破 boss · 限时 2 分钟';
  }
  const pp = clamp(player.hp / player.maxHp, 0, 1) * 100;
  const bb = clamp(boss.hp / boss.maxHp, 0, 1) * 100;
  el.hpPfill.style.width = pp + '%';
  el.hpPtxt.textContent = Math.ceil(player.hp) + ' / ' + player.maxHp;
  el.hpBfill.style.width = bb + '%';
  el.hpBtxt.textContent = Math.ceil(boss.hp) + ' / ' + boss.maxHp;

  // 训练场没有剩余时间这回事，计时器改成已练时长
  el.timer.textContent = fmtTime(inTraining ? clock.elapsed : clock.timeLeft);
  el.timer.classList.toggle('warn', !inTraining && clock.timeLeft <= ROUND.rageAt);

  if (inTraining) {
    el.phaseTag.textContent = '训练 · ' + PATTERN_LABELS[training.pattern].name +
      ' · 弹速 ' + (training.speed * session.bulletSpeed).toFixed(2).replace(/\.?0+$/, '') + '×' +
      (freeze.on ? ' · 定格中（F 解除 · 转视角看子弹）' : ' · F 定格');
  } else {
    el.phaseTag.textContent = 'PHASE ' + boss.phase + ' · ' +
      DIFFICULTIES[session.difficulty].name + ' · GRAZE ' + stats.graze + (boss.enraged ? ' · 狂暴' : '');
  }

  const dashEl = dashButtonEl();
  if (dashEl) dashEl.classList.toggle('cool', player.dashCd > 0);
}
