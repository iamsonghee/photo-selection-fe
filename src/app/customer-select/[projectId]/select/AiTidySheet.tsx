"use client";

import { useState } from "react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { Sheet } from "./Sheets";
import s from "./select.module.css";

export type AiTidyKind = "similarity" | "quality";

/** "비슷한 사진 묶기"를 끈 사람은 고르기 화면을 묶지 않은 상태로 시작한다(기기별 보기 설정). */
export const groupSimilarKey = (projectId: string) => `ps:self-select-group-similar:${projectId}`;

export function rememberGroupSimilar(projectId: string, on: boolean) {
  try { localStorage.setItem(groupSimilarKey(projectId), on ? "1" : "0"); } catch {}
}

/** "흔들림·눈 감음 사진 뒤로 빼기"를 켜고 정리한 사람은 고르기 화면을 의심 사진을 뺀 채로 시작한다(기기별 보기 설정). */
export const setAsideKey = (projectId: string) => `ps:self-select-set-aside:${projectId}`;

/**
 * AI 정리 시작 확인. "할지·언제 할지"는 사용자가 정하고, 시작하기로 한 뒤에만 세부 항목을 보여준다.
 * 대부분은 기본값 그대로 `정리 시작` 한 번이면 된다. 장면 나누기는 이 서비스의 핵심이라 항상 켠다.
 */
export function AiTidySheet({ projectId, photoCount, pending, error, onStart, onClose }: {
  projectId: string;
  photoCount: number;
  pending: boolean;
  error: string | null;
  onStart: (kinds: AiTidyKind[]) => void;
  onClose: () => void;
}) {
  const [similar, setSimilar] = useState(true);
  const [quality, setQuality] = useState(true);
  // ponytail: 장면 정리 전용 엔진이 아직 없어 장면은 유사컷 분석 요청으로 시작한다. 엔진이 생기면 별도 kind로 나눈다.
  const kinds: AiTidyKind[] = ["similarity", ...(quality ? ["quality" as const] : [])];

  return (
    <Sheet title="AI로 사진 정리" onClose={onClose}>
      <p>{photoCount.toLocaleString()}장을 정리해요. 사진 수에 따라 몇 분 걸릴 수 있고, 그동안에도 사진을 고를 수 있어요.</p>
      <div className={s.tidyOptions}>
        <label className={s.tidyOption}>
          <input type="checkbox" checked disabled />
          <span><strong>장면별로 나누기</strong><small>촬영 흐름에 맞춰 장면으로 나누고 이름을 붙여요</small></span>
          <em>기본</em>
        </label>
        <label className={s.tidyOption}>
          <input type="checkbox" checked={similar} onChange={(event) => setSimilar(event.target.checked)} />
          <span><strong>비슷한 사진 묶기</strong><small>연달아 찍은 비슷한 사진을 한 묶음으로 보여줘요</small></span>
        </label>
        <label className={s.tidyOption}>
          <input type="checkbox" checked={quality} onChange={(event) => setQuality(event.target.checked)} />
          <span><strong>흔들림·눈 감음 사진 뒤로 빼기</strong><small>의심 사진은 갤러리에서 빼고 묶음에서는 맨 뒤로 보내요. 지우지 않고 언제든 다시 볼 수 있어요</small></span>
        </label>
      </div>
      {error && <p className={s.tidyError} role="alert">{error}</p>}
      <PhotographerLightButton size="confirmation" pending={pending} pendingLabel="시작하는 중…" onClick={() => {
        rememberGroupSimilar(projectId, similar);
        try { localStorage.setItem(setAsideKey(projectId), quality ? "1" : "0"); } catch {}
        onStart(kinds);
      }}>정리 시작</PhotographerLightButton>
    </Sheet>
  );
}
