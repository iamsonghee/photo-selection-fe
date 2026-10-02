"use client";

import { useMemo, useState } from "react";
import { formatSceneClock } from "@/lib/customer-scenes";
import { OTHER_SCENE } from "@/lib/customer-shoot-scenes";
import { scoreScenes, type LabeledScene } from "@/lib/scene-label-score";
import type { ReviewPhoto } from "@/lib/admin-scene-review";

const COLORS = ["#ff4d00", "#4f7eff", "#2ed573", "#f5a623", "#a55eea", "#26c6da", "#ff6b81", "#9ccc65"];
const pct = (value: number) => `${Math.round(value * 100)}%`;

/** 정답 편집: 사진을 누르면 그 사진부터 새 장면, `앞 장면과 합치기`, 장면 이름 고르기(목록 또는 직접 입력). */
export function SceneLabeler({ projectId, photos, aiScenes, initialLabel, catalog }: {
  projectId: string;
  photos: ReviewPhoto[];
  aiScenes: LabeledScene[] | null;
  initialLabel: { scenes: LabeledScene[]; note: string | null } | null;
  catalog: readonly string[];
}) {
  const allIds = useMemo(() => photos.map((photo) => photo.id), [photos]);
  const sameSet = (scenes: LabeledScene[]) => {
    const ids = scenes.flatMap((scene) => scene.photoIds);
    return ids.length === allIds.length && ids.every((id) => allIds.includes(id));
  };
  // 시작값: 저장된 정답(사진이 그대로일 때) → AI 장면 → 전체 한 장면
  const fallback: LabeledScene[] = aiScenes && sameSet(aiScenes) ? aiScenes : [{ name: null, photoIds: allIds }];
  const labelStale = Boolean(initialLabel && !sameSet(initialLabel.scenes));
  const [scenes, setScenes] = useState<LabeledScene[]>(initialLabel && !labelStale ? initialLabel.scenes : fallback);
  const [note, setNote] = useState(initialLabel?.note ?? "");
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string }>({ kind: "idle" });

  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  // AI가 장면을 시작한 사진(경계 표시)과 사진별 AI 장면 이름
  const aiStarts = useMemo(() => new Set((aiScenes ?? []).slice(1).map((scene) => scene.photoIds[0])), [aiScenes]);
  const aiNameOf = useMemo(() => new Map((aiScenes ?? []).flatMap((scene) => scene.photoIds.map((id) => [id, scene.name] as const))), [aiScenes]);
  const score = aiScenes && sameSet(aiScenes) ? scoreScenes(scenes, aiScenes) : null;

  const update = (next: LabeledScene[]) => { setScenes(next); setState({ kind: "idle" }); };
  const split = (sceneIndex: number, at: number) => update(scenes.flatMap((scene, index) => index !== sceneIndex ? [scene] : [
    { name: scene.name, photoIds: scene.photoIds.slice(0, at) },
    { name: null, photoIds: scene.photoIds.slice(at) },
  ]));
  const mergeWithPrevious = (sceneIndex: number) => update(scenes.flatMap((scene, index) => index === sceneIndex ? [] : index === sceneIndex - 1 ? [{ name: scene.name, photoIds: [...scene.photoIds, ...scenes[sceneIndex].photoIds] }] : [scene]));
  const rename = (sceneIndex: number, name: string) => update(scenes.map((scene, index) => index === sceneIndex ? { ...scene, name: name.trim() || null } : scene));

  async function save() {
    setState({ kind: "saving" });
    const response = await fetch("/api/admin/scene-labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, scenes, note }) }).catch(() => null);
    const data = await response?.json().catch(() => ({})) as { error?: string } | undefined;
    setState(response?.ok ? { kind: "saved" } : { kind: "error", message: data?.error ?? "저장하지 못했어요." });
  }

  return (
    <div className="mt-6 pb-28">
      <datalist id="scene-names">{[...catalog, OTHER_SCENE].map((name) => <option key={name} value={name} />)}</datalist>
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">사용법</strong> — 사진을 누르면 <b className="text-foreground">그 사진부터 새 장면</b>으로 나눕니다. 잘못 나뉜 곳은 장면 오른쪽 위 <b className="text-foreground">앞 장면과 합치기</b>. 이름은 목록에서 고르거나 직접 입력하세요.
        주황 왼쪽 선은 <b className="text-foreground">AI가 장면을 나눈 자리</b>입니다.
        {labelStale && <div className="mt-2 text-danger">저장된 정답 이후 사진이 바뀌어 AI 장면에서 다시 시작합니다.</div>}
        {score && <div className="mt-2 text-foreground">지금 정답 기준 AI 점수 · 경계 정밀도 {pct(score.boundaryPrecision)} · 재현율 {pct(score.boundaryRecall)} · 이름 {pct(score.nameAccuracy)} <span className="text-muted-foreground">(AI {score.aiSceneCount}개 / 정답 {score.labelSceneCount}개)</span></div>}
        {!aiScenes && <div className="mt-2">AI 장면이 없는 프로젝트입니다(정리 전이거나 촬영 시각 부족). 정답만 남길 수 있어요.</div>}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {scenes.map((scene, sceneIndex) => {
          const color = COLORS[sceneIndex % COLORS.length];
          const first = photoById.get(scene.photoIds[0]);
          const last = photoById.get(scene.photoIds[scene.photoIds.length - 1]);
          // 이 장면 사진들의 AI 장면 이름(가장 많은 것)
          const aiCounts = new Map<string, number>();
          scene.photoIds.forEach((id) => { const name = aiNameOf.get(id) ?? "—"; aiCounts.set(name, (aiCounts.get(name) ?? 0) + 1); });
          const aiMajor = [...aiCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
          return (
            <section key={`${sceneIndex}-${scene.photoIds[0]}`} className="rounded-xl border border-border bg-surface p-3" style={{ borderLeft: `4px solid ${color}` }}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <strong className="text-foreground">#{sceneIndex + 1}</strong>
                <input
                  list="scene-names"
                  defaultValue={scene.name ?? ""}
                  onBlur={(event) => rename(sceneIndex, event.target.value)}
                  placeholder="장면 이름"
                  className="h-8 w-44 rounded-md border border-border bg-background px-2 text-foreground"
                />
                <span className="text-muted-foreground">{scene.photoIds.length}장 · {formatSceneClock(first?.takenAt ?? null) || "시각 없음"}{last?.takenAt && last !== first ? ` – ${formatSceneClock(last.takenAt)}` : ""}</span>
                {aiScenes && <span className="text-xs text-muted-foreground">AI: {aiMajor}</span>}
                {sceneIndex > 0 && <button type="button" onClick={() => mergeWithPrevious(sceneIndex)} className="ml-auto h-8 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground">앞 장면과 합치기</button>}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1">
                {scene.photoIds.map((id, at) => {
                  const photo = photoById.get(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={at === 0}
                      onClick={() => split(sceneIndex, at)}
                      title={`${photo?.filename ?? ""}${photo?.takenAt ? ` · ${formatSceneClock(photo.takenAt)}` : ""}${at ? " — 누르면 이 사진부터 새 장면" : ""}`}
                      className="relative aspect-square overflow-hidden rounded bg-surface-raised enabled:hover:ring-2 enabled:hover:ring-primary disabled:cursor-default"
                      style={aiStarts.has(id) ? { boxShadow: "inset 3px 0 0 #ff4d00" } : undefined}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {photo?.thumbUrl ? <img src={photo.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:left-[240px] lg:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="메모(선택) — 예: 돌잡이 뒤 이벤트를 하객으로 착각" className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground" />
          <span className="text-sm text-muted-foreground">정답 {scenes.length}개 장면</span>
          {aiScenes && sameSet(aiScenes) && <button type="button" onClick={() => update(aiScenes)} className="h-10 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground">AI 장면으로 되돌리기</button>}
          <button type="button" onClick={() => void save()} disabled={state.kind === "saving"} className="h-10 rounded-md bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50">
            {state.kind === "saving" ? "저장 중…" : "정답 저장"}
          </button>
          {state.kind === "saved" && <span className="text-sm text-primary">저장했어요</span>}
          {state.kind === "error" && <span className="text-sm text-danger">{state.message}</span>}
        </div>
      </div>
    </div>
  );
}
