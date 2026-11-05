/**
 * 全局实体类型。
 *
 * 这个项目只在验证一件事：玩家能不能读懂「弹现在在哪一层」。
 * 所以这里没有 Entity 基类、没有继承、没有组件系统 —— 全是扁平结构体，
 * 每帧整批遍历，方便在控制台里直接 dump 一份快照做量化分析。
 */

/** 语义高度段。只用于文案与统计，不影响颜色（颜色由 heightRGB 按连续高度决定）。 */
export type HClass = 'low' | 'mid' | 'high' | 'rain' | 'grid';

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
  | 'stack'
  /** 晶格：整片点阵作为刚体运动（平移 / 自转 / 升降 / 发散） */
  | 'lattice'
  /** 对流墙系：左右两列反向推进的高墙（单位 = 一道墙） */
  | 'wallFlow'
  /** 对流墙系第一变体：墙法向 y 的水平大板 */
  | 'wallFlowY';

/**
 * 晶格组帧：整片点阵按刚体运动。
 *
 * 子弹只带自己的局部坐标 (lx, ly, lz)，世界位置每帧由组帧算出来。
 * 于是"整片点阵自转""螺旋轴上升""对数螺旋外扩"这些运动只改组帧的几个数，
 * 而不是给每颗弹各写一套积分 —— 同组点阵也不会各自漂移。
 */
export interface LatticeFrame {
  /** 组原点（世界坐标） */
  ox: number; oy: number; oz: number;
  /** 组平移速度 m/s */
  vx: number; vy: number; vz: number;
  /** 旋转：当前角 / 角速度 rad/s */
  ang: number; omega: number;
  /** 旋转轴：'y' = 绕竖直轴原地转（x-z 平面），'z' = 绕场地内水平轴翻滚（x-y 平面） */
  axis?: 'y' | 'z';
  /** 组龄（秒）—— 脉动/声子/位错/相变/聚散都按它驱动 */
  age: number;
  /** 呼吸脉动：scale = 1 + pulseA·sin(pulseW·age)。pulseA=0 关闭 */
  pulseA?: number; pulseW?: number;
  /** 声子径向密度波：u = phononA·sin(phononK·ρ − phononW·age)，ρ = 到组原点的水平距离 */
  phononA?: number; phononK?: number; phononW?: number;
  /** 刃位错：错位波前沿 x 推进速度（m/s）。波前经过处上半晶体（ly>0）沿 z 错开半格 */
  dislocV?: number;
  /** 相变：age 达到 phaseT 后，面心点在 2s 内滑向 BCC 体心格点（tgtLx* 由 put 算好） */
  phaseT?: number;
  /** 聚散解体：age 达到 burstAt 后，全部弹脱离组帧沿径向飞散 */
  burstAt?: number;
  /** 缩放上限：scale 到顶后 sv 清零（晶体长出用） */
  scaleCap?: number;
  /** 生长保护：age < noHitAt 期间整片无判定（长出时全弹挤在原点，判了就是糊脸秒杀） */
  noHitAt?: number;
  /** 齐狙模式：每颗弹按 fireAt 依次朝玩家发射（弹本体飞出，阵点熄灭） */
  volley?: boolean;
  /** 层落雨：每颗弹按 dropAt（层序）依次脱离组帧匀速下落 —— 晶体本身化雨 */
  rainDrop?: boolean;
  /** 生成序号（volley 排队用） */
  idx?: number;
  /** 缩放（发散 / 呼吸）：当前倍率 / 每秒变化 */
  scale: number; sv: number;
  /** 上次更新的帧号 —— 同一帧内整片点阵只算一次 */
  frame: number;

  /* ---- v5.3：晶胞级单位所需的可选扩展（全部默认关闭，旧招零影响） ---- */
  /** 任意 3D 姿态：3×3 行主序旋转矩阵。设了就替代 ang/omega 的单轴旋转 */
  rot?: number[];
  /**
   * 到点飞行：组原点从 (sx,sy,sz) 在 dur 秒内 smoothstep 移到 (tx,ty,tz)，
   * delay 秒后出发；到点后恢复 vx/vy/vz 匀速平移（通常 0 = 停住）。
   * 用于「晶胞从各处飞来拼合」「整层横扫进场后停住」。
   */
  fly?: {
    sx: number; sy: number; sz: number;
    tx: number; ty: number; tz: number;
    dur: number; delay?: number;
  };
  /** 胞内生长：scale 在 dur 秒内从 from（默认 0）smoothstep 撑到 1 —— 点间距渐涨到上限 */
  grow?: { dur: number; from?: number };
  /** 拼合去重：组龄达到 dedupAt 后，标了 dedup 的冗余弹自行退场 */
  dedupAt?: number;
  /** 晶格族：'axial' = 轴对齐 fccSpace（U=1.9 偶宇称），'upright' = 立式 ABC 密排面水平。
   *  跨族几何不同，**只有同族才能被链内招接管**；旧招未设 = 不参与接管 */
  family?: 'axial' | 'upright';
  /** 停住交棒：组龄达到 stopAt 后平移速度归零，留下一个静止的全空间点阵给下一棒接管 */
  stopAt?: number;
}

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
  /** 波浪：空间纹理相位 + 排相位。y 每帧按 sin(waveP + ω·t) 同步脉动 —— 整排同高，站哪都不行 */
  waveU?: number;
  waveP?: number;
  /** 晶格组：整片点阵共享的刚体变换帧 */
  lg?: LatticeFrame;
  /** 该弹在晶格局部坐标系里的位置 */
  lx?: number;
  ly?: number;
  lz?: number;
  /** 齐狙：到点后脱离组帧朝玩家发射（fireAt = 组龄秒），fired = 已发射 */
  fireAt?: number;
  fired?: boolean;
  /** 层落雨：到点后脱离组帧匀速下落（dropAt = 组龄秒，按层序排布），drop = 已脱落 */
  dropAt?: number;
  drop?: boolean;
  /** 相变：BCC 体心格点（局部坐标），迁移期从 FCC 格点滑过去 */
  tgtLx?: number;
  tgtLy?: number;
  tgtLz?: number;
  /** 晶胞拼合：该点是共享角/面心的冗余副本，到点后退场（只剩一份 = 一整块无重叠晶体） */
  dedup?: boolean;
  /** 横扫进场的层：起点在场地外，豁免出界清理（否则飞进来之前半层就被裁掉了） */
  noOut?: boolean;
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

/** 龙骨炮的炮口（纯视觉实体）：预警期眼窝转红蓄力，发射时张嘴。 */
export interface Blaster {
  x: number; y: number; z: number;
  /** 剩余生命（秒）。> 0.3 是预警期，<= 0.3 已开火 */
  t: number;
  max: number;
  /** 张嘴程度 0~1 */
  open: number;
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
  /** 占台时长：晶格招施放后 boss 停顿这么久再抽下一招（招式持续时间 = 抽招节奏）。
   *  下一招施放瞬间清零 —— 普通招不受影响。0/未设 = 用难度默认节奏。 */
  holdCd?: number;
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
  grid: number;
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
  | 'wave' | 'sweepLine' | 'gaster' | 'pinwheel' | 'toho' | 'stack'
  // 难度 4 新增（晶格系 · 沿体对角线运动的真三维晶体）
  | 'lattice111' | 'latticeShear' | 'latticeWheel' | 'latticeSpin'
  // 晶格系 v5.2 批次（缺陷 / 运动学扩展 / 组合技）
  | 'latticeVac' | 'latticeScrew' | 'latticeBreath' | 'latticePhonon' | 'latticeDisloc'
  | 'latticePhase' | 'latticeBurst' | 'latticeVolley' | 'latticeRain'
  // v5.3：单位为「晶胞 / 层」的三招
  | 'latticeAssemble' | 'latticeStack' | 'latticeCone'
  // 对流墙系：独立一组，单位 = 一道墙（底座招 + 第一变体，后续变种走参数）
  | 'wallFlow' | 'wallFlowY';

/** 难度编号。1 = 标准，2 = 高压，3 = 形状微操，4 = 跳跃必要性 */
export type DifficultyKey = 1 | 2 | 3 | 4;

export type GameState = 'menu' | 'playing' | 'paused' | 'over' | 'training';
export type EndReason = 'hp' | 'time';
