"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { splitScenes, type Scene } from "@/lib/customer-scenes";
import { customerSceneCatalog, OTHER_SCENE } from "@/lib/customer-shoot-scenes";
import type { Photo } from "@/types";
import { startAiTidy, type AiTidyKind } from "./AiTidySheet";
import type { ProjectView } from "../../_lib/real-store";

export type NamedScene = Scene & { name: string | null };

/**
 * 장면 정리 상태. AI 정리는 사용자가 시작할 때만 돈다.
 * - none: 아직 정리하지 않음 — 원본 그대로 촬영 시간순 전체 사진.
 * - analyzing: 정리 중 — 전체 시간순으로 고르며 기다린다(1차 훑어보기).
 * - ready: AI 장면(이름 있음).
 * - fallback: 정리는 했지만 AI 장면이 없거나 실패 — 촬영 시각 공백으로 나눈 장면(이름 없음). failed면 다시 시도를 안내한다.
 */
export type SceneAnalysis =
  | { status: "none"; scenes: null }
  | { status: "analyzing"; progress: { done: number; total: number } | null; scenes: null }
  | { status: "ready"; scenes: NamedScene[] | null }
  | { status: "fallback"; failed: boolean; scenes: NamedScene[] | null };

export type SceneAnalysisControl = SceneAnalysis & {
  /** 화면에 쓸 사진 목록. 시안 모드 완료 상태에서는 가짜 유사컷 묶음·흔들림/눈 감음 값이 붙는다. */
  photos: Photo[];
  /** AI 장면이 있을 때, 정리 뒤 새로 올려 어느 장면에도 없는 사진 수(다시 정리 안내용) */
  newPhotoCount: number;
  /** 정리를 시작한다. 시작 요청이 받아들여지지 않으면 오류 문구를 돌려준다. */
  start: (kinds: AiTidyKind[]) => Promise<string | null>;
};

const POLL_MS = 5_000;
type MockMode = "none" | "analyzing" | "ready" | "failed";
const MOCK_MODES: readonly string[] = ["none", "analyzing", "ready", "failed"];

const MOCK_SCENE_PHOTOS = 12;

/** 시안 확인용: 촬영 시각으로 장면이 2개 이상 안 나오면(한 번에 찍은 테스트 사진 등) 순서대로 고르게 잘라 장면을 만든다. */
function mockScenes(photos: Photo[], timeScenes: Scene[] | null): Scene[] | null {
  if (timeScenes && timeScenes.length > 1) return timeScenes;
  const count = Math.min(6, Math.floor(photos.length / MOCK_SCENE_PHOTOS));
  if (count < 2) return timeScenes;
  const size = Math.ceil(photos.length / count);
  return Array.from({ length: count }, (_, index) => {
    const chunk = photos.slice(index * size, (index + 1) * size);
    return { index, photoIds: chunk.map((photo) => photo.id), start: chunk[0]?.takenAt ?? null, end: chunk.at(-1)?.takenAt ?? null };
  }).filter((scene) => scene.photoIds.length);
}

/** 시안 확인용 AI 결과: 8장마다 앞 3장을 유사컷으로 묶고, 11장마다 흔들림, 13장마다 눈 감음으로 표시한다. */
function withMockAi(photos: Photo[]): Photo[] {
  return photos.map((photo, index) => ({
    ...photo,
    similarityGroupId: index % 8 < 3 ? `mock-group-${Math.floor(index / 8)}` : null,
    isBlurry: index % 11 === 5,
    faceDetected: true,
    eyesClosed: index % 13 === 9,
  }));
}

/** AI 장면 이름이 붙기 전까지는 목록 순서대로 이름을 대신 붙인 시안용 결과를 만든다(개발 확인용). */
function mockNamedScenes(scenes: Scene[] | null, shootType: string): NamedScene[] | null {
  if (!scenes) return null;
  const catalog = customerSceneCatalog(shootType);
  return scenes.map((scene, index) => ({ ...scene, name: catalog[index] ?? OTHER_SCENE }));
}

const NEW_PHOTOS_SCENE = "새로 올린 사진";

/** 저장된 AI 장면 → 화면 장면. 정리 뒤 새로 올린(어느 장면에도 없는) 사진은 마지막 "새로 올린 사진" 장면으로 모은다. */
function namedFromAi(aiScenes: NonNullable<ProjectView["aiScenes"]>, photos: Photo[]): { scenes: NamedScene[]; newCount: number } {
  const known = new Set(photos.map((photo) => photo.id));
  const scenes: NamedScene[] = aiScenes.map((scene, index) => ({ index, name: scene.name, start: scene.start, end: scene.end, photoIds: scene.photoIds.filter((id) => known.has(id)) }));
  const assigned = new Set(scenes.flatMap((scene) => scene.photoIds));
  const fresh = photos.filter((photo) => !assigned.has(photo.id)).sort((a, b) => (a.takenAt ?? "￿").localeCompare(b.takenAt ?? "￿") || a.orderIndex - b.orderIndex);
  if (fresh.length) scenes.push({ index: scenes.length, name: NEW_PHOTOS_SCENE, start: fresh[0].takenAt ?? null, end: fresh.at(-1)?.takenAt ?? null, photoIds: fresh.map((photo) => photo.id) });
  return { scenes: scenes.filter((scene) => scene.photoIds.length), newCount: fresh.length };
}

export function useSceneAnalysis(projectId: string, photos: Photo[], shootType: string, aiScenes?: ProjectView["aiScenes"], onCompleted?: () => void): SceneAnalysisControl {
  const searchParams = useSearchParams();
  // 시안 확인용 `?mockAnalysis=`는 개발 환경에서만 받고, 같은 탭의 다른 화면(보내기)에서도 이어지도록 세션에 기억한다.
  const mockKey = `ps:mock-analysis:${projectId}`;
  const mockParam = process.env.NODE_ENV !== "production" ? searchParams.get("mockAnalysis") : null;
  const [storedMock] = useState(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
    try {
      if (mockParam === "off") sessionStorage.removeItem(mockKey);
      else if (mockParam) sessionStorage.setItem(mockKey, mockParam);
      return sessionStorage.getItem(mockKey);
    } catch { return mockParam; }
  });
  const initialMock = mockParam ?? storedMock;
  const [mock, setMock] = useState<MockMode | null>(initialMock && MOCK_MODES.includes(initialMock) ? initialMock as MockMode : null);
  const mockAiPhotos = useMemo(() => withMockAi(photos), [photos]);
  const realTimeScenes = useMemo(() => splitScenes(photos), [photos]);
  const timeScenes = useMemo(() => (mock ? mockScenes(photos, realTimeScenes) : realTimeScenes), [mock, photos, realTimeScenes]);
  const ai = useMemo(() => (aiScenes?.length ? namedFromAi(aiScenes, photos) : null), [aiScenes, photos]);
  const unnamed = useMemo<NamedScene[] | null>(() => timeScenes?.map((scene) => ({ ...scene, name: null })) ?? null, [timeScenes]);

  // 실제 상태(유사컷 분석 상태 API): 진행 중이면 analyzing, 완료면 시간 장면, 실패면 시간 장면+다시 시도, 기록이 없으면 none.
  const [remote, setRemote] = useState<"none" | "processing" | "completed" | "failed">("none");
  // 진행 중인 분석(유사컷·장면 + 흔들림·눈 감음)의 처리 장수 합 — clip-service가 진행하면서 기록한다.
  const [remoteProgress, setRemoteProgress] = useState<{ done: number; total: number } | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => { onCompletedRef.current = onCompleted; }, [onCompleted]);
  useEffect(() => {
    if (mock) return;
    let cancelled = false;
    let timer = 0;
    let wasProcessing = false;
    type RunStatus = { status: string | null; run?: { image_count?: number; processed_count?: number } | null } | null;
    const read = async (kind: AiTidyKind): Promise<RunStatus> => {
      const response = await fetch(`/api/customer-select/projects/${projectId}/ai/${kind}`, { cache: "no-store" });
      return response.ok ? await response.json() as RunStatus : null;
    };
    const poll = async () => {
      try {
        const [similarity, quality] = await Promise.all([read("similarity"), read("quality")]);
        if (cancelled) return;
        const status = similarity?.status ?? null;
        const next = status === "processing" ? "processing" : status === "failed" ? "failed" : status === "completed" ? "completed" : "none";
        const running = [similarity, quality].filter((item) => item?.status === "processing" && (item.run?.image_count ?? 0) > 0);
        const anyRunning = similarity?.status === "processing" || quality?.status === "processing";
        // 이 화면에서 정리(품질 판정까지)가 끝나면 새 장면·유사컷·품질 결과를 다시 읽는다.
        if (wasProcessing && !anyRunning) onCompletedRef.current?.();
        wasProcessing = anyRunning;
        setRemote(next);
        setRemoteProgress(running.length ? {
          done: running.reduce((sum, item) => sum + (item!.run?.processed_count ?? 0), 0),
          total: running.reduce((sum, item) => sum + (item!.run?.image_count ?? 0), 0),
        } : null);
        if (anyRunning) timer = window.setTimeout(poll, POLL_MS);
      } catch {
        if (!cancelled) setRemote("none");
      }
    };
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [mock, pollKey, projectId]);

  const start = useCallback(async (kinds: AiTidyKind[]) => {
    if (mock) {
      setMock("analyzing");
      return null;
    }
    try {
      const responses = await startAiTidy(projectId, kinds, shootType);
      if (!responses.some((response) => response.ok)) return "AI 정리를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
      setRemote("processing");
      setPollKey((key) => key + 1);
      return null;
    } catch {
      return "인터넷 연결을 확인하고 다시 시도해 주세요.";
    }
  }, [mock, projectId, shootType]);

  // 시안 확인용: analyzing은 몇 초마다 진행되다가 완료로 바뀐다(완료 안내 흐름 확인).
  const [mockDone, setMockDone] = useState(0.35);
  useEffect(() => {
    if (mock !== "analyzing") return;
    const interval = window.setInterval(() => setMockDone((value) => Math.min(1, value + 0.1)), 2_000);
    return () => window.clearInterval(interval);
  }, [mock]);

  return useMemo(() => {
    const result: SceneAnalysis =
      mock === "ready" || (mock === "analyzing" && mockDone >= 1) ? { status: "ready", scenes: mockNamedScenes(timeScenes, shootType) }
      : mock === "analyzing" ? { status: "analyzing", progress: { done: Math.round(photos.length * mockDone), total: photos.length }, scenes: null }
      : mock === "failed" ? { status: "fallback", failed: true, scenes: unnamed }
      : mock === "none" ? { status: "none", scenes: null }
      : remote === "processing" ? { status: "analyzing", progress: remoteProgress, scenes: null }
      // 저장된 AI 장면(이름 포함)이 있으면 그걸, 없으면(장면 근거 부족·실패) 시각 공백 장면.
      : ai && remote !== "failed" ? { status: "ready", scenes: ai.scenes }
      : remote === "completed" || remote === "failed" ? { status: "fallback", failed: remote === "failed", scenes: ai?.scenes ?? unnamed }
      : { status: "none", scenes: null };
    return { ...result, photos: mock && result.status === "ready" ? mockAiPhotos : photos, newPhotoCount: mock ? 0 : ai?.newCount ?? 0, start };
  }, [ai, mock, mockAiPhotos, mockDone, photos, remote, remoteProgress, shootType, start, timeScenes, unnamed]);
}
