#!/usr/bin/env node
/**
 * 性能探针 —— 固定场景、固定随机源、固定 dt，测「单帧 JS 耗时」与 canvas 调用数。
 *
 * 前置：先起本地服务（npm run dev，默认 http://127.0.0.1:5173/danmaku/）。
 * 用法：
 *   npm run perf                          # 默认 diff=4 / seed=20261104 / pat=latticeBurst
 *   npm run perf -- --port 5179 --frames 180
 *   npm run perf -- --pat lattice111 --target 11.1 --shot .tmp-perf/shot.png
 *
 * 可选参数：--port / --url / --diff / --seed / --pat / --warm / --frames /
 *           --target / --shot / --out / --gpu=0|1
 * Playwright 解析顺序：PLAYWRIGHT_MODULE 环境变量 → 本项目的 'playwright' →
 *                     同级 GroupViz 里已装的那份（本机回退）。
 *
 * ⚠️ 口径警告：本项目历史文档里的 60.4fps / 39.7fps 来自 headless `--disable-gpu`
 * 软件渲染，与真机 GPU 可以差 20 倍以上。本探针**默认带 GPU**，输出里会打印
 * gpuRenderer；用 --gpu=0 才会退回软渲染。任何性能结论都必须注明用的是哪个口径。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 同时支持 --key=value 与 --key value 两种写法（npm run perf -- --port 5179）
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(argv[i]);
  if (!m) continue;
  if (m[2] !== undefined) { args[m[1]] = m[2]; continue; }
  const next = argv[i + 1];
  if (next !== undefined && !next.startsWith('--')) { args[m[1]] = next; i++; }
  else args[m[1]] = '1';
}
const num = (k, d) => args[k] === undefined ? d : Number(args[k]);

const PORT = args.port || '5173';
const URL = args.url || `http://127.0.0.1:${PORT}/danmaku/?auto=1&dbg=1&diff=${num('diff', 4)}&seed=${num('seed', 20261104)}`;
const PAT = args.pat || 'latticeBurst';
const WARM = num('warm', 90);
const FRAMES = num('frames', 120);
const TARGET = num('target', 11.1);
const GPU = args.gpu !== '0';

async function loadPlaywright() {
  const tries = [];
  if (process.env.PLAYWRIGHT_MODULE) tries.push(process.env.PLAYWRIGHT_MODULE);
  tries.push('playwright');
  tries.push(pathToFileURL(path.resolve(ROOT, '../GroupViz/node_modules/playwright/index.mjs')).href);
  for (const t of tries) {
    try { return (await import(t)).chromium; } catch { /* 试下一个 */ }
  }
  throw new Error('找不到 playwright。请 npm i -D playwright，或设置 PLAYWRIGHT_MODULE 指向已安装副本的 index.mjs');
}

const chromium = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: GPU
    ? ['--no-sandbox', '--disable-dev-shm-usage', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy']
    : ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.addInitScript(({ seed }) => {
  let s = seed >>> 0;
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const q = [];
  window.requestAnimationFrame = function (cb) { q.push(cb); return q.length; };
  window.cancelAnimationFrame = function () {};
  window.__step = function (t) {
    const list = q.splice(0, q.length);
    for (let i = 0; i < list.length; i++) list[i](t);
  };
  window.__calls = 0;
  window.__byName = Object.create(null);
  const P = CanvasRenderingContext2D.prototype;
  const names = ['drawImage', 'stroke', 'fill', 'arc', 'beginPath', 'moveTo', 'lineTo',
    'fillRect', 'fillText', 'strokeRect', 'createRadialGradient', 'save', 'restore',
    'setTransform', 'translate', 'scale', 'clearRect', 'closePath', 'ellipse',
    'quadraticCurveTo', 'bezierCurveTo', 'rotate', 'clip'];
  for (const n of names) {
    const orig = P[n];
    if (typeof orig !== 'function') continue;
    P[n] = function (...a) {
      window.__calls++;
      window.__byName[n] = (window.__byName[n] || 0) + 1;
      return orig.apply(this, a);
    };
  }
}, { seed: num('seed', 20261104) });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.__dbg, null, { timeout: 30000 });

const gpuRenderer = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return 'no-webgl';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
});

await page.evaluate((pat) => {
  window.__dbg.boss.cd = 99999;       // 阻止 boss 自动出招，只留单一场景
  window.__dbg.player.inv = 99999;    // 屏蔽受击慢动作，dt 才恒定
  window.__dbg.run(pat);
}, PAT);

const data = await page.evaluate(({ warm, frames }) => {
  const STEP = 1000 / 60;
  let t = 0;
  const times = [], calls = [], bullets = [];
  for (let i = 0; i < warm + frames; i++) {
    t += STEP;
    window.__calls = 0;
    window.__byName = Object.create(null);
    const s = performance.now();
    window.__step(t);
    const e = performance.now();
    if (i >= warm) {
      times.push(e - s);
      calls.push(window.__calls);
      bullets.push(window.__dbg.counts.b);
    }
  }
  return { times, calls, bullets, byName: window.__byName, state: window.__dbg.state };
}, { warm: WARM, frames: FRAMES });

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
const r3 = (v) => +v.toFixed(3);

let shot;
if (args.shot) {
  const p = path.resolve(args.shot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const buf = await page.screenshot({ path: p });
  shot = { path: p, sha256: (await import('node:crypto')).createHash('sha256').update(buf).digest('hex') };
}

const result = {
  url: URL, pattern: PAT, gpu: GPU, gpuRenderer, frames: FRAMES, state: data.state,
  targetMs: TARGET,
  frameMs: { mean: r3(mean(data.times)), p50: r3(q(data.times, 0.5)), p95: r3(q(data.times, 0.95)), max: r3(Math.max(...data.times)) },
  canvasCalls: { mean: r3(mean(data.calls)), min: Math.min(...data.calls), max: Math.max(...data.calls) },
  bullets: { mean: r3(mean(data.bullets)), min: Math.min(...data.bullets), max: Math.max(...data.bullets) },
  lastFrameByName: data.byName,
  verdict: {
    mean: mean(data.times) <= TARGET ? 'PASS' : 'FAIL',
    p95: q(data.times, 0.95) <= TARGET ? 'PASS' : 'FAIL'
  },
  screenshot: shot || null,
  pageErrors: errors
};
console.log(JSON.stringify(result, null, 2));
if (args.out) fs.writeFileSync(path.resolve(args.out), JSON.stringify(result, null, 2));
await browser.close();
