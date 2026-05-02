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
        .ed-wrap {
          position: fixed; inset: 0; z-index: 99999;
          background: #000;
          display: flex; flex-direction: column;
          align-items: center;
          font-family: 'Pretendard', sans-serif;
          overflow-y: auto;
        }
        .ed-grid-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: linear-gradient(#1a1a1a 1px, transparent 1px),
            linear-gradient(90deg, #1a1a1a 1px, transparent 1px);
          background-size: 50px 50px;
        }
        .ed-header {
          position: relative; z-index: 10;
          width: 100%; max-width: 900px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 32px 48px 0;
          flex-shrink: 0;
        }
        .ed-logo {
          display: flex; align-items: center; gap: 8px;
        }
        .ed-logo-mark {
          width: 24px; height: 24px; background: #FF4D00;
          display: flex; align-items: center; justify-content: center;
          color: #000; font-weight: 900; font-size: 12px;
        }
        .ed-logo-text {
          font-weight: 700; font-size: 22px;
          letter-spacing: -0.05em; color: #fff;
        }
        .ed-user-badge {
          font-size: 14px; color: #d1d5db;
        }
        .ed-main {
          position: relative; z-index: 10;
          width: 100%; max-width: 760px;
          padding: 48px 48px 80px;
          display: flex; flex-direction: column; align-items: center;
          flex: 1;
        }
        .ed-title-area {
          text-align: center; margin-bottom: 40px;
          display: flex; flex-direction: column; align-items: center;
        }
        .ed-kicker {
          font-size: 12px; color: #FF4D00; letter-spacing: 0.15em;
          text-transform: uppercase; margin-bottom: 20px;
          display: flex; align-items: center; gap: 8px;
        }
        .ed-title {
          font-size: clamp(28px, 5vw, 48px); font-weight: 900;
          line-height: 1.1; letter-spacing: -0.03em;
          color: #fff; margin-bottom: 14px;
        }
        .ed-subtitle {
          font-size: 17px; color: #888; font-weight: 300;
        }
        .ed-card {
          width: 100%;
          background: rgba(8,8,8,0.9);
          border: 1px solid #2a2a2a;
          padding: 40px 40px 48px;
          margin-bottom: 32px;
          position: relative;
        }
        .ed-steps {
          display: flex; justify-content: space-between;
          align-items: flex-start; gap: 0;
          width: 100%; max-width: 560px;
          margin: 0 auto;
          position: relative;
        }
        .ed-steps-line {
          position: absolute; top: 40px; left: 40px; right: 40px;
          height: 1px; background: #2a2a2a; z-index: 1;
        }
        .ed-step {
          display: flex; flex-direction: column;
          align-items: center; gap: 14px;
          position: relative; z-index: 2;
        }
        .ed-step-icon {
          width: 80px; height: 80px;
          background: #080808; border: 1px solid #2a2a2a;
          display: flex; align-items: center; justify-content: center;
          color: #888;
        }
        .ed-step-label {
          text-align: center;
        }
        .ed-step-num {
          font-size: 9px; color: #555; letter-spacing: 0.1em;
          margin-bottom: 4px;
        }
        .ed-step-name {
          font-size: 12px; font-weight: 700; color: #fff;
        }
        .ed-btn-primary {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          background: #FF4D00; border: none; cursor: pointer;
          padding: 18px 48px; color: #000;
          font-weight: 700; font-size: 17px;
          letter-spacing: -0.01em; width: 100%; max-width: 360px;
          transition: all 0.25s ease;
        }
        .ed-btn-primary:hover {
          background: #ff5e1a;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(255,77,0,0.25);
        }
        .ed-btn-primary:active { transform: translateY(0); }
        .ed-free-note {
          font-size: 12px; color: #555;
          display: flex; align-items: center; gap: 6px;
          margin-top: 14px; text-align: center;
        }

        /* 모바일 */
        @media (max-width: 600px) {
          .ed-header { padding: 20px 20px 0; }
          .ed-user-badge { display: none; }
          .ed-main { padding: 32px 20px 60px; }
          .ed-title-area { margin-bottom: 28px; }
          .ed-kicker { display: none; }
          .ed-card { padding: 28px 20px 36px; margin-bottom: 24px; }
          .ed-steps {
            flex-direction: column; align-items: center;
            gap: 24px; max-width: 240px;
          }
          .ed-steps-line { display: none; }
          .ed-step { flex-direction: row; gap: 16px; width: 100%; }
          .ed-step-icon { width: 52px; height: 52px; flex-shrink: 0; }
          .ed-step-label { text-align: left; }
          .ed-step-num { margin-bottom: 2px; }
          .ed-step-name { font-size: 13px; }
          .ed-btn-primary { padding: 16px 32px; font-size: 16px; max-width: 100%; }
        }
      `}</style>

      <div className="ed-wrap">
        <div className="ed-grid-bg" />

        {/* 헤더 */}
        <header className="ed-header">
          <div className="ed-logo">
            <div className="ed-logo-mark">A</div>
            <span className="ed-logo-text">A-Cut<span style={{ color: "#FF4D00" }}>.</span></span>
          </div>
          <span className="ed-user-badge">
            안녕하세요, <strong style={{ color: "#fff" }}>{userName} 작가님</strong>
          </span>
        </header>

        {/* 메인 */}
        <main className="ed-main">
          <div className="ed-title-area">
            <div className="ed-kicker">
              <div style={{ width: 12, height: 1, background: "#FF4D00" }} />
              시작하기
              <div style={{ width: 12, height: 1, background: "#FF4D00" }} />
            </div>
            <h1 className="ed-title">첫 프로젝트를<br />만들어보세요</h1>
            <p className="ed-subtitle">3분이면 고객에게 사진을 보낼 수 있습니다</p>
          </div>

          <div className="ed-card">
            <div className="ed-steps">
              <div className="ed-steps-line" />
              {[
                {
                  num: "01", label: "프로젝트 만들기",
                  icon: (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                  ),
                },
                {
                  num: "02", label: "사진 업로드",
                  icon: (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  ),
                },
                {
                  num: "03", label: "링크 공유",
                  icon: (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  ),
                },
              ].map((step) => (
                <div key={step.num} className="ed-step">
                  <div className="ed-step-icon">{step.icon}</div>
                  <div className="ed-step-label">
                    <div className="ed-step-num">{step.num}</div>
                    <div className="ed-step-name">{step.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button type="button" className="ed-btn-primary" onClick={onCreateProject}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            새 프로젝트 만들기
          </button>
          <div className="ed-free-note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF4D00" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            프로젝트 10개, 사진 1,500장까지 베타 기간 무료
          </div>
        </main>
      </div>
    </>
  );
}
