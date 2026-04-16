"use client";

export default function EmptyDashboard({
  userName,
  onCreateProject,
}: {
  userName: string;
  onCreateProject: () => void;
}) {
  return (
    <>
      <style>{`
        @keyframes ed-scanline {
          0%   { bottom: 100%; }
          100% { bottom: -150px; }
        }
        @keyframes ed-flow {
          0%   { left: 10%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { left: 90%; opacity: 0; }
        }
        .ed-btn-primary {
          background-color: #FF4D00;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          overflow: hidden;
        }
        .ed-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 30px rgba(255,77,0,0.3);
          background-color: #ff5e1a;
        }
        .ed-btn-primary:active { transform: translateY(1px); }
        .ed-dashed:hover {
          background-image:
            repeating-linear-gradient(0deg,#FF4D00,#FF4D00 8px,transparent 8px,transparent 16px,#FF4D00 16px),
            repeating-linear-gradient(90deg,#FF4D00,#FF4D00 8px,transparent 8px,transparent 16px,#FF4D00 16px),
            repeating-linear-gradient(180deg,#FF4D00,#FF4D00 8px,transparent 8px,transparent 16px,#FF4D00 16px),
            repeating-linear-gradient(270deg,#FF4D00,#FF4D00 8px,transparent 8px,transparent 16px,#FF4D00 16px);
          box-shadow: inset 0 0 40px rgba(255,77,0,0.05);
        }
        .ed-dashed:hover .ed-hud { border-color: #FF4D00; }
        .ed-dashed:hover .ed-step-node { border-color: #555; }
      `}</style>

      {/* 풀스크린 컨테이너 */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "#000000",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Pretendard', sans-serif",
        overflow: "hidden",
      }}>

        {/* 그리드 배경 */}
        <div style={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(#222 1px, transparent 1px), linear-gradient(90deg, #222 1px, transparent 1px)",
          backgroundSize: "50px 50px",
          backgroundPosition: "center center",
        }} />

        {/* 스캔라인 */}
        <div style={{
          position: "fixed", left: 0, right: 0, height: 150, zIndex: 1, pointerEvents: "none",
          background: "linear-gradient(0deg, rgba(255,77,0,0.03) 0%, rgba(255,77,0,0) 100%)",
          bottom: "100%",
          animation: "ed-scanline 8s linear infinite",
        }} />

        {/* 코너 브래킷 */}
        {[
          { top: 24, left: 24, borderTop: "2px solid #FF4D00", borderLeft: "2px solid #FF4D00" },
          { top: 24, right: 24, borderTop: "2px solid #FF4D00", borderRight: "2px solid #FF4D00" },
          { bottom: 24, left: 24, borderBottom: "2px solid #FF4D00", borderLeft: "2px solid #FF4D00" },
          { bottom: 24, right: 24, borderBottom: "2px solid #FF4D00", borderRight: "2px solid #FF4D00" },
        ].map((s, i) => (
          <div key={i} style={{ position: "fixed", width: 24, height: 24, zIndex: 50, pointerEvents: "none", ...s }} />
        ))}

        {/* 상단 헤더 */}
        <header style={{
          position: "fixed", top: 48, left: 48, right: 48, zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {/* 로고 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, background: "#FF4D00",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#000", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 12,
            }}>A</div>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
              fontSize: 24, letterSpacing: "-0.05em", textTransform: "uppercase", color: "#fff",
            }}>
              A-Cut<span style={{ color: "#FF4D00" }}>.</span>
            </span>
          </div>

          {/* 세션 + 사용자 */}
          <div style={{
            display: "flex", alignItems: "center", gap: 24,
            background: "#050505", border: "1px solid #222",
            padding: "8px 16px",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10,
              color: "#22c55e", letterSpacing: "0.2em", textTransform: "uppercase",
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
                boxShadow: "0 0 5px #22c55e",
                animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
              }} />
              SYS.USER_SESSION_ACTIVE
            </div>
            <div style={{ width: 1, height: 16, background: "#333" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 4, background: "#111",
                border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center",
                color: "#777",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <span style={{ fontSize: 14, color: "#d1d5db" }}>
                안녕하세요, <strong style={{ color: "#fff" }}>{userName} 작가님</strong>
              </span>
            </div>
          </div>
        </header>

        {/* 메인 콘텐츠 */}
        <main style={{
          position: "relative", zIndex: 10,
          width: "100%", maxWidth: 1000,
          padding: "0 32px",
          display: "flex", flexDirection: "column", alignItems: "center",
          marginTop: 48,
        }}>

          {/* 타이틀 */}
          <div style={{ textAlign: "center", marginBottom: 40, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10,
              color: "#FF4D00", letterSpacing: "0.2em", textTransform: "uppercase",
              marginBottom: 24,
            }}>
              <div style={{ width: 12, height: 1, background: "#FF4D00" }} />
              CMD :: INIT_WORKSPACE
              <div style={{ width: 12, height: 1, background: "#FF4D00" }} />
            </div>
            <h1 style={{
              fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, lineHeight: 1.1,
              letterSpacing: "-0.03em", marginBottom: 16, color: "#fff",
            }}>
              첫 프로젝트를 만들어보세요
            </h1>
            <p style={{ fontSize: 20, color: "#888", fontWeight: 300 }}>
              3분이면 고객에게 사진을 보낼 수 있습니다
            </p>
          </div>

          {/* 대시 보더 카드 */}
          <div className="ed-dashed" style={{
            width: "100%",
            background: "rgba(8,8,8,0.8)",
            backdropFilter: "blur(10px)",
            backgroundImage: [
              "repeating-linear-gradient(0deg,#333,#333 8px,transparent 8px,transparent 16px,#333 16px)",
              "repeating-linear-gradient(90deg,#333,#333 8px,transparent 8px,transparent 16px,#333 16px)",
              "repeating-linear-gradient(180deg,#333,#333 8px,transparent 8px,transparent 16px,#333 16px)",
              "repeating-linear-gradient(270deg,#333,#333 8px,transparent 8px,transparent 16px,#333 16px)",
            ].join(","),
            backgroundSize: "2px 100%, 100% 2px, 2px 100%, 100% 2px",
            backgroundPosition: "0 0, 0 0, 100% 0, 0 100%",
            backgroundRepeat: "no-repeat",
            transition: "all 0.4s ease",
            position: "relative",
            padding: "48px",
            display: "flex", flexDirection: "column", alignItems: "center",
            marginBottom: 48,
          }}>
            {/* HUD 코너 크로스헤어 */}
            {[
              { top: -1, left: -1, borderTop: "2px solid", borderLeft: "2px solid" },
              { top: -1, right: -1, borderTop: "2px solid", borderRight: "2px solid" },
              { bottom: -1, left: -1, borderBottom: "2px solid", borderLeft: "2px solid" },
              { bottom: -1, right: -1, borderBottom: "2px solid", borderRight: "2px solid" },
            ].map((s, i) => (
              <div key={i} className="ed-hud" style={{
                position: "absolute", width: 10, height: 10,
                borderColor: "#555", transition: "border-color 0.4s ease", ...s,
              }} />
            ))}

            {/* 상단 뱃지 */}
            <div style={{
              position: "absolute", top: 0, left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#000", padding: "4px 16px",
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10,
              color: "#FF4D00", letterSpacing: "0.2em",
              border: "1px solid #333",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              NO_PROJECTS_FOUND
            </div>

            {/* 3단계 플로우 */}
            <div style={{
              width: "100%", maxWidth: 700, position: "relative",
              marginTop: 24, marginBottom: 32, paddingTop: 32, paddingBottom: 32,
            }}>
              {/* 연결선 */}
              <div style={{
                position: "absolute", top: "50%", left: 0, right: 0,
                height: 1, background: "#333", zIndex: 1,
                transform: "translateY(-50%)",
              }} />
              {/* 흐르는 점 */}
              <div style={{
                width: 4, height: 4, background: "#FF4D00",
                position: "absolute", top: "50%",
                transform: "translateY(-50%)",
                animation: "ed-flow 2s linear infinite",
                boxShadow: "0 0 8px #FF4D00",
                zIndex: 2,
              }} />

              <div style={{
                display: "flex", justifyContent: "space-between",
                position: "relative", zIndex: 10,
                width: "100%", paddingLeft: 32, paddingRight: 32,
              }}>
                {[
                  {
                    num: "01", label: "프로젝트 만들기", sub: "SYS.CREATE",
                    icon: (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    ),
                  },
                  {
                    num: "02", label: "사진 업로드", sub: "SYS.UPLOAD",
                    icon: (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    ),
                  },
                  {
                    num: "03", label: "링크 공유", sub: "SYS.SHARE",
                    icon: (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    ),
                  },
                ].map((step) => (
                  <div key={step.num} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                    <div className="ed-step-node" style={{
                      position: "relative", zIndex: 10,
                      width: 80, height: 80,
                      background: "#000", border: "1px solid #333",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#888", transition: "all 0.3s ease",
                    }}>
                      <span style={{
                        position: "absolute", top: 8, left: 8,
                        fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 8, color: "#555",
                      }}>{step.num}</span>
                      {step.icon}
                    </div>
                    <div style={{ textAlign: "center", fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", textTransform: "uppercase" }}>
                      <div style={{ fontSize: 11, color: "#fff", fontWeight: 700, marginBottom: 4 }}>{step.label}</div>
                      <div style={{ fontSize: 9, color: "#666", letterSpacing: "0.2em" }}>{step.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 하단 대기 텍스트 */}
            <div style={{
              position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10, color: "#555",
              letterSpacing: "0.2em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
            }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#555" }} />
              AWAITING_INITIALIZATION...
            </div>
          </div>

          {/* CTA */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <button
              type="button"
              className="ed-btn-primary"
              onClick={onCreateProject}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                padding: "20px 48px", color: "#000",
                fontWeight: 700, fontSize: 19, textTransform: "uppercase",
                letterSpacing: "-0.02em", minWidth: 340,
                border: "none", cursor: "pointer",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              새 프로젝트 만들기
            </button>
            <div style={{
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "#666",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF4D00" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              프로젝트 10개, 사진 1,500장까지 베타 기간 무료
            </div>
          </div>
        </main>

        {/* 하단 좌 */}
        <div style={{
          position: "fixed", bottom: 48, left: 48, zIndex: 50,
          display: "flex", flexDirection: "column", alignItems: "flex-start",
          fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 9, color: "#555",
          letterSpacing: "0.2em", textTransform: "uppercase", gap: 4,
        }}>
          <span>V.1.0.5-BETA</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 4, height: 4, background: "#22c55e" }} />
            SECURE_CONNECTION
          </span>
        </div>

        {/* 하단 우 */}
        <div style={{
          position: "fixed", bottom: 48, right: 48, zIndex: 50,
          display: "flex", alignItems: "center", gap: 24,
        }}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "flex-end",
            fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 9, color: "#555",
            letterSpacing: "0.2em", textTransform: "uppercase", gap: 4,
          }}>
            <span>Buffer_status: optimal</span>
            <span>Stream_id: ONBOARDING_INIT</span>
          </div>
          <div style={{
            width: 40, height: 40, border: "1px solid #333",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "#050505",
          }}>
            <div style={{
              width: 8, height: 8, background: "#FF4D00",
              animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
            }} />
          </div>
        </div>

      </div>
    </>
  );
}
