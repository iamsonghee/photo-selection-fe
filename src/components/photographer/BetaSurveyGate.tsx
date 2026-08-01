"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BetaSurveyModal } from "@/components/photographer/BetaSurveyModal";
import { usePhotographerModalChromeHidden } from "@/contexts/PhotographerModalContext";
import type { SurveyType } from "@/lib/beta-survey";

/**
 * /photographer/* 전 화면 공통 설문 게이트 — 대시보드 전용이던 노출 체크를 레이아웃
 * 레벨로 옮겨 페이지 이동(pathname 변화)마다 재조회한다. 예전에는 대시보드를 다시
 * 방문해야만 트리거가 재평가됐지만, 이제는 업로드/워크플로우 등 다른 작가 화면으로
 * 넘어가기만 해도 그 시점에 다시 확인한다(운영 QA에서 발견된 "완료 직후 안 뜸" 문제 대응).
 *
 * 다른 모달이 열려 있으면 이번 방문에서는 새 설문을 조회하지 않고, 다음 안전한 시점
 * (다음 페이지 이동 또는 현재 모달이 닫혀 isAnyModalOpen이 false가 되는 시점)에 재평가한다
 * — 설문을 강제로 버리지 않고 그냥 아직 조회를 시작하지 않는 것뿐이라 데이터 손실이 없다.
 * 이미 노출 중인 설문은 BetaSurveyModal 자신의 등록으로 isAnyModalOpen이 true가 되어도
 * (자기 자신이 그 이유이므로) `surveyType` 가드로 인해 재조회·중복 판단을 하지 않는다.
 */
export function BetaSurveyGate() {
  const pathname = usePathname();
  const [surveyType, setSurveyType] = useState<SurveyType | null>(null);
  const [shownThisSession, setShownThisSession] = useState(false);
  const isAnyModalOpen = usePhotographerModalChromeHidden();

  useEffect(() => {
    if (surveyType) return;
    if (shownThisSession) return;
    if (isAnyModalOpen) return;
    let cancelled = false;
    fetch("/api/photographer/beta-survey/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.surveyType) setSurveyType(data.surveyType);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname, isAnyModalOpen, surveyType, shownThisSession]);

  if (!surveyType) return null;

  return <BetaSurveyModal surveyType={surveyType} onDone={() => { setSurveyType(null); setShownThisSession(true); }} />;
}
