"use client";

import { customerPlaceNames, customerSceneCatalog, customerSceneGapSeconds } from "@/lib/customer-shoot-scenes";
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
    body: JSON.stringify(kind === "scene" ? { sceneNames: customerSceneCatalog(shootType), sceneGapSeconds: customerSceneGapSeconds(shootType) }
      : kind === "quality" ? { placeNames: customerPlaceNames(shootType) } : {}),
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

/** AI 정리가 항상 하는 일 — 사용자가 항목을 고르지 않는다(보기 옵션에서 묶어 보기·흔들림 빼기만 켜고 끈다). */
export const AI_TIDY_KINDS: AiTidyKind[] = ["scene", "similarity", "quality"];

/**
 * AI 정리 시작 확인. 몇 분 걸리고 비용이 드는 작업이라 한 번 확인만 받는다. 장면·유사컷·흔들림(홈스냅은 장소도)을 모두 돌리고,
 * 다시 정리할 때 clip-service가 이미 판정·계산한 사진은 건너뛴다(새 사진만).
 * 처음 정리할 때만 보기 설정(묶어 보기·흔들림 빼기)을 켠다 — 다시 정리할 때는 사용자가 보기 옵션에서 바꾼 값을 둔다.
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
  // 사진이 적으면 장면을 나누지 않는다(골라낸 사진만 올리면 시간 간격으로 장소 경계를 못 찾음). 장면 실행은 그대로 보내
  // 정리 상태 흐름을 바꾸지 않는다 — clip-service가 장면 없이 바로 끝내고 Gemini도 부르지 않는다.
  const fewPhotos = photoCount < MIN_PHOTOS_FOR_SCENES;

  return (
    <Sheet title={rerun ? "AI로 다시 정리" : "AI로 사진 정리"} onClose={onClose}>
      <p>{photoCount.toLocaleString()}장을 {rerun ? "다시 " : ""}정리해요. {fewPhotos ? "" : "장면별로 나누고, "}비슷한 사진은 묶고, 흔들린 사진은 따로 모아요. 지우는 사진은 없어요.</p>
      <p>사진 수에 따라 몇 분 걸릴 수 있고, 그동안에도 사진을 고를 수 있어요.{fewPhotos ? ` 장면은 사진이 ${MIN_PHOTOS_FOR_SCENES}장 이상일 때 나눠요.` : ""}</p>
      {rerun && <p><strong>고른 사진·찜·메모는 그대로예요.</strong> 장면과 유사컷 묶음만 새로 나눠요.</p>}
      {error && <p className={s.tidyError} role="alert">{error}</p>}
      <PhotographerLightButton size="confirmation" pending={pending} pendingLabel="시작하는 중…" onClick={() => {
        if (!rerun) {
          rememberGroupSimilar(projectId, true);
          try { localStorage.setItem(setAsideKey(projectId), "1"); } catch {}
        }
        onStart(AI_TIDY_KINDS);
      }}>정리 시작</PhotographerLightButton>
    </Sheet>
  );
}
