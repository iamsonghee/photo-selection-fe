"use client";

/** S7 — 최종 검토. */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronUp, FileSpreadsheet, FileText } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";
import { PhotoThumbnailFrame } from "@/components/ui/PhotoThumbnailFrame";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import { csvEscape, downloadTextFile, sanitizeFilenamePart } from "@/lib/text-file-download";
import {
  activeParticipants,
  bothDone,
  requestedPhotoIds,
  tasteMatchPct,
  useCustomerSelectStore,
} from "../../_lib/real-store";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import ui from "../../_lib/ui.module.css";

const INITIAL_VISIBLE_PHOTOS = 10;

function buildExportText(
  selected: { id: string; name: string }[],
  comments: Record<string, string | undefined>
): string {
  const lines = [`[선택 사진 ${selected.length}장]`];
  selected.forEach(({ id, name }) => {
    const comment = comments[id];
    lines.push(comment ? `${name} — ${comment}` : name);
  });
  return lines.join("\n");
}

export default function CustomerReviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const { project, hydrated, isOwner, currentIdentity, syncStatus } = useCustomerSelectStore();
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [showAllSelected, setShowAllSelected] = useState(false);
  const [linkCopyState, setLinkCopyState] = useState<"idle" | "loading" | "ok" | "fail">("idle");

  useEffect(() => {
    if (hydrated && !isOwner) router.replace(`/customer-select/${projectId}/select`);
  }, [hydrated, isOwner, projectId, router]);

  const selected = project.photos.filter((p) => project.selectedIds.includes(p.id));
  const collapseSelected = selected.length > INITIAL_VISIBLE_PHOTOS;
  const visibleSelected = showAllSelected || !collapseSelected ? selected : selected.slice(0, INITIAL_VISIBLE_PHOTOS);
  const requested = requestedPhotoIds(project);
  const match = tasteMatchPct(project);
  const done = bothDone(project);
  const waiting = activeParticipants(project).filter((p) => p.id !== currentIdentity && !project.participantDone[p.id]);
  const exportSelection = selected.map((photo) => ({ id: photo.id, name: getPhotoDisplayName(photo) }));
  const comments = Object.fromEntries(project.photos.map(({ id }) => [
    id,
    Object.entries(project.participantOpinions[id] ?? {})
      .filter(([, opinion]) => Boolean(opinion?.comment))
      .map(([color, opinion]) => `${project.participantNicknames[color] || "참가자"}: ${opinion?.comment}`)
      .join(" · ") || project.photoStates[id]?.comment,
  ]));
  const exportText = buildExportText(exportSelection, comments);
  const exportBaseName = `${sanitizeFilenamePart(project.name || "사진셀렉")}_selections`;

  async function copyResultLink() {
    setLinkCopyState("loading");
    try {
      const response = await fetch(`/api/customer-select/projects/${projectId}/result-link`);
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || "결과 링크를 만들지 못했습니다.");
      await navigator.clipboard.writeText(`${window.location.origin}${result.url}`);
      setLinkCopyState("ok");
    } catch {
      setLinkCopyState("fail");
    }
    setTimeout(() => setLinkCopyState("idle"), 2000);
  }

  function handleDownloadCsv() {
    const rows = exportSelection.map(({ id, name }) => [csvEscape(name), csvEscape(comments[id] ?? "")].join(","));
    downloadTextFile(`${exportBaseName}.csv`, ["파일명,코멘트", ...rows].join("\n"), "text/csv;charset=utf-8");
  }

  function handleDownloadTxt() {
    downloadTextFile(`${exportBaseName}.txt`, exportSelection.map(({ name }) => name).join("\n"), "text/plain;charset=utf-8");
  }

  // 하이드레이션 전 첫 프레임 — real-store.tsx 참고(서버/클라이언트 렌더 불일치 방지).
  if (!hydrated || !isOwner) {
    return <SystemLoadingScreen title="셀렉 결과를 불러오고 있어요" homeHref="/customer-select" />;
  }

  return (
    <>
    <CustomerSelectShell navigation={false}>
      <main className={ui.shellMain}>
      <div className={ui.page}>
        <div className={ui.header}>
          <button type="button" className={ui.back} aria-label="이전 화면" onClick={() => router.back()}>
            <ChevronLeft size={22} strokeWidth={1.8} aria-hidden />
          </button>
          <div className={ui.reviewTitleGroup}>
            <h1 className={ui.title}>{project.name}</h1>
            <p>최종 검토 · {selected.length.toLocaleString()}장 선택{requested.length > 0 ? ` · 보정 요청 ${requested.length.toLocaleString()}장` : ""}{match !== null ? ` · 취향 일치 ${match}%` : ""}</p>
          </div>
          <button type="button" className={ui.reviewEdit} onClick={() => router.push(`/customer-select/${projectId}/select`)}>선택 수정</button>
        </div>
        <div className={ui.body}>
          {syncStatus !== "connected" && <div className={`${ui.banner} ${ui.bannerWarn}`}><span className={ui.bannerHeadWarn}>{syncStatus === "offline" ? "최신 참여 상태를 확인하지 못하고 있어요" : "최신 참여 상태를 확인하고 있어요"}</span><span className={ui.bodyText}>연결되면 전달 단계를 계속할 수 있어요.</span></div>}

          {!done && waiting.length > 0 && (
            <div className={`${ui.banner} ${ui.bannerWarn}`}>
              <span className={ui.bannerHeadWarn}>
                {waiting.map((p) => p.name).join(", ")}님이 아직 고르는 중이에요
              </span>
              <span className={ui.bodyText}>그래도 지금 전달할 수 있어요.</span>
            </div>
          )}

          <section>
            <p className={ui.label} style={{ marginBottom: 8 }}>
              선택한 사진
            </p>
            <div className={ui.reviewGrid}>
              {visibleSelected.map((p, index) => (
                <button key={p.id} type="button" className={ui.reviewThumbButton} aria-label={`${getPhotoDisplayName(p)} 크게 보기`} onClick={() => setFocusIndex(index)}>
                  <PhotoThumbnailFrame className={ui.reviewThumb}>
                    <img src={p.url} alt="" />
                    {project.photoStates[p.id]?.comment && <span className={ui.reviewCommentBadge} aria-label="보정 요청 있음">요청</span>}
                  </PhotoThumbnailFrame>
                  <span className={ui.reviewFilename}>{getPhotoDisplayName(p)}</span>
                </button>
              ))}
            </div>
            {collapseSelected && (
              <button type="button" className={ui.reviewMore} aria-expanded={showAllSelected} onClick={() => setShowAllSelected((current) => !current)}>
                {showAllSelected ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                {showAllSelected ? "사진 접기" : `사진 ${(selected.length - INITIAL_VISIBLE_PHOTOS).toLocaleString()}장 더 보기`}
              </button>
            )}
          </section>

          {requested.length > 0 ? <section className={ui.reviewSection}>
            <p className={ui.label} style={{ marginBottom: 8 }}>
              보정 요청이 있는 사진
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {requested.map((id) => {
                  const p = project.photos.find((x) => x.id === id)!;
                  const comments = Object.entries(project.participantOpinions[id] ?? {})
                    .filter(([, opinion]) => Boolean(opinion?.comment))
                    .map(([color, opinion]) => `${project.participantNicknames[color] || "참가자"}: ${opinion?.comment}`);
                  if (!comments.length && project.photoStates[id]?.comment) comments.push(`기존 의견: ${project.photoStates[id].comment}`);
                  return (
                    <div key={id} className={ui.reqItem}>
                      <img src={p.previewUrl ?? p.url} alt="" />
                      <span>
                        <span className={ui.reqFilename}>{getPhotoDisplayName(p)}</span>
                        <span className={ui.reqText}>{comments.join(" · ")}</span>
                      </span>
                    </div>
                  );
                })}
            </div>
          </section> : null}

          <section className={ui.deliveryCard}>
            <div className={ui.deliveryHeading}>
              <h2>작가에게 전달하기</h2>
            </div>
            <div className={ui.deliveryMain}>
              <div>
                <p className={ui.bodyText}>링크를 복사해 작가님께 보내주세요. 같은 링크에 최신 결과가 반영돼요.</p>
              </div>
              <button type="button" className={`${ui.btn} ${ui.btnPrimary} ${ui.deliveryPrimary}`} disabled={selected.length === 0 || linkCopyState === "loading" || syncStatus !== "connected"} onClick={() => void copyResultLink()}>
                {linkCopyState === "loading" ? "링크 복사 중…" : linkCopyState === "ok" ? "복사했어요 ✓" : linkCopyState === "fail" ? "다시 복사하기" : "링크 복사"}
              </button>
            </div>
            <details className={ui.exportDetails}>
              <summary>파일로 내보내기</summary>
              <pre className={ui.exportBlock}>{exportText}</pre>
              <div className={ui.exportActions}>
                <PhotographerLightButton variant="outline" size="toolbar" aria-label="CSV 다운로드" onClick={handleDownloadCsv}><FileSpreadsheet size={16} aria-hidden />CSV 다운로드</PhotographerLightButton>
                <PhotographerLightButton variant="outline" size="toolbar" aria-label="TXT 다운로드" onClick={handleDownloadTxt}><FileText size={16} aria-hidden />TXT 다운로드</PhotographerLightButton>
              </div>
              <span className={ui.supportText}>CSV에는 참여자 의견이 함께 담기고, TXT에는 파일명만 담겨요.</span>
            </details>
          </section>

          <section className={ui.nextStepCard}>
            <div><h2>보정본도 확인할까요?</h2><p>선택한 사진의 보정본을 올려 함께 비교할 수 있어요.</p></div>
            <PhotographerLightButton variant="outline" onClick={() => router.push(`/customer-select/${projectId}/retouch/upload`)}>보정본 업로드</PhotographerLightButton>
          </section>
        </div>
        <PhotoFocusOverlay
          open={focusIndex !== null}
          src={focusIndex !== null ? selected[focusIndex]?.previewUrl ?? selected[focusIndex]?.url ?? "" : ""}
          alt={focusIndex !== null && selected[focusIndex] ? getPhotoDisplayName(selected[focusIndex]) : "선택 사진"}
          onClose={() => setFocusIndex(null)}
          onPrev={focusIndex !== null && focusIndex > 0 ? () => setFocusIndex(focusIndex - 1) : undefined}
          onNext={focusIndex !== null && focusIndex < selected.length - 1 ? () => setFocusIndex(focusIndex + 1) : undefined}
        />
      </div>
      </main>
    </CustomerSelectShell>
    </>
  );
}
