/**
 * 键盘。
 *
 * 用物理键位（e.code）而不是 e.key：中文输入法打开时 e.key 会变成 Process，
 * e.code 仍然是 KeyW。
 */
import { COLORS } from '../core/color';
import { toast } from '../ui/toast';
import { opts, state } from '../state';
import { flags } from './flags';
import {
  cycleCam, cycleTrail, enterOrbit, restartLast, startGame, toggleMini,
  togglePause, togglePolar
} from '../ui/flow';
import { closeHelp, isHelpOpen, toggleHelp } from '../ui/overlays';

export const keys: Record<string, boolean> = Object.create(null);

const KEYMAP: Record<string, string> = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
  KeyJ: 'j', KeyQ: 'q', KeyE: 'e', KeyC: 'c',
  KeyV: 'v', KeyT: 't', KeyM: 'm', KeyP: 'p', KeyR: 'r',
  KeyG: 'g', KeyH: 'h', KeyK: 'k', Space: ' ',
  ShiftLeft: 'shift', ShiftRight: 'shift',
  ArrowUp: 'arrowup', ArrowDown: 'arrowdown',
  ArrowLeft: 'arrowleft', ArrowRight: 'arrowright',
  Escape: 'escape', Enter: 'enter',
  // 物理键位映射：不管 Shift 有没有按、输入法是什么状态，都能开操作卡
  Slash: '?'
};

function keyOf(e: KeyboardEvent): string {
  return KEYMAP[e.code] || (e.key ? e.key.toLowerCase() : '');
}

export function initKeyboard(): void {
  window.addEventListener('keydown', function (e) {
    const k = keyOf(e);
    // 注意：不要拦 Escape —— 浏览器要用它退出鼠标锁定（指针锁定）
    if (k === ' ' || k === 'r' || k.indexOf('arrow') === 0) e.preventDefault();
    const first = !keys[k];
    keys[k] = true;
    if (!first) return;

    if (k === ' ') flags.jump = true;
    if (k === 'shift') flags.dash = true;
    if (k === 'c') cycleCam();
    if (k === 'q' || k === 'e') enterOrbit(false);
    if (k === 't') cycleTrail();
    if (k === 'm') toggleMini();
    if (k === 'v') togglePolar();
    if (k === 'g') { opts.shadows = !opts.shadows; toast(opts.shadows ? '地面影子：开' : '地面影子：关', 900, COLORS.player); }
    if (k === 'h') { opts.guides = !opts.guides; toast(opts.guides ? '高度引导线：开' : '高度引导线：关', 900, COLORS.player); }
    if (k === 'k') { opts.hitbox = !opts.hitbox; toast(opts.hitbox ? '判定框：显示' : '判定框：隐藏', 900, COLORS.player); }
    if (k === 'p' && (state === 'playing' || state === 'paused' || state === 'training')) togglePause();
    if (k === '?' || k === '/') toggleHelp();
    if (k === 'escape' && isHelpOpen()) closeHelp();
    if (k === 'r' && state !== 'menu') restartLast();
    if (k === 'enter' && state === 'menu') startGame();
  });

  window.addEventListener('keyup', function (e) {
    keys[keyOf(e)] = false;
  });

  window.addEventListener('blur', function () {
    for (const k in keys) keys[k] = false;
  });
}
