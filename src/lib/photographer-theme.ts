/**
 * 작가 영역 UI 팔레트 — `/auth`, `/about`과 동일 계열(Vantablack + 브랜드 블루).
 * 기능 로직과 무관한 표현용 상수만 모음.
 */
export const PHOTOGRAPHER_THEME = {
  ink: "#050505",
  surface: "rgba(24, 24, 27, 0.78)",
  surface2: "rgba(39, 39, 42, 0.55)",
  surface3: "rgba(63, 63, 70, 0.45)",
  steel: "#4f7eff",
  steelLt: "#7ea3ff",
  border: "rgba(255, 255, 255, 0.08)",
  borderMd: "rgba(255, 255, 255, 0.14)",
  /** 큰 레이아웃 구분 — 눈에 띄는 1px 줄을 줄일 때 */
  hairline: "rgba(255, 255, 255, 0.045)",
  text: "#fafafa",
  muted: "#a1a1aa",
  dim: "#71717a",
  green: "#2ed573",
  greenDim: "#0f2a1e",
  orange: "#f5a623",
  orangeDim: "#2a1a08",
  red: "#ff4757",
  redDim: "#2a0f12",
  kakao: "#FEE500",
  navyDim: "#0a0a0b",
  topbarBg: "rgba(10, 10, 11, 0.92)",
  modalScrim: "rgba(9, 9, 11, 0.94)",
} as const;

/** 상·하단 고정 바: 흰 실선 대신 짧은 그림자만 */
export const photographerDock = {
  bottomEdge: { borderBottom: "none", boxShadow: "0 1px 0 rgba(0, 0, 0, 0.55)" } as const,
  topEdge: { borderTop: "none", boxShadow: "0 -1px 0 rgba(0, 0, 0, 0.45)" } as const,
};

export const PS_FONT = "'Pretendard', system-ui, sans-serif";
export const PS_DISPLAY = "'Space Grotesk', 'Pretendard', sans-serif";
