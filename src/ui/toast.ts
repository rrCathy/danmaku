/** 中央提示条。同一时刻只显示一条，重复调用会重置计时。 */
import { el } from './dom';

let toastTimer: number | null = null;

export function toast(msg: string, ms?: number, rgb?: string): void {
  el.toast.textContent = msg;
  el.toast.style.color = rgb ? 'rgb(' + rgb + ')' : '#dff3ff';
  el.toast.classList.add('on');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(function () {
    el.toast.classList.remove('on');
  }, ms || 1200);
}
