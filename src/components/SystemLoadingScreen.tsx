"use client";

/**
 * 전체 화면 로딩 표시 — 고객·작가 화면이 공유하는 **단일** 진행 상태 컴포넌트.
 *
 * 예전에는 화면마다 로딩 표시가 달랐다: 이 컴포넌트 자체에 `light`/`dark` 두 버전이 있었고
 * (실제로는 전 호출부가 `variant="light"`만 써서 `dark` 버전은 죽은 코드였다), 작가 화면 중
 * 일부는 완전히 다른 컴포넌트(`PageLoader` — 이중 회전 아크 스피너)를, 또 일부는 스켈레톤
 * 그리드를, 심지어 어떤 화면은 회전 표시조차 없는 평문 "SYS.LOADING…" 텍스트를 화면 중간
 * 어딘가(중앙정렬 아님)에 띄웠다. 같은 "페이지를 불러오는 중"인데 화면마다 모양도 위치도
 * 달라 보였다(2026-09-12 통일).
 *
 * 이제 전체 화면 로딩은 이 컴포넌트 하나뿐이다:
 * - `position:fixed; inset:0; display:grid; place-items:center`로 뷰포트 정중앙에 고정한다.
 * - 배경은 흰색으로 고정한다 — 로딩을 보여주는 화면은 전부 라이트 화면(고객 전체, 작가
 *   대시보드/목록/설정/업로드/자산)이다. 다크로 남아 있는 화면(작가 워크플로우 등)은 아직
 *   전체가 다크 워크스페이스 스타일이라 이 컴포넌트를 쓰지 않는다 — 그 화면들이 라이트로
 *   전환되면 그때 같이 이 컴포넌트를 쓰면 된다(별도 톤 분기를 다시 만들 필요는 없다. 다크
 *   화면 자체가 없어지는 방향이 맞다).
 * - 문구는 기본값(`페이지를 준비하고 있어요` / `잠시만 기다려 주세요`)이 있고, 맥락이 필요한
 *   화면(예: "프로젝트 불러오는 중")은 `title`/`description`으로 바꿔 쓴다 — 레이아웃과 애니
 *   메이션은 항상 같고 문구만 다르다.
 */
export function SystemLoadingScreen({
  title = "페이지를 준비하고 있어요",
  description = "잠시만 기다려 주세요",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="sls-root" role="status" aria-live="polite" aria-label={title}>
      <style>{`
        @keyframes sls-mark {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(.94); }
        }
        @keyframes sls-progress {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(280%); }
        }
        .sls-root {
          position: fixed; inset: 0; z-index: 9999;
          min-height: 100dvh; padding: env(safe-area-inset-top) 24px env(safe-area-inset-bottom);
          display: grid; place-items: center; overflow: hidden;
          background: #fff; color: #191918;
          font-family: Pretendard, 'Noto Sans KR', sans-serif;
        }
        .sls-content { width: 100%; max-width: 280px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .sls-mark {
          width: 48px; height: 48px; border-radius: 12px;
          display: grid; place-items: center;
          background: #ff4d00; color: #fff;
          font-family: 'Space Grotesk', sans-serif; font-size: 25px; line-height: 1; font-weight: 900;
          animation: sls-mark 1.8s ease-in-out infinite;
        }
        .sls-title { margin: 22px 0 0; font-size: 16px; line-height: 24px; font-weight: 700; letter-spacing: -.4px; }
        .sls-description { margin: 5px 0 0; color: #838b94; font-size: 12px; line-height: 19px; }
        .sls-track { width: 112px; height: 3px; margin-top: 24px; border-radius: 999px; overflow: hidden; background: #eef0f2; }
        .sls-progress { width: 36px; height: 100%; border-radius: inherit; background: #ff4d00; animation: sls-progress 1.25s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .sls-mark { animation: none; }
          .sls-progress { width: 100%; animation: none; opacity: .7; }
        }
      `}</style>
      <div className="sls-content">
        <div className="sls-mark" aria-hidden>A</div>
        <p className="sls-title">{title}</p>
        <p className="sls-description">{description}</p>
        <div className="sls-track" aria-hidden><div className="sls-progress" /></div>
      </div>
    </div>
  );
}
