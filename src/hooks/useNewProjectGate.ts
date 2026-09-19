"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuota } from "@/contexts/QuotaContext";
import type { PhotographerQuota } from "@/app/api/photographer/quota/route";

export type ProjectLimitInfo = {
  tier: "admin" | "beta" | "general";
  current: number;
  max: number;
  betaStatus: PhotographerQuota["betaStatus"];
  betaApplicationStatus: PhotographerQuota["betaApplicationStatus"];
};

/**
 * "새 프로젝트" 진입점(Dashboard FAB / Project List FAB / Sidebar) 3곳이 공유하는 게이트 —
 * 클릭 시점에 quota를 먼저 확인해 한도 도달이면 페이지 이동 없이 모달만 띄우고, 아니면 그대로
 * /photographer/projects/new로 이동한다(Figma #56046). quota 확인 자체가 실패하면(네트워크 등)
 * 기존처럼 이동시킨다 — 실제 차단은 /new 페이지 자체의 서버측 검증(POST 403)이 이미 담당하므로
 * 이 사전 확인은 UX 단축일 뿐 보안 경계가 아니다.
 */
export function useNewProjectGate() {
  const router = useRouter();
  const { refetch } = useQuota();
  const [limitInfo, setLimitInfo] = useState<ProjectLimitInfo | null>(null);

  const handleNewProject = useCallback(async () => {
    const data = await refetch();
    if (data?.max !== null && data?.max !== undefined && data.current >= data.max) {
      setLimitInfo({
        tier: data.tier,
        current: data.current,
        max: data.max,
        betaStatus: data.betaStatus,
        betaApplicationStatus: data.betaApplicationStatus,
      });
      return;
    }
    router.push("/photographer/projects/new");
  }, [refetch, router]);

  return { handleNewProject, limitInfo, closeLimitModal: () => setLimitInfo(null) };
}
