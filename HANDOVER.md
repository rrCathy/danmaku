# 2.5E 弹幕 · 项目交接文档

> 交接对象：接手这个验证装置的下一个人 / 下一个自己
> 版本：v1.0　｜　整理时间：2026-11-01
> 仓库：`github.com/rrCathy/danmaku`　｜　线上：<https://rrcathy.github.io/danmaku/>

---

## 0. 一句话说清这是什么

这不是一个「弹幕游戏」，是一个**可读性实验装置**：把玩家锁在地面一个平面上，让子弹在真正的三维空间里飞，然后回答一个问题——**玩家能不能读懂「那颗弹现在在哪一层」**。

所有设计取舍都服从这一条。凡是「好玩」但「看不懂」的东西，优先级都排在后面。

---

## 1. 判断标准（最重要的一条）

> 玩 3 局，每局结束后问：**每次被击中时，你是否知道「为什么被打中」？**
> 三次里只要有一次说不清，可读性系统就不合格。

这是装置的验收线，不是感觉。后续任何改动都要能回答：**它让"说不清"变多了还是变少了。**

---

## 2. 当前状态

| 项 | 值 |
|---|---|
| 版本 | v1.0 |
| 形态 | **Vite + TypeScript 多模块**，40 个 `.ts` + 2 个 `.css`，零运行时依赖（无 CDN / 字体 / 图片 / WebGL） |
| 源码规模 | 4,464 行 TS + 343 行 CSS |
| 构建产物 | `dist/assets/index-*.js` **62.9 KB**（gzip 22.9 KB）+ `index-*.css` 17.1 KB |
| 难度 | 标准（16 图案）/ 高压（21 图案） |
| 渲染 | canvas 2D + 手写透视投影（`project()`），不用 3D 库 |
| 实测帧率 | **60.4 fps**（1440×900，headless Chromium 软件渲染，8 秒连续作战） |
| 运行时错误 | **0**（v0.6 每次开局会留 1 条未捕获的 pointer lock 拒绝，已修） |
| 退出与暂停 | 对局/训练场都能 `P` 暂停 → 继续 / 重开 / 操作方式 / 返回说明 |
| 行为一致性 | **14/14 场景与 v0.6 逐位一致**（`?seq=random`，方法见 §9） |
| 出招可控 | 固定序列（默认）+ `?seq=random` 回退 + `?seed=` 逐位复现 |
| 移动端 | 沿用 v0.6 的触屏布局与横竖屏处理，**本轮重构未重新实测真机** |

---

## 3. 怎么跑、怎么部署

### 本地

```bash
npm install
npm run dev        # http://127.0.0.1:5173/danmaku/
npm run build      # tsc --noEmit && vite build → dist/
npm run preview    # 预览构建产物
```

> v0.6 的「双击 index.html」特性**已经不存在**：ES module + 构建产物不能从 `file://` 直接跑。
> 这是换成工程化项目的必然代价，换来的是类型检查、模块边界和可复现的调试参数。

### 部署到 GitHub Pages

推 `main` 即触发 `.github/workflows/deploy.yml`：

```
setup-node(20, npm cache) → npm ci → npm run build
→ configure-pages(enablement: true) → upload-pages-artifact(dist)
→ deploy-pages
```

- 产物路径 `dist`，资源前缀 `/danmaku/`（`vite.config.ts` 的 `base`）
- 首次部署若仓库未开启 Pages：`configure-pages` 会尝试自动开启；失败则去
  **Settings → Pages → Source** 手动选 **GitHub Actions**（只设一次）

### 环境限制（这次踩过的坑）

| 通道 | 状态 |
|---|---|
| 本机 `git push` 走 `ssh.github.com:443` | ✅ 可用（`~/.ssh/config` 已把 `github.com` 别名到 443） |
| WorkBuddy 默认沙箱 | ❌ 拦截 `~/.ssh` 读取，push 必须在沙箱外执行 |
| `npm install` | ⚠️ 会继承 `http_proxy` 环境变量而卡死，先清空代理变量再装 |

---

## 4. 代码地图

数据流单向，从输入到绘制：

```
input/*        →  flags / keys / touch          （只写输入状态）
systems/*      →  改 state 里的实体与 clock     （唯一的游戏逻辑层）
patterns/*     →  通过 addBullet / later 影响未来
render/*       →  只读 state，project() 成屏幕坐标
ui/*           →  只读 state，写 DOM
```

### 模块职责

| 路径 | 职责 | 关键导出 |
|---|---|---|
| `src/main.ts` | 装配、主循环、URL 参数、`window.__dbg` | `frame()` |
| `src/config.ts` | **所有可调数值**：场地 / 玩家 / 冲刺 / 战斗节奏 / boss / 相机 / 难度 | `PLAYER` `BOSS` `ROUND` `DASH` `CAMERA` `LOOK` `DIFFICULTIES` |
| `src/types.ts` | 扁平实体结构体，方便 dump 快照 | `Bullet` `Player` `Boss` … |
| `src/state.ts` | 全局可变状态 + `reset()` + `later()` | `player` `boss` `bullets` `clock` `state` `opts` |
| `core/camera.ts` | 手写透视相机（自由 / 极坐标 / 环绕三态） | `cam` `polar` `project()` `updateCamera()` |
| `core/color.ts` | 高度→颜色连续映射（121 档缓存）+ 语义分段 | `heightRGB()` `clsName()` `CLASS_INFO` |
| `core/screen.ts` | 画布 / DPR / 背景预渲染 | `canvas` `ctx` `W` `H` `resize()` |
| `core/random.ts` | 随机源：默认 Math.random，`?seed=` 切 mulberry32 | `random()` `rand()` `setSeed()` |
| `input/keyboard.ts` | 物理键位（`e.code`）映射，中文输入法下也准 | `keys` |
| `input/pointer.ts` | 指针锁定、右键拖动、摇杆手势分发 | `look` `reqLock()` `lookHintOn()` |
| `systems/loop.ts` | 一帧的总调度 | `updateGame(dt)` |
| `systems/player.ts` | 移动 / 跳跃 / 冲刺 / 开火 | `updatePlayer()` `startDash()` |
| `systems/boss.ts` | 环绕运动、出招节奏、阶段、狂暴 | `updateBoss()` `damageBoss()` |
| `systems/bullets.ts` | 积分、生命周期、碰撞、**受击诊断链** | `addBullet()` `updateBullets()` `onPlayerHit()` |
| `systems/hazards.ts` | 激光 / 弹墙 | `updateLasers()` `updateWalls()` |
| `systems/training.ts` | 训练场：清场 / 选图案 / 循环 / 弹速 | `selectPattern()` `updateTraining()` `setSpeed()` |
| `patterns/index.ts` | 出招总表 + 阶段池 + 抽取 | `runPattern()` `pickPattern()` `PATTERNS` |
| `patterns/sequence.ts` | 固定出招序列 + 图案中文名/解法提示 | `SEQUENCES` `PATTERN_LABELS` |
| `patterns/shots.ts` | 16 种图案的具体实现 | `rainShot()` `wallShot()` … |
| `render/index.ts` | 绘制总入口（深度排序只对实体做） | `render()` |
| `ui/flow.ts` | 开始 / 暂停 / 结束 / 镜头 / 极坐标 / 开关 | `startGame()` `pauseGame()` `resumeGame()` `endGame()` |
| `ui/overlays.ts` | 暂停卡 / 操作方式卡的显隐与状态回退 | `syncOverlays()` `openHelp()` `toggleHelp()` |
| `ui/hud.ts` | 血条、计时、阶段 | `updateHud()` |
| `ui/diag.ts` | 受击诊断面板 | `renderDiag()` |
| `ui/training.ts` | 训练场「选招式」区（挂在暂停卡里） | `initTrainPanel()` `openTrainPick()` `refreshTrainPanel()` |

### 状态与实体（`src/state.ts`）

```
state: menu | playing | paused | over | training   （只在 ui/flow.ts 里被改）
session.mode: game | training                      （暂停卡的重开、选招区显隐都看它）
clock: { elapsed, timeLeft, slowT, dmgFlash }（只在 systems/ 里被改）

player     玩家           boss       boss
bullets[]  敌方子弹       pshots[]   玩家子弹
lasers[]   旋转激光       walls[]    墙缝
rings[]    地面预警圈     particles[] 粒子
timers[]   延迟回调（later）           ghosts[] 冲刺残影
logs[]     受击诊断（只留 DIAG_KEEP 条） stats{} 命中分类计数
training{} 训练场：选中的图案 / 弹速 / 距下次循环
boss.cast  本局实际出过的招（48 条上限）
```

### 调试参数（URL 直接带，做自动化验证用）

| 参数 | 作用 |
|---|---|
| `?auto=1` | 直接开打 |
| `?dbg=1` | 把 `cam / player / boss / bullets / clock / counts / kinds / run() / dash()` 挂到 `window.__dbg` |
| `?pat=rain` | 开局触发指定图案（16 种全支持，含 v0.6 缺的 `sweepLow` / `sweepHigh`） |
| `?t=30` | 无渲染快进 30 秒（**同步**执行，可配合种子做逐位对照） |
| `?drive=wasd` | 模拟按住移动键 |
| `?fire=1` | 模拟一直开火 |
| `?boss=200` | 直接把 boss 血量设成 200（测 P2 / P3 图案池） |
| `?polar=1` | 直接进极坐标模式 |
| `?cam=2` / `?yaw=1.2` | 指定镜头预设 / 环绕角度 |
| `?touch=1` | 强制触屏布局 |

---

## 5. 玩法数值

全部集中在 `src/config.ts`，下表是"改哪个常量"的索引。

| 项 | 值 | 常量 |
|---|---|---|
| 场地 | 半径 **18 m** 圆形 | `ARENA_R` |
| 玩家血量 | 100 | `state.ts: freshPlayer()` |
| 移动 | 加速度 64，上限 **8.4 m/s**，阻尼 10 | `PLAYER.acc/maxSpeed/damp` |
| 跳跃 | 二段跳，初速 9.4 / 8.6，重力 27 | `PLAYER.jumpVy/gravity` |
| 受击 | 扣 **8**（落点雨 9），无敌帧 **0.85 s** → 容错 12 下 | `PLAYER.dmgBullet/dmgRain/invTime` |
| 玩家判定 | 竖直胶囊：半径 **0.26 m**，y+0.18 ~ y+1.42 | `PLAYER.hitR/bodyLow/bodyHigh` |
| BOSS | 900 血，限时 **120 s** | `ROUND.bossHp/time` |
| 出招间隔 | 1.85 s，按阶段递减 13%/阶段，狂暴再 ÷1.45 | `BOSS.cdBase/cdPerPhase/cdRage` |
| 阶段 | 66% → P2，33% → P3 | `ROUND.phase2/phase3` |
| 狂暴 | 剩 30 s 自动触发（转速×1.5、出手更快） | `ROUND.rageAt`、`BOSS.rageSpeed` |
| **冲刺** | 26 m/s × 0.18 s ≈ **4.7 m**，冷却 **1.15 s**，**不无敌** | `DASH` |

| **训练场** | 循环间隔 2.8 s，弹速档位 0.5 / 1 / 1.5 | `TRAINING` |
| **难度 2** | 出招基数 1.42 s、弹速 ×1.1、图案池 21 种 | `DIFFICULTIES[2]` |

> 玩家速度 / 判定半径 / boss 血量三者是调过的平衡，单项大改会连带影响。
> 训练场的弹速倍率只在 `addBullet()` 里乘一次，所以对所有图案一致生效，玩家不受影响。

---

## 6. 视觉编码（可读性系统的核心）

### 6.1 颜色 = 当前高度（连续）

| 高度 | 0 | 0.9 | 1.8 | 3.0 | 4.6 | 7.6 | 12 |
|---|---|---|---|---|---|---|---|
| 颜色 | 红 | 橙 | 黄 | 绿 | 青 | 蓝 | 紫 |

- 采样前密后疏：0–3 m 是主要交战高度，这一段必须分得清（`core/color.ts: H_STOPS`）
- **颜色由子弹此刻的 `y` 决定，每帧刷新**。一颗弹从 10.5 m 落下来会一路紫→蓝→青→黄→红
- 缓存 121 档（0.1 m 一档），`heightRGB()` 零分配
- 语义分段 `clsName()`（0.85 / 2.4 两刀）**只用于文案与统计**，不影响颜色；
  图案生成时另有一套 `clsByHeight()`（1.05 / 2.05），两套段界不同是历史行为，1:1 保留

**设计取舍（重要）**：颜色跟当前高度走，意味着**弹的"身份"不再由颜色承担**。代价是「落点雨」失去了原来的专属青色——它现在从紫色一路变红砸下来，视觉上和高空弹下落无异，只能靠地面亮圈识别。这是已知问题，见 §8。

### 6.2 其它读 Aid

| 手段 | 键 | 说明 |
|---|---|---|
| 轨迹线 | `T` | 拖尾（跟在弹后，同色同高度）/ 预测虚线（前 0.5 s）/ 关 |
| 俯视雷达 | `M` | 颜色=高度；实心=低空，**空心=高空**（别跳） |
| 地面影子 | `G` | 彩色投影环，判断离地高度 |
| 高度引导线 | `H` | 竖直参考线 |
| 判定框 | `K` | 显示胶囊判定 |
| 地面亮圈 | — | 俯冲弹悬停落点 / 地雷读秒 / 地涌升起点 |

### 6.3 受击诊断

每次被击中，右下角记录一条：

```
低空弹 · 命中高度 0.6m
贴地 0.5m —— 起跳可以躲过
```

**只保留最近 4 条**（`config.ts: DIAG_KEEP`），不落盘，不导出。写入口：`systems/bullets.ts: onPlayerHit()`。

---

## 7. 21 种图案与出招顺序

标准难度 16 种，高压难度在此基础上多 5 种（见 §7.2）。阶段解锁：P1 → P2 → P3 逐步放开。

**默认走固定序列**（v0.8 起的改动，`patterns/sequence.ts`）。随机抽意味着三次测试跑的不是同一套弹幕，
结论不可比。序列按「先教最基本的，再教需要新动作的」排序，每阶段开头都是这阶段的新东西：

| 阶段 | 顺序 |
|---|---|
| P1 | 贴地扫 → 弥散 → 地涌 → 环形 → 阶梯 |
| P2 | 高空扫 → 落点雨 → 卫星 → 俯冲 → 低接高 → 贴地扫 → 弥散 → 地涌 → 环形 → 阶梯 |
| P3 | 墙缝 → 激光 → 追踪 → 地雷 → 螺旋 → 双螺旋 → 高空扫 → 落点雨 → 卫星 → 俯冲 → 低接高 → 贴地扫 → 弥散 → 地涌 → 环形 → 阶梯 |

- 游标是 `boss.seq`，**阶段切换时归零**，所以升到 P2 会重新从「高空扫」开始教
- `?seq=random` 退回 v0.6 的随机抽（池内随机 + 避免连续重复），用来对照
- 每局实际出过的招记在 `boss.cast`（48 条上限），`__dbg.history` 可读

| # | 名称 | 说明 | 高度带 | 解法 | 位置 |
|---|---|---|---|---|---|
| 1 | `sweepLow` | 扇形贴地扫射 | 低 0.55 | 起跳 | `patterns/index.ts` |
| 2 | `spread` | 瞄准点弥散，跨三带 | 全带 | 侧走 / 看高度选动作 | `patterns/emitters.ts` |
| 3 | `ring` | 三层环形扩散（P3 三层齐发） | 0.55 / 1.6 / 2.55 | 分层处理 | `patterns/index.ts` |
| 4 | `stair` | 高度逐级抬升的连发，像楼梯刷过来 | 渐进 | 跟着节奏抬/降 | `patterns/shots.ts` |
| 5 | `rise` | 地底竖直升起的立柱，必须横移 | 0→高 | 横移（跳没用） | 同上 |
| 6 | `sweepHigh` | 高空横压 | 高 2.45 | **别跳**，从下方穿 | `patterns/index.ts` |
| 7 | `rain` | 地面亮圈读秒 → 垂直下落 | 10.5→0 | 离开圈 | `patterns/shots.ts` |
| 8 | `satBurst` | 三颗卫星各打一组瞄准弹（多发射源） | 中 | 认发射源 | 同上 |
| 9 | `dive` | 高空悬停读秒 → 垂直砸落点 | 高→0 | 离开落点 | 同上 |
| 10 | `lowHigh` | 先低扫（跳），1 s 后高扫（必须落地） | 低→高 | 起跳节奏 | 同上 |
| 11 | `orbit` | 追踪弹 | 中 | 绕圈拉扯 | 同上 |
| 12 | `spiral` | 连续螺旋，高度做正弦 | 波动 | 找缝穿 | 同上 |
| 13 | `wall` | 整面立体弹墙推进，只留一个缺口 | 全高 | 冲缺口 | 同上 |
| 14 | `laser` | 旋转激光低扫/高扫，从边缘横过 | 低或高 | 看扫过高度决定跳否 | 同上 |
| 15 | `mine` | 斜砸地面 → 读秒 → 四周炸一圈低空弹 | 0.55 | 离开圈 | 同上 |
| 16 | `counterSpiral` | 双股反向螺旋交错，缝隙在转 | 波动 | 跟着缝走 | 同上 |

> 单独测某个图案：`?train=1&pat=rain`（训练场循环），或 `?auto=1&dbg=1&pat=rain&t=14`（对局内插一招）。

### 7.2 高压难度新增的 5 种

设计原则一句话：**能靠侧移解决的，不算难**。

| 图案 | 机制 | 堵死哪条路 | 位置 |
|---|---|---|---|
| `jumpWall` 跃墙 | 横跨 ±18m（= 整个场地直径）、无缺口的贴地墙，三波：低 0.55 / 高 3.1 / 低 0.55 | 侧移（墙比场地宽）、后撤（墙比玩家快）→ **只能跳**，且第三波高墙逼你不能乱跳 | `patterns/shots.ts` |
| `sniper` 预判狙 | 按玩家速度打 0.3s 提前量，0.55 / 1.55 / 2.75 三个高度同时来，连打 2–3 轮 | 站桩 | 一出现就得变向 |
| `gate` 闸门 | 两道同向墙，缺口错开 4.4m，第二道晚 0.75s | 穿一个口就想停 | 穿第一道后立刻横移 |
| `risenare` 涌裂 | 地涌升到 2.9m 炸开 10 发环 | 贴脸站桩 | 起手就拉开距离 |
| `feint` 假坠 | 紫色高空弹落到 1.78m **改成水平追踪一次** | "读颜色就够了" | 读运动，不是读颜色 |

实现要点：
- `jumpWall` 的宽度必须是 `±ARENA_R`，不是固定值 —— 早先写 ±11m，玩家贴边就能绕过去
- `pushWall()` 从 `wallShot` 抽出来给「墙缝 / 闸门」共用；抽的时候保持 RNG 顺序不变，标准难度才没漂
- `feint` 用 `b.fuse` 当"还没变向"标记（1 = 未变向，0 = 已变向），在 `updateBullets` 里改速度和高度

### 训练场

`state = 'training'`，入口是说明页的「训练场」按钮或 `?train=1`。和正常对局的差异只有四条：

| 项 | 对局 | 训练场 |
|---|---|---|
| 计时 | 2 分钟倒计时 | 正计时，`clock.timeLeft` 冻结 |
| boss | 掉血、三阶段、狂暴 | 不掉血（`damageBoss` 直接返回） |
| 玩家 | 会死 | 不扣血，受击仍走完整诊断链 |
| 出招 | 固定序列 + boss cd | 面板选中的图案每 2.8 s 重放 |

**选招式是暂停时做的事**（v0.9 改的）。v0.8 把它做成左下角常驻面板，结果：

- 手机上压住虚拟摇杆，训练场根本没法移动
- 训练场刻意不锁指针（为了能点面板），于是鼠标视角也废了

现在的规矩：

- 练习时画面和正常对局一样干净，**指针照常锁定**（鼠标转视角 / 触屏右半屏搓）
- `P` 暂停 → 暂停卡里多出「选招式」：16 格 + 弹速 0.5/1/1.5 + 受击计数 + 再来一发
- 点一格 = 换招 + 自动继续；调弹速留在暂停卡里（设置类动不打断）
- 换招时清零 `stats` 与诊断日志，「受击 N 次」才是"这一招我挨了几下"
- 暂停即 `exitPointerLock()`，否则鼠标被吃住点不到卡片；继续时 `relock()`

实现要点：
- `systems/training.ts` 的 `selectPattern()` 会先 `clearField()`（含 timers），否则上一招的延迟回调会串进新招
- 面板显隐统一由 `ui/overlays.ts: syncOverlays()` 决定，别在别处直接 toggle

---

## 8. 已知问题（按严重程度）

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| 1 | **出招完全随机** | 三次测试跑的不是同一套弹幕，结论不可比 | 加 `?seed=` 固定种子 / 固定序列 |
| 2 | **样本量不足** | 单局 2 分钟，P3 才全开 16 种，一局测不到一半图案 | 训练场 + 逐图案测试 |
| 3 | **诊断只留 4 条、不落盘** | 只能定性访谈，无法量化 | 扩到 8–12 条 + 导出 JSON/CSV |
| 4 | **落点雨失去专属色** | 视觉上与高空弹下落无区别，只靠地面圈识别 | 加专属标记（虚线拖尾 / 方头） |
| 5 | **无回放** | 玩家说"不知道咋死的"时无法追问 | 见 §10 第 3 条 |
| 6 | 文案「2.4m 以上」与判定胶囊顶 1.42m 的对应关系 | 起跳后是否会被高弹打到，靠体感 | 实测校准，必要时改文案 |
| 7 | `updateBullets` 里 `rise` 分支仍用离散色覆盖连续色 | 0.85–1.05 m 波段闪 1 帧（肉眼不可见） | 改配色时顺手清掉，代码里有注释标注 |

---

## 9. 行为一致性怎么验证的（v0.7 的核心证据）

重构做了 3228 行 → 35 个模块的搬运，必须证明"逻辑一个字节没动"。

**方法**：把随机源换成固定种子、把 `requestAnimationFrame` 打成空函数，于是 `?t=N` 的
同步快进成为唯一的推进来源。同一份种子 + 同一串参数，新旧两版在快进结束时的状态
必须**逐位相同**（浮点数直接比较，不是容差）。

比对字段：`state`、玩家 `x/y/z/hp/jumps/inv/vx/vz`、boss `x/y/z/hp/phase/alive`、
弹幕数量、弹幕坐标与速度的加权和、前 4 颗弹的 `kind:cls:rgb`。

**结果：14 / 14 场景全部逐位一致。**

```
auto=1&dbg=1&t=60&drive=wasd
auto=1&dbg=1&t=60&drive=wasd&fire=1
auto=1&dbg=1&t=40&pat=rain
auto=1&dbg=1&t=40&pat=wall
auto=1&dbg=1&t=40&pat=spiral
auto=1&dbg=1&t=40&boss=200&drive=wasd
auto=1&dbg=1&t=30&polar=1&drive=wa
auto=1&dbg=1&t=40&pat=lowhigh&drive=wd
auto=1&dbg=1&t=14&drive=wasd&fire=1&boss=200
auto=1&dbg=1&t=14&pat=mine&drive=ws
auto=1&dbg=1&t=14&pat=counter&fire=1
auto=1&dbg=1&t=14&pat=laser&drive=ad
auto=1&dbg=1&t=14&pat=dive&drive=wasd
auto=1&dbg=1&t=14&pat=sat&drive=wa
```

### v0.8 的增量验证

| 断言 | 做法 | 结果 |
|---|---|---|
| 序列吻合 | `?auto=1&seed=7&t=90&boss=200`，取 `boss.cast` 与 `SEQUENCES[3]` 逐项比对 | 16 招全对 |
| 种子可复现 | 同 seed 跑两次 `?t=40`，快照（玩家/boss/弹幕加权和）比较 | 完全一致；换 seed 必不同 |
| 训练场可用 | 16 个图案逐个 `?train=1&pat=X&t=2.5` | 全部 `fired=true`、hp 保持 100、`timeLeft` 冻结 120、0 报错 |
| 弹速倍率 | `?train=1&pat=spread&speed=0.5/1/1.5`，取场上子弹平均速度比 | 0.500 / 1.000 / 1.500（精确） |
| 回归 | `tools/equiv.mjs`（已默认加 `?seq=random`） | 14/14 逐位一致 |

### v0.9 的增量验证

| 断言 | 做法 | 结果 |
|---|---|---|
| 暂停能回主界面 | 开局 → `P` → 点「返回说明」 | 回到菜单，三张遮罩显隐正确 |
| 操作卡自动暂停 | 对局中按 `?` | `state=paused`，关掉后回到对局 |
| 对局暂停不出现选招 | 对局 `P` | `#trainPick` 隐藏 |
| 训练场暂停才出现选招 | `?train=1` → `P` | 16 格可见，卡片加宽 |
| 选招自动继续 | 点「地雷」 | 切到 mine、`state=training`、计时继续走 |
| 桌面转视角 | 训练场右键拖动 | `cam.yaw 0.300 → 1.380` |
| 手机转视角 | 训练场右半屏上下搓 | `cam.pitch 0.460 → 0.160` |
| 手机摇杆不被遮挡 | 训练场取摇杆中心 `elementFromPoint` | 命中 canvas（无覆盖）；按住 0.7 s 位移 5.7 m |
| 帧率 | 全新 headless 实例 | 60.4 fps（连续两次） |

### v1.0 的增量验证

| 断言 | 做法 | 结果 |
|---|---|---|
| 跃墙真的横跨全场 | 取墙的切向跨度 | **36.0 m**（= 场地直径），全部 y = 0.55 |
| 跃墙比玩家快 | 墙速 vs `PLAYER.maxSpeed` | 10.3 vs 8.4 m/s（含 1.1× 难度倍率） |
| 5 个新图案都能出 | 逐个 `?diff=2&pat=X&t=2.2` | 全部 `fired=true`，0 报错 |
| 高压更密 | 同 seed 同 25 秒 | 标准 13 招 → 高压 **18 招** |
| 高压序列 | `boss.cast` vs `SEQUENCES_D2` | 逐项吻合 |
| 标准难度未受影响 | `tools/equiv.mjs` | **14/14 仍与 v0.6 逐位一致** |
| 帧率 | 全新 headless，119 颗弹 | **60.5 fps**（标准 60.6） |

> 踩坑记录：加训练场时 `frame()` 的更新条件还写着 `state === 'playing'`，
> 结果面板能点、图案"选了"，但 `clock.elapsed` 一直是 0 —— 画面其实冻着。
> 靠 `__dbg.clock.elapsed` 探针才抓到。改状态机时先搜一遍所有 `'playing'`。

复现方式见 `tools/equiv.mjs`（跑之前需要：`npx vite preview --port 4173` +
一个开了 `--remote-debugging-port=9333` 的 Chromium）。

> 陷阱记录：最初把 `rand(2.4, 5.2)` 手写成 `2.4 + Math.random() * 2.8`，
> 看着等价，实则 `5.2 - 2.4 = 2.8000000000000003 ≠ 2.8`，落点会差一点点。
> 所有随机一律走 `core/math.ts` 的 `rand(a, b)`，不要手写展开。

---

## 10. 路线图

| # | 想法 | 状态 |
|---|---|---|
| 1 | 高度配色改连续彩虹 | ✅ v0.6 |
| 2 | 修手机极坐标俯仰 | ✅ v0.6 |
| 3 | 部署到 GitHub Pages + Actions | ✅ v0.7（Vite 构建版） |
| 4 | 新增冲刺 | ✅ v0.6 |
| 5 | 工程化重构（Vite + TS，行为 1:1） | ✅ v0.7 |
| 6 | 训练场 | ✅ v0.8 |
| 7 | 训练场可测所有图案 | ✅ v0.8（16 格全通） |
| 8 | 受击回放 | ⬜ 待做 |
| 9 | 固定种子 / 固定序列 | ✅ v0.8 |
| 10 | 3D 弹幕分类学 + 新图案 | ⬜ 长期 |
| 11 | 训练场存活计时 / 命中率 | ⬜ 待做 |
| 12 | 第二难度「高压」（5 个新图案） | ✅ v1.0 |
| 13 | 高压难度真人实测与调参 | ⬜ **最优先** |

### 6/7 训练场 · 建议实现

新增 `state = 'training'` 分支：

- 进图后不计时、boss 不掉血、玩家不死（或血量重置）
- 一个图案选择面板（16 个格子，点一下循环播放该图案）—— `ALL_PATTERNS` 已经导出好了
- 可调弹速 0.5× / 1× / 1.5×
- 复用 `runPattern(name)`，**不需要重写图案逻辑**

### 8 受击回放 · 建议实现

环形快照缓冲：

- 每 2 帧存一份快照（30 Hz），保留 2 秒 ≈ 60 份
- 每份存 `player{x,y,z}`、`boss{x,y,z}`、`bullets[]` 的扁平数值数组
- 命中瞬间切到 `replay` 状态：冻结主循环，按 0.4× 慢放回放，镜头切固定斜角，高亮命中那颗弹
- 回放结束自动恢复；`ESC` 可跳过

内存估算：200 弹 × 7 数值 × 60 帧 ≈ 8.4 万 float，可接受。

### 10 分类学 · 建议框架

按四维给 16 种图案建表，再据此设计新图案填补空位：

1. **来向**：正面 / 侧向 / 地面 / 高空 / 环绕
2. **高度带**：单层 / 跨层 / 连续变化
3. **运动学**：直线 / 追踪 / 螺旋 / 静止读秒 / 加速
4. **解法**：跳 / 不跳 / 横移 / 离开圈 / 找缺口 / 跟缝

---

## 11. 交接注意

- **不要引入美术资源**。这个装置的说明力来自「纯几何也能读」，一旦上贴图，结论就变成"因为有美术所以能读"。
- **不要动 `project()` 的裁剪阈值**（`CAMERA.near = 0.2`），改了会出现子弹在镜头后方被绘制的诡异现象。
- **`bullets` 每帧重算 `cls`**，任何新图案如果要按类别做逻辑判断，别依赖出生时的 `cls`。
- **改数值先看 §5 表**，玩家速度 / 判定半径 / boss 血量三者是调过的平衡。
- **`src/styles/app.css` 是顺序敏感的**（`body.touch` 与 `@media` 覆盖在前面的桌面规则之后），不要随意调段落顺序。
- **`state` 只能在 `ui/flow.ts` 里改**（通过 `setState`）；其它模块只读。同理 `clock` 只在 `systems/` 里改。
- **ESM 循环依赖是存在的**（`state ↔ ui/hud`、`bullets ↔ ui/flow`、`camera ↔ state`），
  只要不在模块顶层解引用这些绑定就安全；新增顶层副作用前先想清楚加载顺序。
- **新增状态时先搜 `'playing'`**：`frame()`、指针、跳/冲刺按钮、HUD 都有判断，漏一个就是"界面在动、世界是冻的"。
- **不要在 HUD 上放常驻大面板**：手机端左下角是摇杆的地盘，压上去就等于把移动锁死。要用就放进暂停卡。
- **`onAfterResize()` 必须在首次 `resize()` 之前注册**，否则摇杆会停在 (0,0) 直到用户改窗口大小。
- **暂停 / 继续要成对处理指针锁**：暂停 `exitPointerLock()`（露出光标点卡片），继续 `relock()`（否则鼠标划到画外）。
- **随机一律走 `core/random.ts`**，不要直接 `Math.random()`（相机抖动除外，它按帧率调用，会破坏快进复现）。
- 改完跑一遍：`npm run typecheck` → `npm run build` → `?auto=1&dbg=1` 看 `__dbg.counts.hp`、帧率、控制台无报错 → 截图。

---

## 附：文件清单

```
danmaku/
├── index.html                     # 只有 DOM
├── package.json / tsconfig.json / vite.config.ts
├── README.md                      # 面向使用者
├── HANDOVER.md                    # 本文档
├── LICENSE
├── .gitignore / .gitattributes
├── .github/workflows/deploy.yml   # Actions 构建 + 发布 dist
├── archive/v0.6-single-file.html  # 重构前基线（不参与构建）
├── tools/equiv.mjs                # 1:1 行为对照脚本
└── src/                           # 35 个 TS 模块 + 2 个 CSS
```
