// Add a module only after its working view and execution path are connected.
// Registry entries describe available work; they do not create scheduled jobs.
export const AUTOMATIONS = Object.freeze([
  Object.freeze({ id: 'marketing', title: '마케팅 실적 수집', description: 'Instagram과 Threads의 게시물 실적을 매장별로 모읍니다.', schedule: '기준 일정: 매월 1일 낮 12시', target: 'marketing-workspace', focusTarget: 'collectStore', action: '수집 작업 열기' }),
]);
