"use client";

/**
 * S5 — 셀렉 갤러리.
 *
 * 단계 0 조사에서 확인한 대로, 기존 고객 갤러리(GalleryPageClient)는 PC/모바일을 별도
 * 렌더 분기 없이 "하나의 반응형 트리 + CSS"로 처리한다(md:hidden 같은 이중 분기가 0개).
 * 단계 4 고해상도 목업에서는 검토 편의를 위해 PC 전용 구성을 별도로 그렸지만, 실제 코드
 * 단계에서는 이 검증된 기존 방식(반응형 단일 트리)을 따르는 게 더 안전하다고 판단해
 * 그 쪽을 재사용했다 — CSS grid의 auto-fill로 넓은 화면에서 열 수만 늘어난다.
 *
 * 필터링은 기존 `@/lib/gallery-filter`의 순수 함수를 그대로 쓴다(재사용 대상으로 이미 검증됨).
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getFilteredPhotos, getPhotoDisplayName, type GalleryFilterState } from "@/lib/gallery-filter";
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import type { ColorTag, StarRating } from "@/types";
import {
  COLOR_PALETTE,
  activeParticipants,
  disagreementIds,
  reviewedPhotoIds,
  tasteMatchPct,
  bothDone,
  useCustomerSelectStore,
} from "../../_lib/real-store";
import { NicknamePrompt } from "../../_lib/NicknamePrompt";
import ui from "../../_lib/ui.module.css";

type Tab = "all" | "selected" | "disagree" | "mine";

const EMPTY_FILTER: GalleryFilterState = {
  starFilter: "all",
  colorFilter: "all",
  colorFilterMode: "any",
  selectedFilter: "all",
  sortOrder: "oldest",
  nameFilter: "",
  qualityFilter: [],
  groupedView: false,
};

const MILESTONES = [100, 400];

export default function CustomerSelectGalleryPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const shareToken = useSearchParams().get("share_token");
  const { project, hydrated, currentIdentity, shareUrl, toggleSelect, toggleLike, setStar, setComment, toggleDone } =
    useCustomerSelectStore();

  const [tab, setTab] = useState<Tab>("all");
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      window.prompt("아래 링크를 복사해서 공유하세요", shareUrl);
    }
  }

  const selectedIds = useMemo(() => new Set(project.selectedIds), [project.selectedIds]);
  const disagree = useMemo(() => new Set(disagreementIds(project)), [project]);

  const baseList = useMemo(() => {
    if (tab === "selected") return project.photos.filter((p) => selectedIds.has(p.id));
    if (tab === "disagree") return project.photos.filter((p) => disagree.has(p.id));
    if (tab === "mine") return project.photos.filter((p) => project.photoStates[p.id]?.color?.includes(currentIdentity));
    return project.photos;
  }, [tab, project.photos, project.photoStates, selectedIds, disagree, currentIdentity]);

  const list = useMemo(
    () => getFilteredPhotos(baseList, selectedIds, project.photoStates, EMPTY_FILTER),
    [baseList, selectedIds, project.photoStates]
  );

  const reviewedCount = reviewedPhotoIds(project).length;
  const match = tasteMatchPct(project);
  const disagreeCount = disagreementIds(project).length;
  const myLikeCount = Object.values(project.photoStates).filter((s) => s.color?.includes(currentIdentity)).length;
  const target = project.target || 1;
  const selectedCount = project.selectedIds.length;
  const done = bothDone(project);

  const openPhoto = openPhotoId ? project.photos.find((p) => p.id === openPhotoId) ?? null : null;
  const openIndex = openPhoto ? project.photos.findIndex((p) => p.id === openPhoto.id) : -1;

  // 마일스톤 토스트는 세션당 한 번만 — 넘어선 기준값을 로컬 상태에만 기록한다
  // (목업 범위: 화면 검증이 목적이라 영속은 불필요).
  const [shownMilestones, setShownMilestones] = useState<number[]>([]);
  const [justHit, setJustHit] = useState<number | null>(null);
  useEffect(() => {
    const next = MILESTONES.find((m) => reviewedCount >= m && !shownMilestones.includes(m));
    if (!next) return;
    setShownMilestones((prev) => [...prev, next]);
    setJustHit(next);
    const timer = setTimeout(() => setJustHit(null), 3000);
    return () => clearTimeout(timer);
    // shownMilestones를 deps에 넣으면 자기 자신의 갱신으로 재실행되므로 reviewedCount만 감시한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewedCount]);

  function metaInfo() {
    if (done) return { text: "🎉 모두 다 골랐어요! 최종 검토로 이동해보세요", tone: "ok" as const };
    if (selectedCount < target) return { text: `목표보다 ${target - selectedCount}장 적어요`, tone: "warn" as const };
    if (selectedCount > target) return { text: `목표보다 ${selectedCount - target}장 많아요`, tone: "warn" as const };
    return { text: "목표 수에 딱 맞아요", tone: "ok" as const };
  }
  const info = metaInfo();

  // 하이드레이션 전 첫 프레임 — real-store.tsx 참고(서버/클라이언트 렌더 불일치 방지).
  if (!hydrated) {
    return <div style={{ minHeight: "100dvh", background: "#f3f4f5" }} />;
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#f3f4f5", fontFamily: "'Pretendard','Pretendard Variable',-apple-system,sans-serif" }}>
      <NicknamePrompt projectId={projectId} />
      <div style={{ maxWidth: 1440, margin: "0 auto", background: "#fff", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
        {/* 헤더 */}
        <div style={{ padding: "14px 20px 10px", borderBottom: "1px solid #dde1e4", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15, color: "#191918" }}>{project.name || "이름 없는 프로젝트"}</strong>
            <span style={{ flex: 1 }} />
            {activeParticipants(project).map((p) => {
              const isDone = project.participantDone[p.id];
              return (
                <span
                  key={p.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 11px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    background: isDone ? "#e7f5ee" : "#f7f6f4",
                    color: isDone ? "#0f8a5f" : "#5f5e5b",
                  }}
                >
                  <i style={{ width: 8, height: 8, borderRadius: "50%", background: p.hex, display: "block" }} />
                  {p.name} {isDone ? "✓완료" : "●고르는 중"}
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#5f5e5b" }}>
            <span>
              선택 <strong style={{ color: "#191918", fontSize: 14 }}>{selectedCount}</strong> / {target}장
            </span>
            <span>검토 {reviewedCount} / {project.photos.length}</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "#ecebe8", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, (reviewedCount / Math.max(1, project.photos.length)) * 100)}%`, height: "100%", background: "#ff4d00" }} />
          </div>
          {match !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ color: "#0f8a5f", fontWeight: 700 }}>
                {justHit ? `🎉 ${justHit}장 검토 완료!` : disagreeCount ? `의견 갈린 사진 ${disagreeCount}장` : ""}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#ff4d00", fontWeight: 700 }}>취향 일치율 {match}%</span>
            </div>
          )}
          <div className={ui.chipRow} style={{ flexWrap: "nowrap", overflowX: "auto", paddingBottom: 2 }}>
            <button type="button" className={`${ui.chip} ${tab === "all" ? ui.chipOn : ""}`} onClick={() => setTab("all")}>
              전체 {project.photos.length}
            </button>
            <button type="button" className={`${ui.chip} ${tab === "selected" ? ui.chipOn : ""}`} onClick={() => setTab("selected")}>
              선택 {selectedCount}
            </button>
            <button type="button" className={`${ui.chip} ${tab === "disagree" ? ui.chipOn : ""}`} onClick={() => setTab("disagree")}>
              의견 갈림 {disagreeCount}
            </button>
            <button type="button" className={`${ui.chip} ${tab === "mine" ? ui.chipOn : ""}`} onClick={() => setTab("mine")}>
              내 찜 {myLikeCount}
            </button>
          </div>
        </div>

        {/* 그리드 */}
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {list.length === 0 ? (
            <p className={ui.supportText} style={{ textAlign: "center", padding: "40px 10px" }}>
              조건에 맞는 사진이 없어요
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {list.map((p) => {
                const isSel = selectedIds.has(p.id);
                const state = project.photoStates[p.id];
                const colors = state?.color ?? [];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setOpenPhotoId(p.id)}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 4,
                      overflow: "hidden",
                      position: "relative",
                      border: isSel ? "2.5px solid #ff4d00" : "2.5px solid transparent",
                      padding: 0,
                      cursor: "pointer",
                      background: "#eee",
                    }}
                  >
                    <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    {state?.comment && <span style={{ position: "absolute", top: 5, left: 5, fontSize: 11 }}>💬</span>}
                    <span
                      role="checkbox"
                      aria-checked={isSel}
                      aria-label="선택"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(p.id);
                      }}
                      style={{
                        position: "absolute",
                        bottom: 5,
                        right: 5,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: "1.5px solid #fff",
                        background: isSel ? "#ff4d00" : "rgba(20,18,16,.35)",
                        color: "#fff",
                        fontSize: 12,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {isSel ? "✓" : ""}
                    </span>
                    {colors.length > 0 && (
                      <span style={{ position: "absolute", bottom: 5, left: 5, display: "flex", gap: 3 }}>
                        {colors.map((c) => {
                          const p2 = COLOR_PALETTE.find((x) => x.id === c);
                          return <i key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: p2?.hex ?? "#999", border: "1.3px solid rgba(255,255,255,.85)" }} />;
                        })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 하단 액션 — 기존 SelectionConfirmFooter 재사용(customerLight 테마) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 20px 10px", justifyContent: "flex-end" }}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSm}`}
            style={{ width: "auto", padding: "0 16px" }}
            onClick={handleShare}
          >
            {shareCopied ? "링크 복사됨 ✓" : "공유"}
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ width: "auto", padding: "0 16px" }} onClick={() => toggleDone(currentIdentity)}>
            {project.participantDone[currentIdentity] ? "다시 고를래요" : "다 골랐어요"}
          </button>
        </div>
        <SelectionConfirmFooter
          Y={selectedCount}
          N={target}
          position="static"
          disabled={selectedCount === 0}
          onConfirm={() => router.push(`/customer-select/${projectId}/review${shareToken ? `?share_token=${shareToken}` : ""}`)}
          buttonLabel="선택 확정하기"
          theme="customerLight"
          mobileGallery
          metaText={info.text}
        />
      </div>

      {/* 상세 모달 */}
      {openPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenPhotoId(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(10,9,8,.6)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", width: "100%", maxWidth: 480, borderRadius: "16px 16px 0 0", maxHeight: "88vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #dde1e4" }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#8b8985" }}>{getPhotoDisplayName(openPhoto)}</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#8b8985" }}>
                {openIndex + 1} / {project.photos.length}
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setOpenPhotoId(null)} style={{ background: "none", border: 0, fontSize: 20, color: "#8b8985" }}>
                ✕
              </button>
            </div>
            <div style={{ aspectRatio: "4/3" }}>
              <img src={openPhoto.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <div style={{ padding: "14px 16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStar(openPhoto.id, (project.photoStates[openPhoto.id]?.rating === n ? 0 : n) as StarRating | 0)}
                    style={{ background: "none", border: 0, fontSize: 22, padding: 0, color: (project.photoStates[openPhoto.id]?.rating ?? 0) >= n ? "#ff4d00" : "#dde1e4" }}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {activeParticipants(project).map((p) => {
                  const mineColor = p.id === currentIdentity;
                  const on = project.photoStates[openPhoto.id]?.color?.includes(p.id as ColorTag);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!mineColor}
                      onClick={() => toggleLike(openPhoto.id, p.id as ColorTag)}
                      title={`${p.name}${mineColor ? " (나)" : ""}`}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: p.hex,
                        opacity: mineColor ? 1 : 0.35,
                        border: on ? "2px solid #191918" : "2px solid #dde1e4",
                        cursor: mineColor ? "pointer" : "default",
                      }}
                    />
                  );
                })}
              </div>
              <button
                type="button"
                className={`${ui.btn} ${selectedIds.has(openPhoto.id) ? ui.btnPrimary : ""}`}
                onClick={() => toggleSelect(openPhoto.id)}
              >
                {selectedIds.has(openPhoto.id) ? "✓ 선택됨 (취소하려면 다시 클릭)" : "선택하기"}
              </button>
              <div className={ui.field}>
                <span className={ui.label}>보정 요청</span>
                <textarea
                  defaultValue={project.photoStates[openPhoto.id]?.comment ?? ""}
                  onBlur={(e) => setComment(openPhoto.id, e.target.value)}
                  placeholder="예: 얼굴 밝기만 살짝 올려주세요"
                  rows={3}
                  style={{ border: "1px solid #dde1e4", borderRadius: 8, padding: "10px 12px", fontSize: 13.5, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
