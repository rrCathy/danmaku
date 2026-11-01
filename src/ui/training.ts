/**
 * 训练场面板：16 个图案格子 + 弹速三档 + 受击计数。
 *
 * 面板只在 `state === 'training'` 时可见。训练场刻意**不锁指针**，
 * 否则鼠标被吃掉就点不到这些按钮了 —— 转视角用右键拖动或 Q/E。
 */
import { TRAINING } from '../config';
import { PATTERN_LABELS } from '../patterns/sequence';
import { ALL_PATTERNS } from '../patterns';
import { stats, training } from '../state';
import { replay, selectPattern, setSpeed } from '../systems/training';
import type { PatternName } from '../types';
import { backToMenu } from './flow';

const panel = document.getElementById('trainPanel');
let built = false;

export function initTrainPanel(): void {
  if (!panel || built) return;
  built = true;

  panel.innerHTML = [
    '<div class="tp-head"><b>训练场</b><span class="tp-sub">选中即循环</span></div>',
    '<div class="tp-grid" id="tpGrid"></div>',
    '<div class="tp-row"><span class="tp-lab">弹速</span><div class="tp-speeds" id="tpSpeed"></div></div>',
    '<div class="tp-row tp-foot">',
    '  <span class="tp-stat" id="tpStat">受击 0</span>',
    '  <button class="tp-btn" id="tpReplay" type="button">再来一发</button>',
    '  <button class="tp-btn ghost" id="tpExit" type="button">返回说明</button>',
    '</div>'
  ].join('');

  const grid = panel.querySelector('#tpGrid')!;
  for (let i = 0; i < ALL_PATTERNS.length; i++) {
    const name = ALL_PATTERNS[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tp-pat';
    b.dataset.pat = name;
    b.textContent = PATTERN_LABELS[name].name;
    b.title = PATTERN_LABELS[name].hint;
    b.addEventListener('click', function () {
      selectPattern(name);
      refreshTrainPanel();
    });
    grid.appendChild(b);
  }

  const speedBox = panel.querySelector('#tpSpeed')!;
  for (let i = 0; i < TRAINING.speeds.length; i++) {
    const v = TRAINING.speeds[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tp-sp';
    b.dataset.sp = String(v);
    b.textContent = v + '×';
    b.addEventListener('click', function () {
      setSpeed(v);
      refreshTrainPanel();
    });
    speedBox.appendChild(b);
  }

  panel.querySelector('#tpReplay')!.addEventListener('click', function () {
    replay();
    refreshTrainPanel();
  });
  panel.querySelector('#tpExit')!.addEventListener('click', function () {
    backToMenu();
  });

  refreshTrainPanel();
}

export function refreshTrainPanel(): void {
  if (!panel || !built) return;

  const pats = panel.querySelectorAll<HTMLElement>('.tp-pat');
  for (let i = 0; i < pats.length; i++) {
    pats[i].classList.toggle('on', pats[i].dataset.pat === training.pattern);
  }

  const sps = panel.querySelectorAll<HTMLElement>('.tp-sp');
  for (let i = 0; i < sps.length; i++) {
    sps[i].classList.toggle('on', Number(sps[i].dataset.sp) === training.speed);
  }

  const stat = panel.querySelector('#tpStat');
  if (stat) {
    stat.textContent = '受击 ' + stats.hits + ' · ' + PATTERN_LABELS[training.pattern as PatternName].name;
  }
  lastStat = '';
}

/** 每帧调用：只有文字变了才写 DOM，受击计数实时跳 */
let lastStat = '';

export function updateTrainHud(): void {
  if (!panel || !built) return;
  const txt = '受击 ' + stats.hits + ' · ' + PATTERN_LABELS[training.pattern as PatternName].name;
  if (txt === lastStat) return;
  lastStat = txt;
  const stat = panel.querySelector('#tpStat');
  if (stat) stat.textContent = txt;
}

export function showTrainPanel(on: boolean): void {
  if (!panel) return;
  panel.classList.toggle('hidden', !on);
}
