"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { splitScenes, type Scene } from "@/lib/customer-scenes";
import { customerSceneCatalog, OTHER_SCENE } from "@/lib/customer-shoot-scenes";
import type { Photo } from "@/types";
import type { AiTidyKind } from "./AiTidySheet";

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

export function useSceneAnalysis(projectId: string, photos: Photo[], shootType: string): SceneAnalysisControl {
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
  const unnamed = useMemo<NamedScene[] | null>(() => timeScenes?.map((scene) => ({ ...scene, name: null })) ?? null, [timeScenes]);

  // 실제 상태(유사컷 분석 상태 API): 진행 중이면 analyzing, 완료면 시간 장면, 실패면 시간 장면+다시 시도, 기록이 없으면 none.
  const [remote, setRemote] = useState<"none" | "processing" | "completed" | "failed">("none");
  const [pollKey, setPollKey] = useState(0);
  useEffect(() => {
    if (mock) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/customer-select/projects/${projectId}/ai/similarity`, { cache: "no-store" });
        const status = response.ok ? ((await response.json()).status as string | null) : null;
        if (cancelled) return;
        const next = status === "processing" ? "processing" : status === "failed" ? "failed" : status === "completed" ? "completed" : "none";
        setRemote(next);
        if (next === "processing") timer = window.setTimeout(poll, POLL_MS);
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
      const responses = await Promise.all(kinds.map((kind) => fetch(`/api/customer-select/projects/${projectId}/ai/${kind}`, { method: "POST" })));
      if (!responses.some((response) => response.ok)) return "AI 정리를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
      setRemote("processing");
      setPollKey((key) => key + 1);
      return null;
    } catch {
      return "인터넷 연결을 확인하고 다시 시도해 주세요.";
    }
  }, [mock, projectId]);

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
      : remote === "processing" ? { status: "analyzing", progress: null, scenes: null }
      : remote === "completed" || remote === "failed" ? { status: "fallback", failed: remote === "failed", scenes: unnamed }
      : { status: "none", scenes: null };
    return { ...result, photos: mock && result.status === "ready" ? mockAiPhotos : photos, start };
  }, [mock, mockAiPhotos, mockDone, photos, remote, shootType, start, timeScenes, unnamed]);
}
