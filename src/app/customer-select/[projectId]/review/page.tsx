"use client";

/** S7 — 최종 검토. */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
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
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyState("ok");
    } catch {
      setCopyState("fail");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  }

  async function handleResultLinkCopy() {
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
      return;
    }
    setDeliverConfirm(false);
    setReopenConfirm(false);
    if (!exported) router.push(`/customer-select/${projectId}/select`);
  }

  async function requestDelivery(confirmed: boolean) {
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
    await setDelivered(true);
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
          <h1 className={ui.title}>최종 검토·전달</h1>
        </div>
        <div className={ui.body}>
          {syncStatus !== "connected" && <div className={`${ui.banner} ${ui.bannerWarn}`}><span className={ui.bannerHeadWarn}>{syncStatus === "offline" ? "최신 참여 상태를 확인하지 못하고 있어요" : "최신 참여 상태를 확인하고 있어요"}</span><span className={ui.bodyText}>연결되면 전달 단계를 계속할 수 있어요.</span></div>}
          <div style={{ display: "flex", gap: 8 }}>
            <div className={ui.statPill}>
              <span className={ui.n}>{selected.length}장</span>
              <span className={ui.l}>선택한 사진</span>
            </div>
            <div className={ui.statPill}>
              <span className={ui.n}>{requested.length}장</span>
              <span className={ui.l}>보정 요청</span>
            </div>
            {match !== null && (
              <div className={`${ui.statPill} ${ui.statPillAccent}`}>
                <span className={ui.n}>{match}%</span>
                <span className={ui.l}>취향 일치율</span>
              </div>
            )}
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
              {selected.slice(0, 12).map((p) => (
                <button key={p.id} type="button" className={ui.reviewThumbButton} aria-label={`${getPhotoDisplayName(p)} 크게 보기`} onClick={() => setFocusIndex(selected.indexOf(p))}>
                  <PhotoThumbnailFrame active className={ui.reviewThumb}>
                    <img src={p.url} alt="" />
                    {project.photoStates[p.id]?.comment && <span>💬</span>}
                  </PhotoThumbnailFrame>
                </button>
              ))}
              {selected.length > 12 && (
                <div
                  style={{
                    aspectRatio: "1",
                    borderRadius: 4,
                    background: "#f7f6f4",
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 12,
                    color: "#8b8985",
                  }}
                >
                  +{selected.length - 12}
                </div>
              )}
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
                      <span className="fn">{getPhotoDisplayName(p)}</span>
                      <span className="tx">{comments.join(" · ")}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <hr className={ui.divider} />

          <div>
            <p className={ui.label} style={{ marginBottom: 8 }}>작가에게 전달할 내용</p>
            <p className={ui.bodyText} style={{ marginBottom: 8 }}>파일명 목록을 복사하거나 파일로 받아 작가님께 보내주세요.</p>
            <pre className={ui.exportBlock}>{exportText}</pre>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={`${ui.btn} ${ui.btnPrimary} ${ui.btnSm}`} style={{ flex: 1 }} onClick={handleCopy}>
                {copyState === "ok" ? "복사했어요 ✓" : copyState === "fail" ? "복사 실패" : "📋 복사하기"}
              </button>
              <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ flex: 1 }} aria-label="CSV 다운로드" onClick={handleDownloadCsv}>CSV</button>
              <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ flex: 1 }} aria-label="TXT 다운로드" onClick={handleDownloadTxt}>TXT</button>
            </div>
            <span className={ui.supportText}>CSV에는 참여자 의견이 함께 담기고, TXT에는 파일명만 담겨요.</span>
          </div>

          {project.exported ? (
            <div className={`${ui.banner} ${ui.bannerOk}`}>
              <strong className={ui.bannerHeadOk}>작가님이 링크로 바로 확인할 수 있어요</strong>
              <span className={ui.supportText}>선택 사진과 의견을 읽기 전용으로 보여주며, 다시 전달하면 같은 링크에 최신 결과가 반영돼요.</span>
              <button type="button" className={`${ui.btn} ${ui.btnSm}`} disabled={linkCopyState === "loading"} onClick={() => void handleResultLinkCopy()}>
                {linkCopyState === "loading" ? "링크 만드는 중…" : linkCopyState === "ok" ? "링크를 복사했어요 ✓" : linkCopyState === "fail" ? "복사하지 못했어요" : "작가용 결과 링크 복사"}
              </button>
            </div>
          ) : null}
        </div>
        <PhotographerPageActionBar
          maxWidth={1120}
          leading={<div><p className="text-sm font-semibold text-foreground">{project.exported ? "셀렉 전달 완료" : project.deliveryCount > 0 ? "다시 선택 중" : "작가에게 전달하셨나요?"}</p>{waiting.length > 0 && !project.exported ? <p className="mt-1 text-xs font-semibold text-danger">{waiting.map((participant) => participant.name).join(", ")}님이 아직 고르는 중이에요.</p> : null}{project.lastDeliveredAt ? <p className="mt-1 text-xs text-muted-foreground">최근 전달 {new Date(project.lastDeliveredAt).toLocaleString("ko-KR")} · 총 {project.deliveryCount.toLocaleString()}회</p> : null}{syncStatus !== "connected" ? <p className="mt-1 text-xs font-semibold text-danger">최신 참여 상태를 확인하고 있어요.</p> : null}{stateError ? <p role="alert" className="mt-1 text-xs font-semibold text-danger">{stateError}</p> : null}</div>}
          actions={<>
            {project.exported
              ? <PhotographerLightButton variant="secondary" onClick={() => setReopenConfirm(true)}>다시 선택하기</PhotographerLightButton>
              : <><PhotographerLightButton variant="secondary" onClick={() => router.push(`/customer-select/${projectId}/select`)}>더 고르기</PhotographerLightButton><PhotographerLightButton disabled={selected.length === 0 || syncStatus !== "connected"} pending={changingState || checkingLatest} pendingLabel={checkingLatest ? "최신 상태 확인 중…" : "저장 중…"} onClick={() => void requestDelivery(false)}>{project.deliveryCount > 0 ? "수정한 결과를 다시 전달했어요" : "작가에게 전달했어요"}</PhotographerLightButton></>}
            {project.exported ? <PhotographerLightButton onClick={() => router.push(`/customer-select/${projectId}/retouch/upload`)}>보정본 업로드하기</PhotographerLightButton> : null}
          </>}
        />
        <PhotoFocusOverlay
          open={focusIndex !== null}
          src={focusIndex !== null ? selected[focusIndex]?.previewUrl ?? selected[focusIndex]?.url ?? "" : ""}
          alt={focusIndex !== null && selected[focusIndex] ? getPhotoDisplayName(selected[focusIndex]) : "선택 사진"}
          onClose={() => setFocusIndex(null)}
          onPrev={focusIndex !== null && focusIndex > 0 ? () => setFocusIndex(focusIndex - 1) : undefined}
          onNext={focusIndex !== null && focusIndex < Math.min(selected.length, 12) - 1 ? () => setFocusIndex(focusIndex + 1) : undefined}
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
        onConfirm={() => void requestDelivery(true)}
      /> : null}
    </>
  );
}
