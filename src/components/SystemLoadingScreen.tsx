"use client";

import Link from "next/link";

/**
 * 전체 화면 로딩 표시 — `position:fixed; inset:0` 흰 오버레이에 로고 마크와 진행 띠.
 *
 * (2026-10-06) 일반 로딩에는 더 이상 쓰지 않는다. 라우트 로딩(`loading.tsx`)과 화면 안 데이터 로딩은
 * 실제 배치를 닮은 골격(`PhotographerPageSkeleton`, `ProjectBodySkeleton`, `customer-select/(list)/loading.tsx`)이
 * 맡고, 이미 그려진 헤더·셸은 덮지 않는다(design-system.md §13.1 "장식적 부팅 화면은 route loading에서
 * 쓰지 않는다"). 남은 사용처는 작가 고객 페이지(`/c/[token]/**`)의 화면 안 로딩뿐이며, 그 흐름의
 * 전체 새로고침 이동을 없애는 작업과 함께 골격으로 바꿀 예정이다.
 *
 * 역사: 2026-09-12에 화면마다 달랐던 로딩 표시(`PageLoader` 전체 화면 변형, 스켈레톤 그리드, 평문
 * "SYS.LOADING…")를 이 컴포넌트 하나로 통일했고, 이후 "전체 화면을 덮는 것 자체"가 전환 깜빡임의
 * 원인이 되어 골격 방식으로 옮겼다.
 * - 배경은 흰색 고정, 문구는 `title`/`description`, `homeHref`가 있으면 로고 마크가 그 주소로 간다.
 */
export function SystemLoadingScreen({
  title = "페이지를 준비하고 있어요",
  description = "잠시만 기다려 주세요",
  homeHref,
}: {
  title?: string;
  description?: string;
  homeHref?: string;
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
          font-family: var(--font-sans);
        }
        .sls-content { width: 100%; max-width: 280px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .sls-mark {
          width: 48px; height: 48px; border-radius: 12px;
          display: grid; place-items: center;
          background: #ff4d00; color: #fff;
          font-family: 'Space Grotesk', sans-serif; font-size: 25px; line-height: 1; font-weight: 900;
          animation: sls-mark 1.8s ease-in-out infinite;
        }
        .sls-home { border-radius: 13px; text-decoration: none; }
        .sls-home:focus-visible { outline: 2px solid #ff4d00; outline-offset: 3px; }
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
        {homeHref ? (
          <Link href={homeHref} className="sls-home" aria-label="메인페이지로 이동">
            <div className="sls-mark" aria-hidden>A</div>
          </Link>
        ) : <div className="sls-mark" aria-hidden>A</div>}
        <p className="sls-title">{title}</p>
        <p className="sls-description">{description}</p>
        <div className="sls-track" aria-hidden><div className="sls-progress" /></div>
      </div>
    </div>
  );
}
