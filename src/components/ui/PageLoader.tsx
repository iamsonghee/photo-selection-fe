"use client";

/**
 * 인라인 로딩 표시. 현재 호출부는 없으며 페이지·콘텐츠 로딩은 화면 배치를 닮은
 * 스켈레톤을 쓴다(design-system.md §13.1).
 *
 * 다시 사용한다면 300ms 이내 작업에서 깜빡이지 않도록 300ms 뒤에 나타난다.
 *
 * (2026-09-12) 한때 `variant="full"`로 전체 화면도 덮을 수 있었는데, 실제로는 그 용도가 전부
 * `SystemLoadingScreen`으로 옮겨가 죽은 코드였다 — 지금은 인라인 형태 하나만 남겼다.
 */
export function PageLoader({ text }: { text?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "100%", height: "100%", minHeight: 120,
        opacity: 0, animation: "pl-appear 0s linear 0.3s forwards",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        {/* 회전 아크 + 로고 */}
        <div style={{ position: "relative", width: 52, height: 52 }}>
          {/* 외부 아크 (시계 방향) */}
          <div
            style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              border: "2px solid transparent",
              borderTopColor: "var(--accent)", borderRightColor: "var(--accent)",
              animation: "pl-spin-cw 2.4s linear infinite",
            }}
          />
          {/* 내부 아크 (반시계 방향) */}
          <div
            style={{
              position: "absolute", inset: 7, borderRadius: "50%",
              border: "1.5px solid transparent",
              borderTopColor: "rgba(var(--accent-rgb), 0.4)", borderLeftColor: "rgba(var(--accent-rgb), 0.4)",
              animation: "pl-spin-ccw 1.6s linear infinite",
            }}
          />
          {/* 브랜드 로고마크 */}
          <div
            style={{
              position: "absolute", inset: 14, borderRadius: 4,
              background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "pl-pulse 2s ease-in-out infinite",
            }}
          >
            <span style={{ color: "#000", fontWeight: 900, fontSize: 10, fontFamily: "var(--font-mono)", lineHeight: 1 }}>A</span>
          </div>
        </div>

        {/* 로딩 점 3개 */}
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 4, height: 4, borderRadius: "50%",
                background: "var(--accent)",
                animation: `pl-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>

        {/* 선택적 텍스트 */}
        {text && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--subtle-foreground)", letterSpacing: "0.05em", margin: 0 }}>
            {text}
          </p>
        )}

        <style>{`
          @keyframes pl-appear   { to { opacity: 1; } }
          @keyframes pl-spin-cw  { to { transform: rotate(360deg);  } }
          @keyframes pl-spin-ccw { to { transform: rotate(-360deg); } }
          @keyframes pl-pulse    { 0%,100% { transform: scale(1); } 50% { transform: scale(0.92); } }
          @keyframes pl-dot      { 0%,100% { opacity: 0.2; transform: scale(0.8); }
                                    50%     { opacity: 1;   transform: scale(1);   } }
        `}</style>
      </div>
    </div>
  );
}
