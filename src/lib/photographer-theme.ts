/**
 * 작가 영역 UI 팔레트 — `/auth`, `/about`과 동일 계열(Vantablack + 브랜드 블루).
 * 기능 로직과 무관한 표현용 상수만 모음.
 */
export const PHOTOGRAPHER_THEME = {
  ink: "var(--background)",
  surface: "var(--surface)",
  surface2: "var(--surface)",
  surface3: "var(--surface-raised)",
  steel: "var(--primary)",
  steelLt: "#7ea3ff",
  border: "var(--border)",
  borderMd: "var(--border-strong)",
  /** 큰 레이아웃 구분 — 눈에 띄는 1px 줄을 줄일 때 */
  hairline: "var(--border-subtle)",
  text: "var(--foreground)",
  muted: "var(--muted-foreground)",
  dim: "var(--subtle-foreground)",
  green: "var(--success)",
  greenDim: "#0f2a1e",
  orange: "var(--warning)",
  orangeDim: "#2a1a08",
  red: "var(--danger)",
  redDim: "#2a0f12",
  kakao: "var(--kakao-bg)",
  navyDim: "var(--background)",
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
