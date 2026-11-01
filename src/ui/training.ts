/**
 * 训练场的「选招式」区 —— 挂在暂停卡里，**不是常驻面板**。
 *
 * 早先版本把它常驻在左下角，结果压住虚拟摇杆、挡手势，而且练的时候一直占着屏幕。
 * 现在的规矩：练的时候画面干净（和正常对局一样），要换招就按 P 暂停。
 *
 * 点一格 = 立刻开练（选完自动继续）；调弹速 = 留在原地，方便先设速度再选招。
 */
import { TRAINING } from '../config';
import { ALL_PATTERNS } from '../patterns';
import { PATTERN_LABELS } from '../patterns/sequence';
import { logs, session, stats, training } from '../state';
import { replay, selectPattern, setSpeed } from '../systems/training';
import type { PatternName } from '../types';
import { renderDiag } from './diag';
import { resumeGame } from './flow';

const pick = document.getElementById('trainPick');
let built = false;

/** 换招时把「受击 N 次」清零，这个数字才是"这一招我挨了几下" */
function resetTrainingStats(): void {
  stats.hits = 0;
  stats.low = 0;
  stats.mid = 0;
  stats.high = 0;
  stats.rain = 0;
  logs.length = 0;
  renderDiag();
}

export function initTrainPanel(): void {
  if (!pick || built) return;
  built = true;

  const grid = document.getElementById('tpGrid')!;
  for (let i = 0; i < ALL_PATTERNS.length; i++) {
    const name = ALL_PATTERNS[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tp-pat';
    b.dataset.pat = name;
    b.textContent = PATTERN_LABELS[name].name;
    b.title = PATTERN_LABELS[name].hint;
    b.addEventListener('click', function () {
      resetTrainingStats();
      selectPattern(name);
      refreshTrainPanel();
      resumeGame();           // 选完就开练，不用再点一次「继续」
    });
    grid.appendChild(b);
  }

  const speedBox = document.getElementById('tpSpeed')!;
  for (let i = 0; i < TRAINING.speeds.length; i++) {
    const v = TRAINING.speeds[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tp-sp';
    b.dataset.sp = String(v);
    b.textContent = v + '×';
    b.title = '弹速 ' + v + ' 倍';
    b.addEventListener('click', function () {
      setSpeed(v);
      refreshTrainPanel();    // 调速度不自动继续，留在暂停卡里
    });
    speedBox.appendChild(b);
  }

  const replayBtn = document.getElementById('tpReplay');
  if (replayBtn) {
    replayBtn.addEventListener('click', function () {
      replay();
      resumeGame();
    });
  }

  refreshTrainPanel();
}

export function refreshTrainPanel(): void {
  if (!pick || !built) return;

  const pats = pick.querySelectorAll<HTMLElement>('.tp-pat');
  for (let i = 0; i < pats.length; i++) {
    pats[i].classList.toggle('on', pats[i].dataset.pat === training.pattern);
  }

  const sps = pick.querySelectorAll<HTMLElement>('.tp-sp');
  for (let i = 0; i < sps.length; i++) {
    sps[i].classList.toggle('on', Number(sps[i].dataset.sp) === training.speed);
  }

  const stat = document.getElementById('tpStat');
  if (stat) {
    const label = PATTERN_LABELS[training.pattern as PatternName];
    stat.textContent = label.name + ' · 受击 ' + stats.hits + ' 次 · 弹速 ' + training.speed + '×';
  }
}

/** 训练场里按 P 暂停时调一次，保证选中态和计数是最新的 */
export function openTrainPick(): void {
  if (session.mode !== 'training') return;
  initTrainPanel();
  refreshTrainPanel();
}
