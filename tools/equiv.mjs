#!/usr/bin/env node
/**
 * 1:1 行为对照：证明「重构没有改变逻辑」。
 *
 * 原理
 *   1. 在页面脚本执行前注入固定种子的 Math.random —— 两版拿到同一串随机数；
 *   2. 把 requestAnimationFrame 打成空函数 —— 主循环不再推进；
 *   3. 于是 `?t=N` 的**同步快进**成为唯一的状态来源；
 *   4. 同一串参数下，新旧两版快进结束时的状态必须逐位相同（浮点数直接比，不用容差）。
 *
 * 前置
 *   1. 起一个静态服务（构建产物带 /danmaku/ 前缀）：
 *        npm run build && npx vite preview --port 4173
 *   2. 起一个开了调试端口的 Chromium：
 *        chrome --headless=new --disable-gpu --no-sandbox \
 *               --remote-debugging-port=9333 --user-data-dir=/tmp/dmk about:blank
 *   3. 跑：
 *        node tools/equiv.mjs
 *
 * 可覆盖的环境变量：CDP / LEGACY / NEXT
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const LEGACY = process.env.LEGACY ||
  'file:///' + process.cwd().replace(/\\/g, '/').replace(/^\/+/, '') + '/archive/v0.6-single-file.html';
const NEXT = process.env.NEXT || 'http://127.0.0.1:4173/danmaku/';

// 注意：新版默认走固定出招序列（v0.7 起），要对照 v0.6 的随机抽必须显式 ?seq=random
const CASES = [
  'auto=1&dbg=1&t=60&drive=wasd',
  'auto=1&dbg=1&t=60&drive=wasd&fire=1',
  'auto=1&dbg=1&t=40&pat=rain',
  'auto=1&dbg=1&t=40&pat=wall',
  'auto=1&dbg=1&t=40&pat=spiral',
  'auto=1&dbg=1&t=40&boss=200&drive=wasd',
  'auto=1&dbg=1&t=30&polar=1&drive=wa',
  'auto=1&dbg=1&t=40&pat=lowhigh&drive=wd',
  'auto=1&dbg=1&t=14&drive=wasd&fire=1&boss=200',
  'auto=1&dbg=1&t=14&pat=mine&drive=ws',
  'auto=1&dbg=1&t=14&pat=counter&fire=1',
  'auto=1&dbg=1&t=14&pat=laser&drive=ad',
  'auto=1&dbg=1&t=14&pat=dive&drive=wasd',
  'auto=1&dbg=1&t=14&pat=sat&drive=wa'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(CDP + '/json/list')).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('找不到页面目标，确认 Chromium 已带 --remote-debugging-port 启动');
  process.exit(2);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push((d.exception && d.exception.description) || d.text);
  }
});
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id;
  pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const BOOT = `(() => {
  let s = 123456789;
  Math.random = function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.requestAnimationFrame = function () { return 0; };
})();`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });

const SNAP = `(() => {
  var d = window.__dbg;
  if (!d) return 'NO_DBG';
  var sum = 0, kinds = '', n = d.bullets.length;
  for (var i = 0; i < n; i++) {
    var b = d.bullets[i];
    sum += b.x * 3 + b.y * 5 + b.z * 7 + b.vx * 11 + b.vy * 13 + b.vz * 17 + b.r * 19 + b.life * 23;
    if (i < 4) kinds += b.kind + ':' + b.cls + ':' + b.rgb + '|';
  }
  return JSON.stringify({
    st: d.state,
    p: [d.player.x, d.player.y, d.player.z, d.player.hp, d.player.jumps, d.player.inv, d.player.vx, d.player.vz],
    b: [d.boss.x, d.boss.y, d.boss.z, d.boss.hp, d.boss.phase, d.boss.alive ? 1 : 0],
    n: n, sum: sum, kinds: kinds, cts: d.counts
  });
})()`;

async function run(url) {
  errors.length = 0;
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    const r = await send('Runtime.evaluate', {
      expression: 'document.readyState + "|" + (window.__dbg ? 1 : 0)',
      returnByValue: true
    });
    const v = r.result && r.result.result && r.result.result.value;
    if (v === 'complete|1') break;
  }
  const r = await send('Runtime.evaluate', { expression: SNAP, returnByValue: true });
  return { snap: r.result && r.result.result ? r.result.result.value : 'EVAL_FAIL', errors: errors.slice() };
}

let diff = 0;
console.log('legacy:', LEGACY);
console.log('next  :', NEXT);
console.log('');
for (const c of CASES) {
  const q = c + '&seq=random';
  const a = await run(LEGACY + '?' + q);
  const b = await run(NEXT + '?' + q);
  const same = a.snap === b.snap;
  if (!same) diff++;
  console.log((same ? 'SAME  ' : 'DIFF  ') + c);
  if (!same) {
    console.log('   legacy: ' + String(a.snap).slice(0, 300));
    console.log('   next  : ' + String(b.snap).slice(0, 300));
  }
  if (a.errors.length || b.errors.length) {
    console.log('   errors legacy=' + a.errors.length + ' next=' + b.errors.length);
  }
}
console.log('');
console.log(diff === 0 ? 'ALL ' + CASES.length + ' CASES IDENTICAL' : diff + ' / ' + CASES.length + ' DIFFER');
ws.close();
process.exit(diff === 0 ? 0 : 1);
