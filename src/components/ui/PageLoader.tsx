"use client";

type Props = {
  variant?: "full" | "inline";
  text?: string;
};

export function PageLoader({ variant = "full", text }: Props) {
  const isInline = variant === "inline";

  const content = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: isInline ? 12 : 20,
      }}
    >
      {/* 회전 아크 + 로고 */}
      <div style={{ position: "relative", width: isInline ? 52 : 72, height: isInline ? 52 : 72 }}>
        {/* 외부 아크 (시계 방향) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `2px solid transparent`,
            borderTopColor: "#FF4D00",
            borderRightColor: "#FF4D00",
            animation: "pl-spin-cw 2.4s linear infinite",
          }}
        />
        {/* 내부 아크 (반시계 방향) */}
        <div
          style={{
            position: "absolute",
            inset: isInline ? 7 : 10,
            borderRadius: "50%",
            border: `1.5px solid transparent`,
            borderTopColor: "rgba(255,77,0,0.4)",
            borderLeftColor: "rgba(255,77,0,0.4)",
            animation: "pl-spin-ccw 1.6s linear infinite",
          }}
        />
        {/* 브랜드 로고마크 */}
        <div
          style={{
            position: "absolute",
            inset: isInline ? 14 : 20,
            borderRadius: 4,
            background: "#FF4D00",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "pl-pulse 2s ease-in-out infinite",
          }}
        >
          <span
            style={{
              color: "#000",
              fontWeight: 900,
              fontSize: isInline ? 10 : 14,
              fontFamily: "'JetBrains Mono', 'Space Mono', monospace",
              lineHeight: 1,
            }}
          >
            A
          </span>
        </div>
      </div>

      {/* 로딩 점 3개 */}
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: isInline ? 4 : 5,
              height: isInline ? 4 : 5,
              borderRadius: "50%",
              background: "#FF4D00",
              animation: `pl-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      {/* 선택적 텍스트 */}
      {text && (
        <p
          style={{
            fontFamily: "'JetBrains Mono', 'Space Mono', monospace",
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          {text}
        </p>
      )}

      {/* 키프레임 */}
      <style>{`
        @keyframes pl-spin-cw  { to { transform: rotate(360deg);  } }
        @keyframes pl-spin-ccw { to { transform: rotate(-360deg); } }
        @keyframes pl-pulse    { 0%,100% { transform: scale(1); } 50% { transform: scale(0.92); } }
        @keyframes pl-dot      { 0%,100% { opacity: 0.2; transform: scale(0.8); }
                                  50%     { opacity: 1;   transform: scale(1);   } }
      `}</style>
    </div>
  );

  if (isInline) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          minHeight: 120,
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      {content}
    </div>
  );
}
