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
import { getFilteredPhotos, type GalleryFilterState } from "@/lib/gallery-filter";
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import CustomerSelectionViewer, { type CustomerSelectionViewerAdapter } from "@/components/customer/CustomerSelectionViewer";
import { SelectionContextOverride, type SelectionContextValue } from "@/contexts/SelectionContext";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import type { Project, StarRating } from "@/types";
import {
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
  const { project, hydrated, currentIdentity, shareUrl, toggleSelect, toggleLike, setStar, setComment, toggleDone, setNickname, saveError, clearSaveError } =
    useCustomerSelectStore();

  const [tab, setTab] = useState<Tab>("all");
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [thumbQueue] = useState(() => createThumbLoadQueue(12));

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

  const viewerSelection = useMemo<SelectionContextValue>(() => ({
    project: {
      id: project.id,
      name: project.name,
      requiredCount: project.target,
      photoCount: project.photoCount,
      status: "selecting",
    } as Project,
    photos: project.photos,
    photoGroups: [],
    selectedIds,
    photoStates: project.photoStates,
    Y: selectedCount,
    N: project.target,
    toggle: (photoId) => {
      const selected = selectedIds.has(photoId);
      toggleSelect(photoId);
      return selected ? "deselected" : "selected";
    },
    includeRecommendations: async () => "failed",
    selectionSaving: false,
    isSelected: (photoId) => selectedIds.has(photoId),
    updatePhotoState: (photoId, patch) => {
      if ("rating" in patch) setStar(photoId, (patch.rating ?? 0) as StarRating | 0);
      if ("comment" in patch) setComment(photoId, patch.comment ?? "");
    },
    toggleColor: toggleLike,
    projectId,
    projectStatus: "selecting",
    loading: false,
    commentSaveStates: {},
    saveError,
    clearSaveError,
  }), [project, selectedIds, selectedCount, toggleSelect, setStar, setComment, toggleLike, projectId, saveError, clearSaveError]);

  const viewerAdapter = useMemo<CustomerSelectionViewerAdapter | null>(() => openPhotoId ? ({
    token: projectId,
    photoId: openPhotoId,
    participant: {
      color: currentIdentity,
      initial: (project.participantNicknames[currentIdentity] || "나").slice(0, 2),
    },
    roster: project.participantNicknames,
    viewerHref: (photoId) => `#photo-${photoId}`,
    galleryHref: "#",
    onClose: () => setOpenPhotoId(null),
    onReview: () => router.push(`/customer-select/${projectId}/review${shareToken ? `?share_token=${shareToken}` : ""}`),
    onSaveParticipant: (participant) => setNickname(participant.initial),
  }) : null, [openPhotoId, projectId, currentIdentity, project.participantNicknames, router, shareToken, setNickname]);

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
    <div className={ui.selectWorkspace}>
      <NicknamePrompt projectId={projectId} />
      {saveError && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", background: "#fff0ea", borderBottom: "1px solid #ffd9c2", fontSize: 12.5, color: "#ff4d00", fontWeight: 600 }}>
          <span style={{ flex: 1 }}>{saveError}</span>
          <button type="button" onClick={clearSaveError} style={{ border: "none", background: "transparent", color: "#ff4d00", fontSize: 12.5, fontWeight: 700 }}>
            닫기
          </button>
        </div>
      )}
      <div className={ui.selectFrame}>
        {/* 헤더 */}
        <div className={ui.selectHeader}>
          <div className={ui.selectHeaderTop}>
            <strong className={ui.selectProjectName}>{project.name || "이름 없는 프로젝트"}</strong>
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
          <div className={ui.selectStats}>
            <span>
              선택 <strong style={{ color: "#191918", fontSize: 14 }}>{selectedCount}</strong> / {target}장
            </span>
            <span>검토 {reviewedCount} / {project.photos.length}</span>
          </div>
          <div className={ui.selectProgress}>
            <div style={{ width: `${Math.min(100, (reviewedCount / Math.max(1, project.photos.length)) * 100)}%`, height: "100%", background: "#ff4d00" }} />
          </div>
          {match !== null && (
            <div className={ui.selectInsights}>
              <span style={{ color: "#0f8a5f", fontWeight: 700 }}>
                {justHit ? `🎉 ${justHit}장 검토 완료!` : disagreeCount ? `의견 갈린 사진 ${disagreeCount}장` : ""}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#ff4d00", fontWeight: 700 }}>취향 일치율 {match}%</span>
            </div>
          )}
          <div className={ui.selectTabs}>
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
        <div className={ui.selectGallery}>
          {list.length === 0 ? (
            <p className={ui.supportText} style={{ textAlign: "center", padding: "40px 10px" }}>
              조건에 맞는 사진이 없어요
            </p>
          ) : (
            <div className={ui.selectGrid}>
              {list.map((p) => {
                const isSel = selectedIds.has(p.id);
                const state = project.photoStates[p.id];
                const colors = state?.color ?? [];
                return (
                  <GalleryPhotoCard
                    key={p.id}
                    token={projectId}
                    href="#"
                    photo={p}
                    selected={isSel}
                    rating={state?.rating}
                    colorTags={colors}
                    hasComment={Boolean(state?.comment)}
                    showGroupBadge={false}
                    restCount={0}
                    totalCount={0}
                    selectedCount={0}
                    isGroupExpanded={false}
                    presignedThumb={p.url}
                    thumbQueue={thumbQueue}
                    viewerQueryString=""
                    density={3}
                    onPhotoClick={(event) => { event.preventDefault(); setOpenPhotoId(p.id); }}
                    onCheckClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleSelect(p.id); }}
                    onGroupBadgeClick={() => {}}
                    onRate={(photoId, rating) => setStar(photoId, (rating ?? 0) as StarRating | 0)}
                    onThumbError={() => {}}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* 하단 액션 — 기존 SelectionConfirmFooter 재사용(customerLight 테마) */}
        <div className={ui.selectActions}>
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

      {viewerAdapter && (
        <SelectionContextOverride value={viewerSelection}>
          <CustomerSelectionViewer adapter={viewerAdapter} />
        </SelectionContextOverride>
      )}
    </div>
  );
}
