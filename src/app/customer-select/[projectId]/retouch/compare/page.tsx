"use client";

/** S11 — 원본·보정본 비교 검토. 누르는 동안 원본 표시는 기존 useHoldPreview를 재사용한다. */
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { useHoldPreview } from "@/hooks/useHoldPreview";
import { useRetouchData, setRetouchDecision, latestVersion, type RetouchPhoto, type RetouchVersion } from "../../../_lib/retouch-store";
import { RetouchErrorScreen } from "../../../_lib/RetouchErrorScreen";
import { CustomerSelectShell } from "../../../_lib/CustomerSelectShell";
import ui from "../../../_lib/ui.module.css";

function CompareCard({
  photo,
  version,
  onDecide,
  onOpen,
}: {
  photo: RetouchPhoto;
  version: RetouchVersion;
  onDecide: (decision: "confirmed" | "redo", reason?: string) => void;
  onOpen: () => void;
}) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState(version.redoReason ?? "");
  const { previewActive, beginHold, moveHold } = useHoldPreview({ enabled: true, resetKey: version.id });

  return (
    <div style={{ border: "1px solid #dde1e4", borderRadius: 14, overflow: "hidden" }}>
      <div
        onPointerDown={beginHold}
        onPointerMove={moveHold}
        style={{ aspectRatio: "4/3", position: "relative", background: "#eee", touchAction: "none" }}
      >
        <img src={previewActive ? photo.url : version.thumbUrl ?? ""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(20,18,16,.6)", color: "#fff", fontSize: 11, padding: "3px 8px", borderRadius: 999 }}>
          {previewActive ? "원본" : `보정본 ${version.round}회차`}
        </span>
        <span style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(20,18,16,.6)", color: "#fff", fontSize: 10.5, padding: "3px 8px", borderRadius: 999 }}>
          누르면 원본 보기
        </span>
        <button
          type="button"
          aria-label={`${photo.filename} 크게 보기`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          style={{ position: "absolute", top: 4, right: 4, width: 44, height: 44, border: 0, borderRadius: 22, background: "rgba(20,18,16,.6)", color: "#fff", fontSize: 18, cursor: "zoom-in" }}
        >
          ⛶
        </button>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <span className={ui.supportText}>{photo.filename}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSm} ${version.decision === "confirmed" ? ui.btnPrimary : ""}`}
            style={{ flex: 1 }}
            onClick={() => onDecide("confirmed")}
          >
            확정
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSm}`}
            style={{ flex: 1, borderColor: version.decision === "redo" ? "#ff4d00" : undefined, color: version.decision === "redo" ? "#ff4d00" : undefined }}
            onClick={() => setReasonOpen(true)}
          >
            재보정 요청
          </button>
        </div>
        {(reasonOpen || version.decision === "redo") && (
          <div className={ui.field}>
            <span className={ui.label}>재보정 사유</span>
            <textarea
              className={ui.input}
              style={{ height: "auto", padding: 10, resize: "vertical" }}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 피부톤이 너무 밝아요"
            />
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary} ${ui.btnSm}`}
              disabled={!reason.trim()}
              onClick={() => {
                onDecide("redo", reason.trim());
                setReasonOpen(false);
              }}
            >
              재보정 요청 확정
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RetouchComparePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { photos, error: loadError, loading, refresh } = useRetouchData(projectId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingVersionId, setSavingVersionId] = useState<string | null>(null);
  const [focusVersionId, setFocusVersionId] = useState<string | null>(null);

  const withVersion = useMemo(
    () => photos.map((p) => ({ photo: p, version: latestVersion(p) })).filter((x): x is { photo: RetouchPhoto; version: RetouchVersion } => !!x.version),
    [photos]
  );
  const withoutVersion = photos.filter((p) => latestVersion(p) === null);
  const reviewed = withVersion.filter((x) => x.version.decision !== "pending").length;
  const allReviewed = withVersion.length > 0 && withoutVersion.length === 0 && reviewed === withVersion.length;
  const focusIndex = withVersion.findIndex((item) => item.version.id === focusVersionId);
  const focused = focusIndex >= 0 ? withVersion[focusIndex] : null;

  async function handleDecide(versionId: string, decision: "confirmed" | "redo", reason?: string) {
    if (savingVersionId) return;
    setSavingVersionId(versionId);
    setSaveError(null);
    try {
      await setRetouchDecision(projectId, versionId, decision, reason);
      await refresh();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "검토 결과를 저장하지 못했어요.");
    } finally {
      setSavingVersionId(null);
    }
  }

  if (loading) {
    return <SystemLoadingScreen title="보정본을 불러오고 있어요" homeHref="/customer-select" />;
  }
  if (loadError) return <RetouchErrorScreen message={loadError} />;

  return (
    <CustomerSelectShell navigation={false}>
      <main className={ui.shellMain}>
        <div className={ui.page}>
          <div className={ui.header}>
            <button type="button" className={ui.back} onClick={() => router.back()}>
              ←
            </button>
            <h1 className={ui.title}>보정본 검토</h1>
          </div>
          <div className={ui.body}>
            <div className={ui.statPill} style={{ flex: "none" }}>
              <span className={ui.n}>{reviewed} / {withVersion.length}</span>
              <span className={ui.l}>검토 완료</span>
            </div>
            {withoutVersion.length > 0 && (
              <div className={`${ui.banner} ${ui.bannerWarn}`}>
                <span className={ui.bannerHeadWarn}>{withoutVersion.length}장은 아직 보정본을 못 받았어요</span>
                <span className={ui.bodyText}>도착하면 업로드 화면에서 이어서 올려주세요.</span>
              </div>
            )}
            {saveError && <span role="alert" className={ui.bannerHeadWarn}>{saveError}</span>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {withVersion.map(({ photo, version }) => (
                <CompareCard
                  key={photo.id}
                  photo={photo}
                  version={version}
                  onDecide={(d, r) => handleDecide(version.id, d, r)}
                  onOpen={() => setFocusVersionId(version.id)}
                />
              ))}
              {withVersion.length === 0 && (
                <div className={`${ui.banner} ${ui.bannerWarn}`}>
                  <span className={ui.bannerHeadWarn}>검토할 보정본이 없어요</span>
                  <span className={ui.bodyText}>보정본을 먼저 업로드한 뒤 다시 확인해 주세요.</span>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSm}`}
                    onClick={() => router.push(`/customer-select/${projectId}/retouch/upload`)}
                  >
                    보정본 업로드로 이동
                  </button>
                </div>
              )}
            </div>
          </div>
          <PhotographerPageActionBar maxWidth={1120} actions={<PhotographerLightButton
              disabled={!allReviewed || Boolean(savingVersionId)}
              onClick={() => router.push(`/customer-select/${projectId}/retouch/export`)}
            >
              검토 마치기{!allReviewed && withVersion.length > 0 ? ` (${withVersion.length - reviewed}장 남음)` : ""}
            </PhotographerLightButton>} />
          <PhotoFocusOverlay
            open={Boolean(focused)}
            src={focused?.version.previewUrl ?? focused?.version.thumbUrl ?? focused?.photo.previewUrl ?? focused?.photo.url ?? ""}
            originalSrc={focused?.photo.previewUrl ?? focused?.photo.url}
            alt={focused?.photo.filename ?? "보정본"}
            onClose={() => setFocusVersionId(null)}
            onPrev={focusIndex > 0 ? () => setFocusVersionId(withVersion[focusIndex - 1].version.id) : undefined}
            onNext={focusIndex >= 0 && focusIndex < withVersion.length - 1 ? () => setFocusVersionId(withVersion[focusIndex + 1].version.id) : undefined}
          />
        </div>
      </main>
    </CustomerSelectShell>
  );
}
