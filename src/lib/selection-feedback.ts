export type SelectionHapticKind = "change" | "limit";

export function triggerSelectionHaptic(kind: SelectionHapticKind = "change") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(kind === "limit" ? [18, 40, 18] : 10);
  } catch {
    // 진동 API 미지원·차단 환경에서는 시각적 피드백만 유지한다.
  }
}
