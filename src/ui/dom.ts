/** DOM 引用集中在这里，模块加载即取（script 在 body 末尾，元素一定已存在）。 */

function must(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error('缺少 DOM 节点 #' + id);
  return e;
}

export const el = {
  hpPfill: must('hpPfill'),
  hpPtxt: must('hpPtxt'),
  hpBfill: must('hpBfill'),
  hpBtxt: must('hpBtxt'),
  timer: must('timer'),
  phaseTag: must('phaseTag'),
  diagList: must('diagList'),
  camName: must('camName'),
  toast: must('toast'),
  lookHint: document.getElementById('lookHint'),
  startOverlay: must('startOverlay'),
  endOverlay: must('endOverlay'),
  pauseOverlay: must('pauseOverlay'),
  pauseCard: must('pauseCard'),
  trainPick: must('trainPick'),
  helpOverlay: must('helpOverlay'),
  endKicker: must('endKicker'),
  endTitle: must('endTitle'),
  endLead: must('endLead'),
  endStats: must('endStats')
};

export const camSubEl = document.getElementById('camSub');
