"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";

export interface PhotographerQuota {
  tier: "admin" | "beta" | "general";
  current: number;
  max: number | null;
}

/**
 * 로그인 작가의 현재 프로젝트 사용량(`/api/photographer/quota`).
 * 기존에 projects/page.tsx, dashboard/page.tsx 등 여러 곳에서 개별 fetch하던 것과 같은 엔드포인트 —
 * LNB Usage Indicator 전용으로 새로 추가. 기존 call site는 이번 작업 범위 밖이라 건드리지 않는다.
 */
export function usePhotographerQuota(): PhotographerQuota | null {
  const { profile } = useProfile();
  const [quota, setQuota] = useState<PhotographerQuota | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    fetch("/api/photographer/quota")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setQuota(data);
      })
      .catch(() => {
        if (!cancelled) setQuota(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  return quota;
}
