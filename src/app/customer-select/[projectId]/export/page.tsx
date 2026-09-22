"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrandLogoBar } from "@/components/BrandLogo";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import { csvEscape, downloadTextFile, sanitizeFilenamePart } from "@/lib/text-file-download";
import { activeParticipants, useCustomerSelectStore } from "../../_lib/real-store";
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

export default function CustomerExportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { project, hydrated, isOwner, currentIdentity, syncStatus, syncNow, update } = useCustomerSelectStore();
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const [reopenConfirm, setReopenConfirm] = useState(false);
  const [deliverConfirm, setDeliverConfirm] = useState(false);
  const [changingState, setChangingState] = useState(false);
  const [checkingLatest, setCheckingLatest] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);

  const selected = project.photos
    .filter((p) => project.selectedIds.includes(p.id))
    .map((p) => ({ id: p.id, name: getPhotoDisplayName(p) }));
  const comments = Object.fromEntries(project.photos.map(({ id }) => [
    id,
    Object.entries(project.participantOpinions[id] ?? {})
      .filter(([, opinion]) => Boolean(opinion?.comment))
      .map(([color, opinion]) => `${project.participantNicknames[color] || "참가자"}: ${opinion?.comment}`)
      .join(" · ") || project.photoStates[id]?.comment,
  ]));
  const text = buildExportText(selected, comments);
  const exportBaseName = `${sanitizeFilenamePart(project.name || "사진셀렉")}_selections`;
  const waiting = activeParticipants(project).filter((participant) => participant.id !== currentIdentity && !project.participantDone[participant.id]);

  useEffect(() => {
    if (hydrated && !isOwner) router.replace(`/customer-select/${projectId}/select`);
  }, [hydrated, isOwner, projectId, router]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("ok");
    } catch {
      setCopyState("fail");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  }

  function handleDownloadCsv() {
    const rows = selected.map(({ id, name }) => [csvEscape(name), csvEscape(comments[id] ?? "")].join(","));
    downloadTextFile(`${exportBaseName}.csv`, ["파일명,코멘트", ...rows].join("\n"), "text/csv;charset=utf-8");
  }

  function handleDownloadTxt() {
    downloadTextFile(`${exportBaseName}.txt`, selected.map(({ name }) => name).join("\n"), "text/plain;charset=utf-8");
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
    return <SystemLoadingScreen title="전달 내용을 준비하고 있어요" homeHref="/customer-select" />;
  }

  return (
    <div className={ui.shell}>
      <header className={ui.brandbar}>
        <BrandLogoBar size="sm" href="/customer-select" variant="default" />
      </header>
      <div className={ui.shellMain}>
      <div className={ui.page}>
        <div className={ui.header}>
          <button type="button" className={ui.back} onClick={() => router.back()}>
            ←
          </button>
          <h1 className={ui.title}>작가님께 전달하기</h1>
        </div>
        <div className={ui.body}>
          <p className={ui.bodyText}>파일명 목록을 복사하거나 파일로 받아 작가님께 보내주세요.</p>
          <pre className={ui.exportBlock}>{text}</pre>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={`${ui.btn} ${ui.btnPrimary} ${ui.btnSm}`} style={{ flex: 1 }} onClick={handleCopy}>
              {copyState === "ok" ? "복사했어요 ✓" : copyState === "fail" ? "복사 실패" : "📋 복사하기"}
            </button>
            <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ flex: 1 }} aria-label="CSV 다운로드" onClick={handleDownloadCsv}>
              CSV
            </button>
            <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ flex: 1 }} aria-label="TXT 다운로드" onClick={handleDownloadTxt}>
              TXT
            </button>
          </div>
          <span className={ui.supportText}>CSV에는 참여자 의견이 함께 담기고, TXT에는 파일명만 담겨요.</span>
        </div>
        <PhotographerPageActionBar
          maxWidth={1120}
          leading={<div><p className="text-sm font-semibold text-foreground">{project.exported ? "셀렉 전달 완료" : project.deliveryCount > 0 ? "다시 선택 중" : "작가에게 전달하셨나요?"}</p>{waiting.length > 0 && !project.exported ? <p className="mt-1 text-xs font-semibold text-danger">{waiting.map((participant) => participant.name).join(", ")}님이 아직 고르는 중이에요.</p> : null}{project.lastDeliveredAt ? <p className="mt-1 text-xs text-muted-foreground">최근 전달 {new Date(project.lastDeliveredAt).toLocaleString("ko-KR")} · 총 {project.deliveryCount.toLocaleString()}회</p> : null}{syncStatus !== "connected" ? <p className="mt-1 text-xs font-semibold text-danger">최신 참여 상태를 확인하고 있어요.</p> : null}{stateError ? <p role="alert" className="mt-1 text-xs font-semibold text-danger">{stateError}</p> : null}</div>}
          actions={<>
            {project.exported
              ? <PhotographerLightButton variant="secondary" onClick={() => setReopenConfirm(true)}>다시 선택하기</PhotographerLightButton>
              : <PhotographerLightButton disabled={syncStatus !== "connected"} pending={changingState || checkingLatest} pendingLabel={checkingLatest ? "최신 상태 확인 중…" : "저장 중…"} onClick={() => void requestDelivery(false)}>{project.deliveryCount > 0 ? "수정한 결과를 다시 전달했어요" : "작가에게 전달했어요"}</PhotographerLightButton>}
            {project.exported ? <PhotographerLightButton onClick={() => router.push(`/customer-select/${projectId}/retouch/upload`)}>보정본 업로드하기</PhotographerLightButton> : null}
          </>}
        />
      </div>
      </div>
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
    </div>
  );
}
