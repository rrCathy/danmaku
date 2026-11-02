/**
 * 全局实体类型。
 *
 * 这个项目只在验证一件事：玩家能不能读懂「弹现在在哪一层」。
 * 所以这里没有 Entity 基类、没有继承、没有组件系统 —— 全是扁平结构体，
 * 每帧整批遍历，方便在控制台里直接 dump 一份快照做量化分析。
 */

/** 语义高度段。只用于文案与统计，不影响颜色（颜色由 heightRGB 按连续高度决定）。 */
export type HClass = 'low' | 'mid' | 'high' | 'rain';

/**
 * 子弹形状。缺省 = ball（全部旧图案，行为不变）。
 * 碰撞箱跟视觉形状走：ball=球、box=膨胀 OBB、tetra=四面体四半平面、
 * arrow/ellip=头尾双球（胶囊扫掠近似）。尺寸倍数 len 相对 r。
 */
export type BulletShape = 'ball' | 'arrow' | 'box' | 'ellip' | 'tetra' | 'octa';

/** 子弹来源图案。保留这个字段是为了按图案做统计，逻辑上不参与判定。 */
export type BulletKind =
  | 'sweep' | 'spread' | 'rain' | 'orbit' | 'ring' | 'spiral'
  | 'wall' | 'sat' | 'stair' | 'dive' | 'mine' | 'mineLive'
  | 'rise' | 'mineBurst'
  /** 诱饵：降到半空突然改成水平冲刺 */
  | 'feint'
  // ---- 难度 3 新增（形状弹幕 / 环境弹幕）----
  /** 花瓣环：径向速度按玫瑰线调制，俯视呈花瓣 */
  | 'petal'
  /** 放射光芒：从一点向多方向射出的光线串 */
  | 'radial'
  /** 全图雨：覆盖整个场地的规律落雨 */
  | 'downpour'
  /** 喷泉：带重力的斜抛弹（抛物线） */
  | 'fountain'
  /** 反雨：从地下往上升的弹幕柱 */
  | 'uprain'
  /** 放射锥：朝一个方向的锥状喷射 */
  | 'cone'
  // ---- 难度 4 新增（跳跃必要性）----
  /** 自机狙：每发瞄准玩家当前位置 */
  | 'aim'
  /** 随机弹：随机方向、随机速度 */
  | 'rand'
  /** 烟雾弹：一点爆开、慢速扩散、长滞空 */
  | 'smoke'
  /** 闪电：读秒更短、落速更快的雨 */
  | 'lightning'
  /** 手雷：一点爆开、四面八方高速 */
  | 'grenade'
  /** 波浪：整排推进，高度按正弦起伏 */
  | 'wave'
  /** 扫描线：低墙在场地内来回扫 */
  | 'sweepLine'
  /** 龙骨炮：一束粗弹从任意点朝玩家方向射出 */
  | 'gaster'
  /** 风车：螺旋臂绕中心旋转 */
  | 'pinwheel'
  /** 东方对称：高低交替的对称弹幕 */
  | 'toho'
  /** 堆叠：多层交错弹幕 + 高钉惩罚乱跳 */
  | 'stack';

export interface Bullet {
  x: number; y: number; z: number;
  /** 上一帧位置，用来画单帧拖影（不是轨迹线，轨迹线在 trail 里） */
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  r: number;
  cls: HClass;
  kind: BulletKind;
  /** '255,64,104' 形式，每帧按当前高度重算 */
  rgb: string;
  homing: number;
  life: number;
  /** 俯冲弹 / 地雷的读秒；undefined 表示没有引信 */
  fuse?: number;
  /** 1 = 不参与碰撞（地雷本体） */
  noHit?: number;
  /** 重力加速度 m/s²（喷泉的抛物线用）。不设 = 匀速直线，所有旧图案不受影响 */
  grav?: number;
  /** 形状（缺省 ball）。arrow/box/ellip 走扫掠双球判定：头球 + 上一帧位置的尾球 */
  shape?: BulletShape;
  /** 形状尺寸倍数（相对 r）：arrow 的箭长、ellip 的长轴、box 的长边。缺省 arrow 3.4 / ellip 1.8 / box 2.2 */
  len?: number;
  /** 已计过擦弹（每颗弹只擦一次，防刷） */
  grazed?: number;
  /** 扫描线：沿速度方向的往返边界（x/z 里主轴的那个轴），越界即反向 */
  oscLo?: number;
  oscHi?: number;
  /** 风车：绕 (orbX, orbZ) 的极坐标（角度 / 半径 / 角速度），每帧重算 x/z */
  orbA?: number;
  orbR?: number;
  orbW?: number;
  orbX?: number;
  orbZ?: number;
  trail: number[] | null;
  tk: number;
}

export interface Shot {
  x: number; y: number; z: number;
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  r: number; dmg: number; life: number;
}

export interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; rgb: string; size: number;
}

/** 地面预警圈。t 倒数到 0 时触发对应的东西。 */
export interface Ring {
  x: number; z: number; r: number;
  t: number; dur: number;
  cls?: string;
}

export interface Laser {
  x: number; z: number;
  ang: number; y: number;
  spin: number;
  /** >0 表示还在预警期，不判定 */
  warm: number;
  life: number; r: number; cls: HClass;
}

/** 整面推进的弹墙，只留一个缺口。 */
export interface Wall {
  nx: number; nz: number; tx: number; tz: number;
  D: number; halfW: number;
  gapPos: number; gapW: number;
  t: number; dur: number;
}

export interface Ghost {
  x: number; y: number; z: number;
  life: number; max: number;
}

export interface Player {
  x: number; y: number; z: number;
  vx: number; vz: number; vy: number;
  jumps: number;
  hp: number; maxHp: number;
  /** 无敌帧剩余秒数 */
  inv: number;
  fireCd: number;
  hitFlash: number;
  /** 极坐标模式的 (r, θ) */
  pr: number; pa: number; pvr: number; pw: number;
  dashT: number; dashCd: number;
  dashDX: number; dashDZ: number;
}

export interface Boss {
  x: number; y: number; z: number;
  hp: number; maxHp: number;
  phase: number;
  ang: number;
  flash: number;
  cd: number;
  last: string;
  alive: boolean;
  spin: number;
  enraged: boolean;
  /** 三颗卫星炮的相位 */
  sats: number[];
  /** 固定序列的游标：每阶段从 0 开始（见 patterns/sequence.ts） */
  seq: number;
  /** 本局实际出过的招（最多 48 条）—— 复盘用，也是顺序验证的证据 */
  cast: string[];
}

export interface HitLog {
  info: { name: string; tip: string };
  y: number;
  cls: HClass;
  t: number;
}

export interface Stats {
  hits: number;
  low: number;
  mid: number;
  high: number;
  rain: number;
  /** 擦弹总数与三分类（弹在头顶上方 / 脚下 / 身侧掠过） */
  graze: number;
  grazeHead: number;
  grazeFoot: number;
  grazeBody: number;
}

export interface Timer {
  t: number;
  fn: () => void;
}

/** 屏幕意图：f = 向前推，r = 向右推，len = 推杆幅度 0~1 */
export interface InputDir {
  f: number;
  r: number;
  len: number;
}

export interface Vec3 {
  x: number; y: number; z: number;
}

/** project() 的输出：屏幕坐标 + 相机空间深度 + 缩放比 */
export interface Projected {
  x: number; y: number;
  z: number;
  s: number;
}

/** 弹幕图案的标识 */
export type PatternName =
  // 第一难度（标准）
  | 'sweepLow' | 'spread' | 'ring' | 'stair' | 'rise'
  | 'sweepHigh' | 'rain' | 'satBurst' | 'dive' | 'lowHigh'
  | 'orbit' | 'spiral' | 'wall' | 'laser' | 'mine' | 'counterSpiral'
  // 第二难度（高压）新增
  | 'jumpWall' | 'sniper' | 'gate' | 'risenare' | 'feint'
  // 第三难度（形状弹幕 · 微操）新增
  | 'petal' | 'radial' | 'downpour' | 'fountain' | 'uprain' | 'cone'
  // 第四难度（跳跃必要性）新增
  | 'aimed' | 'random' | 'smoke' | 'lightning' | 'grenade'
  | 'wave' | 'sweepLine' | 'gaster' | 'pinwheel' | 'toho' | 'stack';

/** 难度编号。1 = 标准，2 = 高压，3 = 形状微操，4 = 跳跃必要性 */
export type DifficultyKey = 1 | 2 | 3 | 4;

export type GameState = 'menu' | 'playing' | 'paused' | 'over' | 'training';
export type EndReason = 'hp' | 'time';
