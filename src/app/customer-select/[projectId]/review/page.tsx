"use client";

/** S7 — 최종 검토. */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";
import { PhotoThumbnailFrame } from "@/components/ui/PhotoThumbnailFrame";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
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
  const { project, hydrated, isOwner, currentIdentity, syncStatus, syncNow, update } = useCustomerSelectStore();
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [linkCopyState, setLinkCopyState] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [reopenConfirm, setReopenConfirm] = useState(false);
  const [deliverConfirm, setDeliverConfirm] = useState(false);
  const [changingState, setChangingState] = useState(false);
  const [checkingLatest, setCheckingLatest] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !isOwner) router.replace(`/customer-select/${projectId}/select`);
  }, [hydrated, isOwner, projectId, router]);

  const selected = project.photos.filter((p) => project.selectedIds.includes(p.id));
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

  async function setDelivered(exported: boolean) {
    setChangingState(true);
    setStateError(null);
    const updated = await update({ exported });
    setChangingState(false);
    if (!updated) {
      setStateError("상태를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return false;
    }
    setDeliverConfirm(false);
    setReopenConfirm(false);
    if (!exported) router.push(`/customer-select/${projectId}/select`);
    return true;
  }

  async function requestLinkCopy(confirmed: boolean) {
    if (project.exported) {
      await copyResultLink();
      return;
    }
    setCheckingLatest(true);
    setStateError(null);
    const latest = await syncNow();
    setCheckingLatest(false);
    if (!latest) {
      setStateError("최신 참여 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const latestWaiting = Object.entries(latest.participantNicknames)
      .filter(([color]) => color !== currentIdentity && !latest.participantDone[color])
      .map(([, nickname]) => nickname || "참가자");
    if (latestWaiting.length && !confirmed) {
      setDeliverConfirm(true);
      return;
    }
    if (await setDelivered(true)) await copyResultLink();
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
          <button type="button" className={ui.back} onClick={() => router.back()}>
            ←
          </button>
          <div className={ui.reviewTitleGroup}>
            <span>{project.name}</span>
            <h1 className={ui.title}>최종 검토</h1>
          </div>
          <div className={ui.reviewHeaderAction}>
            {project.exported
              ? <PhotographerLightButton variant="secondary" onClick={() => setReopenConfirm(true)}>다시 선택하기</PhotographerLightButton>
              : <PhotographerLightButton variant="secondary" onClick={() => router.push(`/customer-select/${projectId}/select`)}>더 고르기</PhotographerLightButton>}
          </div>
        </div>
        <div className={ui.body}>
          {syncStatus !== "connected" && <div className={`${ui.banner} ${ui.bannerWarn}`}><span className={ui.bannerHeadWarn}>{syncStatus === "offline" ? "최신 참여 상태를 확인하지 못하고 있어요" : "최신 참여 상태를 확인하고 있어요"}</span><span className={ui.bodyText}>연결되면 전달 단계를 계속할 수 있어요.</span></div>}
          <div className={ui.reviewSummary} aria-label="최종 선택 요약">
            <span><strong>{selected.length}장</strong> 선택</span>
            <span><strong>{requested.length}장</strong> 보정 요청</span>
            {match !== null ? <span><strong>{match}%</strong> 취향 일치</span> : null}
          </div>

          {!done && waiting.length > 0 && (
            <div className={`${ui.banner} ${ui.bannerWarn}`}>
              <span className={ui.bannerHeadWarn}>
                {waiting.map((p) => p.name).join(", ")}님이 아직 고르는 중이에요
              </span>
              <span className={ui.bodyText}>그래도 지금 전달할 수 있어요.</span>
            </div>
          )}

          <div>
            <p className={ui.label} style={{ marginBottom: 8 }}>
              선택한 사진
            </p>
            <div className={ui.reviewGrid}>
              {selected.map((p, index) => (
                <button key={p.id} type="button" className={ui.reviewThumbButton} aria-label={`${getPhotoDisplayName(p)} 크게 보기`} onClick={() => setFocusIndex(index)}>
                  <PhotoThumbnailFrame className={ui.reviewThumb}>
                    <img src={p.url} alt="" />
                    {project.photoStates[p.id]?.comment && <span className={ui.reviewCommentBadge} aria-label="보정 요청 있음">요청</span>}
                  </PhotoThumbnailFrame>
                </button>
              ))}
            </div>
          </div>

          <hr className={ui.divider} />

          <div>
            <p className={ui.label} style={{ marginBottom: 8 }}>
              보정 요청이 있는 사진
            </p>
            {requested.length === 0 ? (
              <p className={ui.bodyText}>아직 작성한 보정 요청이 없어요.</p>
            ) : (
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
            )}
          </div>

          <hr className={ui.divider} />

          <section className={ui.deliveryCard}>
            <div className={ui.deliveryHeading}>
              <p className={ui.label}>작가에게 전달하기</p>
              {project.exported ? <span>전달 완료</span> : null}
            </div>
            <p className={ui.bodyText}>링크를 복사해 작가님께 보내주세요. 다시 전달하면 같은 링크에 최신 결과가 반영돼요.</p>
            {project.lastDeliveredAt ? <p className={ui.deliveryMeta}>최근 전달 {new Date(project.lastDeliveredAt).toLocaleString("ko-KR")} · 총 {project.deliveryCount.toLocaleString()}회</p> : null}
            {stateError ? <p role="alert" className={ui.deliveryError}>{stateError}</p> : null}
            <button type="button" className={`${ui.btn} ${ui.btnPrimary} ${ui.deliveryPrimary}`} disabled={selected.length === 0 || linkCopyState === "loading" || changingState || checkingLatest || syncStatus !== "connected"} onClick={() => void requestLinkCopy(false)}>
              {linkCopyState === "loading" || changingState || checkingLatest ? "링크 복사 중…" : linkCopyState === "ok" ? "복사했어요 ✓" : linkCopyState === "fail" ? "다시 복사하기" : "링크 복사"}
            </button>
            {project.exported ? <div className={ui.deliveryActions}><PhotographerLightButton onClick={() => router.push(`/customer-select/${projectId}/retouch/upload`)}>보정본 업로드하기</PhotographerLightButton></div> : null}
            <details className={ui.exportDetails}>
              <summary>파일로 내보내기</summary>
              <pre className={ui.exportBlock}>{exportText}</pre>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ flex: 1 }} aria-label="CSV 다운로드" onClick={handleDownloadCsv}>CSV 다운로드</button>
                <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ flex: 1 }} aria-label="TXT 다운로드" onClick={handleDownloadTxt}>TXT 다운로드</button>
              </div>
              <span className={ui.supportText}>CSV에는 참여자 의견이 함께 담기고, TXT에는 파일명만 담겨요.</span>
            </details>
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
      {reopenConfirm ? <SelectionConfirmDialog
        title="사진을 다시 선택할까요?"
        description={<>전달 완료 상태가 해제되고 선택 화면으로 돌아갑니다.<br />현재 선택은 그대로 유지돼요.</>}
        confirmLabel="다시 선택하기"
        busyLabel="여는 중…"
        confirming={changingState || checkingLatest}
        error={stateError}
        onCancel={() => { if (!changingState) { setReopenConfirm(false); setStateError(null); } }}
        onConfirm={() => void setDelivered(false)}
      /> : null}
      {deliverConfirm ? <SelectionConfirmDialog
        title="아직 고르는 사람이 있어요"
        description={<>{waiting.map((participant) => participant.name).join(", ")}님이 아직 완료하지 않았어요.<br />그래도 현재 선택 결과를 전달할까요?</>}
        confirmLabel="그래도 전달하기"
        busyLabel="저장 중…"
        confirming={changingState}
        error={stateError}
        onCancel={() => { if (!changingState) { setDeliverConfirm(false); setStateError(null); } }}
        onConfirm={() => void requestLinkCopy(true)}
      /> : null}
    </>
  );
}
