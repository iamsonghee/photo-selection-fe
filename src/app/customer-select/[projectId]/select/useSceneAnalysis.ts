"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { splitScenes, type Scene } from "@/lib/customer-scenes";
import { customerSceneCatalog, OTHER_SCENE } from "@/lib/customer-shoot-scenes";
import type { Photo } from "@/types";

export type NamedScene = Scene & { name: string | null };

/**
 * 장면 정리 상태.
 * - analyzing: AI가 정리 중 — 장면 없이 전체 시간순으로 고른다(1차 훑어보기).
 * - ready: AI 장면(이름 있음).
 * - fallback: AI 결과가 없거나 실패 — 촬영 시각 공백으로 나눈 장면(이름 없음). failed면 다시 시도를 안내한다.
 */
export type SceneAnalysis =
  | { status: "analyzing"; progress: { done: number; total: number } | null; scenes: null }
  | { status: "ready"; scenes: NamedScene[] | null }
  | { status: "fallback"; failed: boolean; scenes: NamedScene[] | null };

const POLL_MS = 5_000;
type MockMode = "analyzing" | "ready" | "failed";

/** AI 장면 이름이 붙기 전까지는 목록 순서대로 이름을 대신 붙인 시안용 결과를 만든다(개발 확인용). */
function mockNamedScenes(scenes: Scene[] | null, shootType: string): NamedScene[] | null {
  if (!scenes) return null;
  const catalog = customerSceneCatalog(shootType);
  return scenes.map((scene, index) => ({ ...scene, name: scene.start ? catalog[index] ?? OTHER_SCENE : null }));
}

export function useSceneAnalysis(projectId: string, photos: Photo[], shootType: string): SceneAnalysis & { retry: () => void } {
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
  const mockValue = mockParam ?? storedMock;
  const mock = mockValue === "analyzing" || mockValue === "ready" || mockValue === "failed" ? mockValue as MockMode : null;
  const [pollKey, setPollKey] = useState(0);
  const timeScenes = useMemo(() => splitScenes(photos), [photos]);
  const unnamed = useMemo<NamedScene[] | null>(() => timeScenes?.map((scene) => ({ ...scene, name: null })) ?? null, [timeScenes]);

  // 실제 상태: 유사컷 분석이 진행 중이면 analyzing, 실패면 failed. 서비스가 없으면(로컬 등) 조용히 시간 장면을 쓴다.
  const [remote, setRemote] = useState<"processing" | "failed" | "idle">("idle");
  useEffect(() => {
    if (mock) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/customer-select/projects/${projectId}/ai/similarity`, { cache: "no-store" });
        const status = response.ok ? ((await response.json()).status as string | null) : null;
        if (cancelled) return;
        const next = status === "processing" ? "processing" : status === "failed" ? "failed" : "idle";
        setRemote(next);
        if (next === "processing") timer = window.setTimeout(poll, POLL_MS);
      } catch {
        if (!cancelled) setRemote("idle");
      }
    };
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [mock, pollKey, projectId]);

  const retry = useCallback(() => {
    if (mock) return;
    setRemote("processing");
    void fetch(`/api/customer-select/projects/${projectId}/ai/similarity`, { method: "POST" })
      .finally(() => setPollKey((key) => key + 1));
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
      : remote === "processing" ? { status: "analyzing", progress: null, scenes: null }
      : { status: "fallback", failed: remote === "failed", scenes: unnamed };
    return { ...result, retry };
  }, [mock, mockDone, photos.length, remote, retry, shootType, timeScenes, unnamed]);
}
