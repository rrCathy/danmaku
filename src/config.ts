/**
 * 所有可调数值的唯一入口。
 *
 * 研究机制时只改这里就够了 —— 改完刷新页面即可看到差异，
 * 不需要在 3000 行里找魔法数字。每个常量后面的注释写的是「改了会发生什么」。
 */

import type { DifficultyKey } from './types';

/* ============ 场地 ============ */
/** 圆形战场半径（米）。玩家的活动半径是 ARENA_R - 1.0。 */
export const ARENA_R = 18;

/* ============ 玩家 ============ */
export const PLAYER = {
  /** 加速度 m/s²。越大越「跟手」，但走位会失去惯性感 */
  acc: 64,
  /** 平面速度上限 m/s */
  maxSpeed: 8.4,
  /** 松开方向键后的指数阻尼系数，越大停得越快 */
  damp: 10,
  /** 一段跳 / 二段跳初速 m/s */
  jumpVy: [9.4, 8.6] as const,
  /** 重力 m/s² */
  gravity: 27,
  /**
   * 判定胶囊半径 m。东方式小判定：远小于人物模型。
   * 规格（以标准子弹直径 STD_BULLET_D=0.42 归一）：
   *   截面直径 0.5~0.8 × 弹径 → 取 0.62 → 半径 0.13
   *   总高 1.2~1.8 × 弹径 → 取 1.7 → 0.714（轴 0.10~0.554）
   */
  hitR: 0.13,
  /** 判定胶囊下沿 / 上沿（相对脚底） */
  bodyLow: 0.10,
  bodyHigh: 0.55,
  /** 受击扣血 */
  dmgBullet: 8,
  dmgRain: 9,
  /** 受击后无敌帧秒数 */
  invTime: 0.85,
  /** 极坐标：径向最小 / 最大半径、角速度上限 */
  polarRMin: 2.0,
  polarRMax: ARENA_R - 1.2,
  polarWMax: 1.7,
} as const;

/* ============ 冲刺 ============ */
/** 26 m/s × 0.18 s ≈ 4.7 m。冲刺期间不给无敌帧 —— 变快不等于变透明。 */
export const DASH = { speed: 26, time: 0.18, cd: 1.15 } as const;

/* ============ 战斗节奏 ============ */
export const ROUND = {
  /** 单局限时（秒） */
  time: 120,
  /** 剩这么多秒时 boss 自动狂暴 */
  rageAt: 30,
  /** boss 血量 */
  bossHp: 900,
  /** 阶段阈值（血量比例） */
  phase2: 0.66,
  phase3: 0.33,
} as const;

export const BOSS = {
  /** 自转速度（卫星跟着转） */
  spin: 0.75,
  /** 绕场公转角速度基数 rad/s */
  angSpeed: 0.34,
  /** 每进一阶段公转加速量 */
  angPerPhase: 0.16,
  /** 公转轨道：x 半径 / z 半径 / z 偏移 */
  orbitX: 6.4,
  orbitZ: 5.0,
  orbitZOff: -2.5,
  /** 悬停基准高度与浮动 */
  hoverY: 5.4,
  hoverAmp: 0.85,
  hoverAmp2: 0.18,
  /** 出招间隔基数（秒） */
  cdBase: 1.85,
  /** 每进一阶段间隔缩短比例 */
  cdPerPhase: 0.13,
  /** 狂暴时除以此值 */
  cdRage: 1.45,
  /** 狂暴时公转乘以此值 */
  rageSpeed: 1.5,
  /** 出招间隔随机抖动范围 */
  cdJitter: [0.9, 1.15] as const,
} as const;

/* ============ 难度 ============ */
/**
 * 难度只改三样东西：出招密度、弹速、默认读 Aid。
 * 玩家血量 / 判定 / 场地一律不动 —— 这样两档难度之间只有一个变量在变。
 * Level 3 在此基础上换了图案池（形状弹幕 · 微操），同样不动玩家参数。
 */
export interface Difficulty {
  key: DifficultyKey;
  name: string;
  /** 一句话卖点，显示在菜单上 */
  note: string;
  /** boss 出招间隔基数（秒） */
  cdBase: number;
  /** 出招间隔随机抖动 */
  cdJitter: readonly [number, number];
  /** 敌方子弹速度倍率（玩家弹不受影响） */
  bulletSpeed: number;
}

export const DIFFICULTIES: Record<DifficultyKey, Difficulty> = {
  1: {
    key: 1,
    name: 'Level 1',
    note: '16 种图案 · 留出反应时间',
    cdBase: BOSS.cdBase,
    cdJitter: BOSS.cdJitter,
    bulletSpeed: 1
  },
  2: {
    key: 2,
    name: 'Level 2',
    note: '21 种图案 · 出招更密 · 弹速 +10%',
    cdBase: 1.42,
    cdJitter: [0.85, 1.05],
    bulletSpeed: 1.1
  },
  3: {
    key: 3,
    name: 'Level 3',
    note: '27 种图案 · 形状弹幕 · 微操穿梭',
    cdBase: 1.12,
    cdJitter: [0.85, 1.0],
    bulletSpeed: 1.18
  }
};

/* ============ 碰撞规格 ============ */
/**
 * 规格（v1.4 重标，东方式小判定）：
 *   标准子弹的碰撞箱 = **直径 STD_BULLET_D 的球**；
 *   玩家碰撞箱 = 胶囊，**横截面直径 0.5~0.8×STD_BULLET_D、总高 1.2~1.8×STD_BULLET_D**，
 *   且判定远小于人物视觉模型（模型 ~1.7m，判定总高 ~0.71m）。
 * 选定值：截面 0.62（半径 0.13）、总高 1.7（轴 0.10~0.554）。
 * 高度带语义（跳跃最高 1.64m，跳起判定 [1.74,2.29]）：
 *   贴地扫 0.55 → 站立被打、跳起躲过（要跳）✓
 *   高空扫 2.45 → 站立躲过、跳起擦到（别跳）✓
 * 全部弹幕高度带已按此重标（patterns/shots.ts）。
 */
export const STD_BULLET_D = 0.42;
export const HITBOX_SPEC = {
  /** 玩家胶囊横截面直径区间（×标准弹径） */
  crossMin: 0.5,
  crossMax: 0.8,
  /** 玩家胶囊总高区间（×标准弹径） */
  hMin: 1.2,
  hMax: 1.8
} as const;

/* ============ 相机 ============ */
export const CAM_PRESETS = [
  { name: '低角斜后视', yaw: 0.30, pitch: 0.40, dist: 15.5 },
  { name: '高空俯视', yaw: 0.16, pitch: 0.95, dist: 20.0 },
  { name: '侧向平视', yaw: 1.18, pitch: 0.19, dist: 16.0 },
  { name: '环绕 · 径向朝前', yaw: 0.30, pitch: 0.42, dist: 14.2, orbit: true }
] as const;

export const CAMERA = {
  /** 垂直视场角（度）。手写透视全靠它，改大了空间感更强但边缘畸变明显 */
  fov: 55,
  /** 近裁剪：相机空间 zv 小于它就丢弃（改了会让镜头后方的物体被画出来） */
  near: 0.2,
  /** 触屏默认拉近一点，否则手机上子弹太小 */
  touchDist: 13.4,
  touchPitch: 0.46,
  touchYaw: 0.26,
} as const;

/* ============ 输入灵敏度 ============ */
export const LOOK = {
  /** 指针锁定后的鼠标灵敏度：弧度 / 像素 */
  yawSens: 0.0030,
  pitchSens: 0.0030,
  /** 单帧位移限幅（像素），防异常跳变把镜头甩飞 */
  maxStep: 160,
  /** 右键拖拽 / 触屏搓动的灵敏度 */
  dragYaw: 0.0072,
  dragPitch: 0.005,
} as const;

/* ============ 诊断 ============ */
/** 右上角只保留最近 N 条受击记录（原版是 4，扩大会挡住视野） */
export const DIAG_KEEP = 4;

/* ============ 训练场 ============ */
export const TRAINING = {
  /** 选中图案的循环间隔（秒）。太短会叠弹看不清，太长会空等 */
  loop: 2.8,
  /** 可选的弹速倍率（只作用于敌方子弹速度，不影响玩家） */
  speeds: [0.5, 1, 1.5],
  /** 默认练的那一招 */
  first: 'sweepLow',
  /** 训练场里 boss 的相对位置权重：0 = 完全不跟，1 = 正常跟随 */
  camBossWeight: 0.13
} as const;
