"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, X } from "lucide-react";
import type { PhotographerProfile } from "@/app/api/photographer/profile/route";

function dismissKey(profileId: string) {
  return `acut:profile-banner-dismissed:${profileId}`;
}

/** 프로필(이름·소개·사진) 중 하나라도 비어있으면 대시보드에 노출한다.
 * 닫기는 이 세션 동안만 숨긴다 — 다음 로그인에도 여전히 비어있으면 다시 보여준다
 * (완전히 껐다 켜는 설정 없이, 배민 배너처럼 계속 상기시키되 강제하지 않는 방식). */
export function ProfileCompletionBanner({ profile }: { profile: PhotographerProfile | null }) {
  const [dismissed, setDismissed] = useState(false);

  // sessionStorage는 클라이언트 전용이라 SSR/첫 렌더에서 바로 읽으면 안 된다(하이드레이션
  // 불일치 방지 관례 — mock-store.tsx 등 기존 코드와 동일 패턴). 마운트 후에만 확인한다.
  useEffect(() => {
    if (!profile) return;
    try {
      // 마운트 후 한 번만 클라이언트 전용 storage를 읽어 초기 상태를 갈아 끼우는 의도된
      // 패턴이라 이 줄에서만 set-state-in-effect 경고를 끈다(다른 코드의 관례와 동일).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (sessionStorage.getItem(dismissKey(profile.id)) === "1") setDismissed(true);
    } catch {
      /* 저장소 접근 불가 — 매번 노출되는 것으로 폴백 */
    }
  }, [profile]);

  if (!profile || dismissed) return null;
  const isComplete = !!profile.name?.trim() && !!profile.bio?.trim() && !!profile.profileImageUrl;
  if (isComplete) return null;

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(dismissKey(profile!.id), "1");
    } catch {
      /* 저장소 접근 불가 — 이번 렌더에서만 닫힘 */
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <Info size={16} className="shrink-0 mt-0.5 text-accent" />
      <div className="flex-1">
        <div className="text-sm font-bold text-foreground">프로필이 비어있어요</div>
        <div className="mt-1 text-sm text-muted-foreground leading-relaxed">
          고객이 초대 링크를 열면 이름·소개·사진 없이 &ldquo;담당 작가&rdquo;로만 표시돼요. 채워두면 신뢰도가 올라가요.
        </div>
        <Link
          href="/photographer/settings"
          className="mt-2 inline-block text-sm font-semibold text-accent hover:underline"
        >
          프로필 완성하기 →
        </Link>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="닫기"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X size={16} />
      </button>
    </div>
  );
}
