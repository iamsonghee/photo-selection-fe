"use client";

import { useState } from "react";
import { customerSceneCatalog, customerSceneGapSeconds } from "@/lib/customer-shoot-scenes";
import { MIN_PHOTOS_FOR_SCENES } from "@/lib/customer-scenes";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { Sheet } from "./Sheets";
import s from "./select.module.css";

export type AiTidyKind = "scene" | "similarity" | "quality";

const TIDY_LABELS: Record<AiTidyKind, string> = { scene: "장면 나누기", similarity: "비슷한 사진 묶기", quality: "흔들림·눈 감음 확인" };

/**
 * AI 정리 시작. 장면 정리에는 촬영 종류의 장면 이름 목록을 함께 보낸다. 각 작업은 따로 돌고 따로 끝난다.
 * 반환: 시작한(또는 이미 진행 중인 — 409) 작업, 시작하지 못한 작업에 대한 안내(모두 시작했으면 null).
 * 일부만 실패해도 안내한다 — 다시 누르면 진행 중인 작업은 409로 넘어가고 실패한 작업만 다시 시작된다.
 */
export async function startAiTidy(projectId: string, kinds: AiTidyKind[], shootType: string): Promise<{ started: AiTidyKind[]; error: string | null }> {
  const responses = await Promise.all(kinds.map((kind) => fetch(`/api/customer-select/projects/${projectId}/ai/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kind === "scene" ? { sceneNames: customerSceneCatalog(shootType), sceneGapSeconds: customerSceneGapSeconds(shootType) } : {}),
  }).catch(() => null)));
  const started = kinds.filter((_, index) => responses[index]?.ok || responses[index]?.status === 409);
  const failed = kinds.filter((kind) => !started.includes(kind));
  if (!failed.length) return { started, error: null };
  return {
    started,
    error: `${failed.map((kind) => TIDY_LABELS[kind]).join(", ")}을(를) 시작하지 못했어요.${started.length ? " 나머지는 진행 중이에요." : ""} 잠시 후 다시 시도해 주세요.`,
  };
}

/** "비슷한 사진 묶기"를 끈 사람은 고르기 화면을 묶지 않은 상태로 시작한다(기기별 보기 설정). */
export const groupSimilarKey = (projectId: string) => `ps:self-select-group-similar:${projectId}`;

export function rememberGroupSimilar(projectId: string, on: boolean) {
  try { localStorage.setItem(groupSimilarKey(projectId), on ? "1" : "0"); } catch {}
}

/** "흔들림·눈 감음 확인"을 켜고 정리한 사람은 고르기 화면을 흔들림 사진을 뺀 채로 시작한다(기기별 보기 설정). */
export const setAsideKey = (projectId: string) => `ps:self-select-set-aside:${projectId}`;

/**
 * AI 정리 시작 확인. "할지·언제 할지"는 사용자가 정하고, 시작하기로 한 뒤에만 세부 항목을 보여준다.
 * 대부분은 기본값 그대로 `정리 시작` 한 번이면 된다. 장면 나누기는 이 서비스의 핵심이라 항상 켠다.
 */
export function AiTidySheet({ projectId, photoCount, rerun, pending, error, onStart, onClose }: {
  projectId: string;
  photoCount: number;
  /** 이미 정리한 프로젝트를 다시 정리 — 고른 결과가 초기화될까 걱정하지 않게 유지된다고 밝힌다. */
  rerun?: boolean;
  pending: boolean;
  error: string | null;
  onStart: (kinds: AiTidyKind[]) => void;
  onClose: () => void;
}) {
  const [similar, setSimilar] = useState(true);
  const [quality, setQuality] = useState(true);
  // 끈 항목은 실행하지 않는다(유사컷을 끄면 전체 사진 임베딩도 하지 않음).
  // 사진이 적으면 장면을 나누지 않는다(골라낸 사진만 올리면 시간 간격으로 장소 경계를 못 찾음). 장면 실행은 그대로 보내
  // 정리 상태 흐름을 바꾸지 않는다 — clip-service가 장면 없이 바로 끝내고 Gemini도 부르지 않는다.
  const fewPhotos = photoCount < MIN_PHOTOS_FOR_SCENES;
  const kinds: AiTidyKind[] = ["scene", ...(similar ? ["similarity" as const] : []), ...(quality ? ["quality" as const] : [])];

  return (
    <Sheet title={rerun ? "AI로 다시 정리" : "AI로 사진 정리"} onClose={onClose}>
      <p>{photoCount.toLocaleString()}장을 {rerun ? "다시 " : ""}정리해요. 사진 수에 따라 몇 분 걸릴 수 있고, 그동안에도 사진을 고를 수 있어요.</p>
      {rerun && <p><strong>고른 사진·찜·메모는 그대로예요.</strong> 장면과 유사컷 묶음만 새로 나눠요.</p>}
      <div className={s.tidyOptions}>
        <label className={s.tidyOption}>
          <input type="checkbox" checked={!fewPhotos} disabled />
          <span><strong>장면별로 나누기</strong><small>{fewPhotos ? `사진이 ${MIN_PHOTOS_FOR_SCENES}장 이상일 때 장면으로 나눠요` : "촬영 시간 간격으로 나누고 장면 이름을 추천해요"}</small></span>
          {!fewPhotos && <em>기본</em>}
        </label>
        <label className={s.tidyOption}>
          <input type="checkbox" checked={similar} onChange={(event) => setSimilar(event.target.checked)} />
          <span><strong>비슷한 사진 묶기</strong><small>연달아 찍은 비슷한 사진을 한 묶음으로 보여줘요</small></span>
        </label>
        <label className={s.tidyOption}>
          <input type="checkbox" checked={quality} onChange={(event) => setQuality(event.target.checked)} />
          <span><strong>흔들림·눈 감음 확인</strong><small>흔들린 사진은 갤러리에서 빼고, 눈 감은 컷은 비슷한 사진 묶음에서 뒤로 보내요. 지우지 않아요</small></span>
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
