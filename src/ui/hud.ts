/** 顶部血条 / 计时 / 阶段标签。每帧刷新一次，纯 DOM 文本与宽度。 */
import { ROUND } from '../config';
import { polar } from '../core/camera';
import { clamp } from '../core/math';
import { boss, clock, player } from '../state';
import { dashButtonEl } from '../input/touch';
import { camSubEl, el } from './dom';

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

export function updateHud(): void {
  if (polar.on && camSubEl) {
    const deg = (player.pa * 180 / Math.PI + 360) % 360;
    camSubEl.textContent = 'r ' + player.pr.toFixed(1) + 'm · θ ' + deg.toFixed(0) + '° · 上下=进出 左右=绕圈';
  } else if (camSubEl) {
    camSubEl.textContent = '目标：击破 boss · 限时 2 分钟';
  }
  const pp = clamp(player.hp / player.maxHp, 0, 1) * 100;
  const bb = clamp(boss.hp / boss.maxHp, 0, 1) * 100;
  el.hpPfill.style.width = pp + '%';
  el.hpPtxt.textContent = Math.ceil(player.hp) + ' / ' + player.maxHp;
  el.hpBfill.style.width = bb + '%';
  el.hpBtxt.textContent = Math.ceil(boss.hp) + ' / ' + boss.maxHp;
  el.timer.textContent = fmtTime(clock.timeLeft);
  el.timer.classList.toggle('warn', clock.timeLeft <= ROUND.rageAt);
  el.phaseTag.textContent = 'PHASE ' + boss.phase + ' · ' + (boss.enraged ? '狂暴' : '试作型 boss');
  const dashEl = dashButtonEl();
  if (dashEl) dashEl.classList.toggle('cool', player.dashCd > 0);
}
