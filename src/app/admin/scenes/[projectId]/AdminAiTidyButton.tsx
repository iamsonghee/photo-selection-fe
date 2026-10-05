"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Statuses = Record<"scene" | "similarity" | "quality", string | null>;
const LABELS: Record<keyof Statuses, string> = { scene: "장면", similarity: "유사컷", quality: "흔들림" };

/** 장면 검수용 AI 정리 실행. 결과가 고객 화면에도 반영되므로 확인을 받고, 끝나면 페이지를 다시 읽어 AI 장면을 보여준다. */
export function AdminAiTidyButton({ projectId, photoCount }: { projectId: string; photoCount: number }) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Statuses | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const running = Boolean(statuses && Object.values(statuses).includes("processing"));

  const fetchStatuses = () => fetch(`/api/admin/scenes/${projectId}/ai`, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() as Promise<Statuses> : null))
    .catch(() => null);

  useEffect(() => {
    void fetchStatuses().then((next) => { if (next) setStatuses(next); });
    // 처음 한 번만 읽는다(진행 중이면 아래 effect가 이어서 확인).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // 진행 중이면 5초마다 확인하고, 끝나면 서버 컴포넌트를 다시 읽어 새 AI 장면을 띄운다.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void fetchStatuses().then((next) => {
      if (!next) return;
      setStatuses(next);
      if (!Object.values(next).includes("processing")) router.refresh();
    }), 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, router, running]);

  async function start() {
    if (!window.confirm(`사진 ${photoCount.toLocaleString()}장에 AI 정리(장면·유사컷·흔들림)를 실행할까요?\n\n결과는 고객의 실제 장면으로 저장돼 고객 고르기 화면에도 바로 보이고, AI 분석 비용이 듭니다. 이미 정리된 프로젝트면 다시 나눠 고객 화면의 장면이 바뀔 수 있어요.`)) return;
    setStarting(true);
    setError(null);
    const response = await fetch(`/api/admin/scenes/${projectId}/ai`, { method: "POST" }).catch(() => null);
    const data = await response?.json().catch(() => ({})) as { failed?: (keyof Statuses)[]; error?: string } | undefined;
    if (!response?.ok) setError(data?.error ?? "시작하지 못했어요.");
    else if (data?.failed?.length) setError(`${data.failed.map((kind) => LABELS[kind]).join(", ")}은(는) 시작하지 못했어요. 다시 누르면 실패한 것만 다시 시작해요.`);
    setStarting(false);
    const next = await fetchStatuses();
    if (next) setStatuses(next);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
      <button type="button" onClick={() => void start()} disabled={starting || running} className="h-9 rounded-md bg-primary px-4 font-semibold text-white disabled:opacity-50">
        {starting ? "시작하는 중…" : running ? "AI 정리 진행 중…" : "AI 정리 실행"}
      </button>
      {statuses && (
        <span className="text-muted-foreground">
          {(Object.keys(LABELS) as (keyof Statuses)[]).map((kind) => `${LABELS[kind]} ${statuses[kind] === "processing" ? "진행 중" : statuses[kind] === "completed" ? "완료" : statuses[kind] === "failed" ? "실패" : "전"}`).join(" · ")}
        </span>
      )}
      {error && <span className="text-danger">{error}</span>}
    </div>
  );
}
