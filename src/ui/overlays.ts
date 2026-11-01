/**
 * 暂停卡与操作方式卡。
 *
 * 两张卡的关系：
 *   - 暂停卡：`state === 'paused'` 时出现；背景 `pointer-events:none`，
 *     所以点空白处会穿透到 canvas → 继续（保留「点画面继续」的老习惯）。
 *   - 操作卡：随时可开（菜单里也能开）。对局中开会先把世界按暂停，
 *     关掉再回到原来的状态 —— 读说明的时候不该被弹幕打。
 */
import { session, state, setState } from '../state';
import { lookHintOn } from '../input/pointer';
import { el } from './dom';
import { backToMenu, relock, resumeGame, restartLast } from './flow';

let helpOpen = false;
/** 开操作卡之前是不是在跑；关掉后要回到这个状态 */
let helpResumeTo: 'playing' | 'training' | null = null;

export function isHelpOpen(): boolean {
  return helpOpen;
}

/** 状态变了就调一次：两张卡 + 选招区的显隐只在这里决定 */
export function syncOverlays(): void {
  el.helpOverlay.classList.toggle('hidden', !helpOpen);
  const paused = state === 'paused' && !helpOpen;
  el.pauseOverlay.classList.toggle('hidden', !paused);

  // 训练场暂停时，暂停卡里多出一块「选招式」；对局暂停时不显示
  const picking = paused && session.mode === 'training';
  el.trainPick.classList.toggle('hidden', !picking);
  el.pauseCard.classList.toggle('wide', picking);
}

export function openHelp(): void {
  if (helpOpen) return;
  helpOpen = true;
  if (state === 'playing' || state === 'training') {
    helpResumeTo = state;
    setState('paused');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  syncOverlays();
}

export function closeHelp(): void {
  if (!helpOpen) return;
  helpOpen = false;
  if (helpResumeTo) {
    setState(helpResumeTo);
    helpResumeTo = null;
  }
  syncOverlays();
  relock();
  lookHintOn();
}

export function toggleHelp(): void {
  if (helpOpen) closeHelp();
  else openHelp();
}

export function initOverlays(): void {
  document.getElementById('btnHelp')!.addEventListener('click', openHelp);
  document.getElementById('btnPauseHelp')!.addEventListener('click', openHelp);
  document.getElementById('btnHelpClose')!.addEventListener('click', closeHelp);

  // 点遮罩空白处关闭（卡片本身不关）
  el.helpOverlay.addEventListener('click', function (e) {
    if (e.target === el.helpOverlay) closeHelp();
  });

  document.getElementById('btnResume')!.addEventListener('click', resumeGame);
  document.getElementById('btnPauseRestart')!.addEventListener('click', restartLast);
  document.getElementById('btnPauseMenu')!.addEventListener('click', function () {
    closeHelp();
    backToMenu();
  });
}
