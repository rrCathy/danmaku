/** 受击诊断面板：每次被击中记一条「被什么打中 / 命中高度 / 怎么躲」。 */
import { COLORS } from '../core/color';
import { logs } from '../state';
import { el } from './dom';

export function renderDiag(): void {
  if (!logs.length) {
    el.diagList.innerHTML = '<div class="dempty">尚无记录</div>';
    return;
  }
  let html = '';
  for (let i = 0; i < logs.length; i++) {
    const l = logs[i];
    const c = 'rgb(' + (COLORS[l.cls] || COLORS.mid) + ')';
    html += '<div class="ditem">' +
      '<span class="dot" style="color:' + c + '"></span>' +
      '<span><span class="nm" style="color:' + c + '">' + l.info.name + '</span>' +
      ' · 命中高度 ' + l.y.toFixed(1) + 'm<br>' +
      '<span class="tp">' + l.info.tip + '</span></span></div>';
  }
  el.diagList.innerHTML = html;
}
