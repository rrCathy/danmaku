/**
 * 设备判定。模块加载时就跑一次，之后只读。
 *
 * 主输入是触摸（手机 / 平板）才走触屏布局；带触摸屏的笔记本仍按 PC 处理，
 * 否则会出现「有鼠标却弹出虚拟摇杆」的错位。
 */
const mq = (q: string): boolean => (window.matchMedia ? window.matchMedia(q).matches : false);

export const coarse = mq('(pointer: coarse)');
export const noHover = mq('(hover: none)');
export const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export const isTouch =
  /[?&]touch=1/.test(location.search) || (hasTouch && (coarse || noHover));

if (isTouch) document.body.classList.add('touch');
