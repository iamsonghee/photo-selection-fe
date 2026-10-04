"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { splitScenes, type Scene } from "@/lib/customer-scenes";
import { customerSceneCatalog, customerSceneGapSeconds, OTHER_SCENE } from "@/lib/customer-shoot-scenes";
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
  | { status: "analyzing"; scenes: null }
  | { status: "ready"; scenes: NamedScene[] | null }
  | { status: "fallback"; failed: boolean; scenes: NamedScene[] | null };

/** 최근 실행 하나(장면·유사컷·흔들림 각각). done/total: 장면은 이름 붙인 장면 수, 나머지는 사진 수. */
export type AiTask = { kind: AiTidyKind; status: "processing" | "completed" | "failed"; done: number; total: number; failed: number };

const TASK_LABELS: Record<AiTidyKind, string> = { scene: "장면 이름 붙이기", similarity: "비슷한 사진 묶기", quality: "흔들림·눈 감음 확인" };

/** 진행 중인 작업 한 줄: "장면 이름 붙이는 중 · 3 / 6", "비슷한 사진 묶는 중 · 840 / 2,000장". */
export function taskProgressText(task: AiTask): string {
  const count = `${task.done.toLocaleString()} / ${task.total.toLocaleString()}`;
  if (task.kind === "scene") return task.total ? `장면 이름 붙이는 중 · ${count}` : "장면 나누는 중";
  return `${task.kind === "similarity" ? "비슷한 사진 묶는 중" : "흔들림·눈 감음 확인 중"}${task.total ? ` · ${count}장` : ""}`;
}

export type SceneAnalysisControl = SceneAnalysis & {
  /** 최근 실행들. 장면이 끝난 뒤에도 유사컷·흔들림이 진행 중이거나 일부 실패했는지 보여줄 때 쓴다. */
  tasks: AiTask[];
  /** 장면 화면에 작게 띄울 안내(뒤에서 진행 중인 작업, 실패·일부 실패). retry면 누르면 다시 정리를 연다. */
  notice: { text: string; retry: boolean } | null;
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

/** 장면 화면의 작은 안내 한 줄: 장면 정리 실패 > 다른 작업 실패·일부 실패 > 뒤에서 진행 중. 장면 정리 중이면 배너가 대신 보인다. */
function noticeOf(result: SceneAnalysis, tasks: AiTask[]): SceneAnalysisControl["notice"] {
  if (result.status === "analyzing" || result.status === "none") return null;
  if (result.status === "fallback" && result.failed) return { text: "AI 정리 실패 · 다시 시도", retry: true };
  const failed = tasks.find((task) => task.status === "failed" || (task.status === "completed" && task.failed > 0));
  if (failed) {
    const unit = failed.kind === "scene" ? "개 장면" : "장";
    return { text: `${TASK_LABELS[failed.kind]} ${failed.status === "failed" ? "실패" : `${failed.failed.toLocaleString()}${unit} 못 함`} · 다시 시도`, retry: true };
  }
  const running = tasks.find((task) => task.status === "processing");
  return running ? { text: taskProgressText(running), retry: false } : null;
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
  const gapSeconds = customerSceneGapSeconds(shootType);
  const realTimeScenes = useMemo(() => splitScenes(photos, gapSeconds && gapSeconds * 1000), [photos, gapSeconds]);
  const timeScenes = useMemo(() => (mock ? mockScenes(photos, realTimeScenes) : realTimeScenes), [mock, photos, realTimeScenes]);
  const ai = useMemo(() => (aiScenes?.length ? namedFromAi(aiScenes, photos) : null), [aiScenes, photos]);
  const unnamed = useMemo<NamedScene[] | null>(() => timeScenes?.map((scene) => ({ ...scene, name: null })) ?? null, [timeScenes]);

  // 실제 상태(장면 정리 실행 상태 API): 진행 중이면 analyzing, 완료면 AI 장면(없으면 시간 장면), 실패면 시간 장면+다시 시도, 기록이 없으면 none.
  // 장면 실행이 따로 생기기 전(2026-10-03 전)에 정리한 프로젝트는 장면 실행 기록이 없지만 저장된 AI 장면이 있으면 그대로 ready.
  const [remote, setRemote] = useState<"none" | "processing" | "completed" | "failed">("none");
  // 장면·유사컷·흔들림 각 최근 실행 — clip-service가 진행하면서 처리 수를 기록한다.
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [pollKey, setPollKey] = useState(0);
  // 이 화면에서 방금 시작한 작업 — 첫 조회 전에 끝나도(캐시를 다 재사용하는 등 몇 초 만에) 결과를 다시 읽게 진행 중으로 셈한다.
  const startedRef = useRef<AiTidyKind[]>([]);
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => { onCompletedRef.current = onCompleted; }, [onCompleted]);
  useEffect(() => {
    if (mock) return;
    let cancelled = false;
    let timer = 0;
    let wasRunning = new Set<AiTidyKind>(startedRef.current);
    startedRef.current = [];
    type RunStatus = { status: AiTask["status"] | null; run?: { image_count?: number; processed_count?: number; failed_count?: number } | null } | null;
    const kinds: AiTidyKind[] = ["scene", "similarity", "quality"];
    const read = async (kind: AiTidyKind): Promise<RunStatus> => {
      const response = await fetch(`/api/customer-select/projects/${projectId}/ai/${kind}`, { cache: "no-store" });
      return response.ok ? await response.json() as RunStatus : null;
    };
    const poll = async () => {
      try {
        const runs = await Promise.all(kinds.map(read));
        if (cancelled) return;
        const next = runs.flatMap((item, index): AiTask[] => item?.status ? [{
          kind: kinds[index], status: item.status,
          done: item.run?.processed_count ?? 0, total: item.run?.image_count ?? 0, failed: item.run?.failed_count ?? 0,
        }] : []);
        const running = new Set(next.filter((task) => task.status === "processing").map((task) => task.kind));
        // 작업 하나가 끝날 때마다 결과(장면·유사컷·품질)를 다시 읽는다 — 장면은 유사컷·흔들림을 기다리지 않고 먼저 보인다.
        if ([...wasRunning].some((kind) => !running.has(kind))) onCompletedRef.current?.();
        wasRunning = running;
        setRemote(runs[0]?.status ?? "none");
        setTasks(next);
        if (running.size) timer = window.setTimeout(poll, POLL_MS);
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
      // 409(다른 탭·기기에서 이미 정리 중)는 시작한 것으로 보고 그 진행 상태를 이어서 보여준다.
      const { started, error } = await startAiTidy(projectId, kinds, shootType);
      if (started.length) {
        startedRef.current = started;
        if (started.includes("scene")) setRemote("processing");
        setPollKey((key) => key + 1);
      }
      return error;
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
      : mock === "analyzing" ? { status: "analyzing", scenes: null }
      : mock === "failed" ? { status: "fallback", failed: true, scenes: unnamed }
      : mock === "none" ? { status: "none", scenes: null }
      : remote === "processing" ? { status: "analyzing", scenes: null }
      // 저장된 AI 장면(이름 포함)이 있으면 그걸, 없으면(장면 근거 부족·실패) 시각 공백 장면.
      : ai && remote !== "failed" ? { status: "ready", scenes: ai.scenes }
      : remote === "completed" || remote === "failed" ? { status: "fallback", failed: remote === "failed", scenes: ai?.scenes ?? unnamed }
      : { status: "none", scenes: null };
    const shownTasks: AiTask[] = mock === "analyzing" && mockDone < 1
      ? [{ kind: "scene", status: "processing", done: Math.round(6 * mockDone), total: 6, failed: 0 }] : mock ? [] : tasks;
    return { ...result, tasks: shownTasks, notice: noticeOf(result, shownTasks), photos: mock && result.status === "ready" ? mockAiPhotos : photos, newPhotoCount: mock ? 0 : ai?.newCount ?? 0, start };
  }, [ai, mock, mockAiPhotos, mockDone, photos, remote, tasks, shootType, start, timeScenes, unnamed]);
}
