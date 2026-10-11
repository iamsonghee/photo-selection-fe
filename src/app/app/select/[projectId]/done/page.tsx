"use client";

/** S13 — 완료. */
import { useParams } from "next/navigation";
import { useState } from "react";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { ProjectBodySkeleton } from "../../_lib/ProjectBodySkeleton";
import { useRetouchData, markRetouchDone, latestVersion } from "../../_lib/retouch-store";
import { RetouchErrorScreen } from "../../_lib/RetouchErrorScreen";
import ui from "../../_lib/ui.module.css";

export default function CustomerDonePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { photos, retouchDone, error: loadError, loading, refresh } = useRetouchData(projectId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const confirmedCount = photos.filter((p) => latestVersion(p)?.decision === "confirmed").length;

  async function handleDone() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await markRetouchDone(projectId, true);
      await refresh();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "완료 상태를 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <ProjectBodySkeleton variant="cards" label="완료 상태를 확인하고 있어요" />;
  }
  if (loadError) return <RetouchErrorScreen message={loadError} />;

  return (
    <>
      <main className={ui.shellMain}>
        <div className={ui.page}>
          <div className={ui.header}>
            <h1 className={ui.title}>완료</h1>
          </div>
          <div className={ui.body}>
            <div
              style={{ width: 68, height: 68, borderRadius: "50%", background: "var(--surface-raised)", color: "var(--foreground)", display: "grid", placeItems: "center", fontSize: 30, margin: "0 auto" }}
            >
              ✓
            </div>
            <p className={ui.entryTitle} style={{ textAlign: "center" }}>
              {retouchDone ? "모든 보정이 완료됐어요" : "확정된 보정본을 확인해 주세요"}
            </p>
            <div className={ui.statPill} style={{ flex: "none" }}>
              <span className={ui.n}>{confirmedCount}장</span>
              <span className={ui.l}>확정된 사진</span>
            </div>
            <p className={ui.supportText} style={{ textAlign: "center" }}>
              새 보정본을 받으면 언제든 업로드해서 이어서 진행할 수 있어요.
            </p>
            {saveError && <p role="alert" className={ui.bannerHeadWarn}>{saveError}</p>}
          </div>
          <PhotographerPageActionBar maxWidth={1120} actions={<PhotographerLightButton size="work-panel" disabled={retouchDone} pending={saving} pendingLabel="저장 중…" onClick={handleDone}>{retouchDone ? "완료로 표시됨 ✓" : "완료로 표시"}</PhotographerLightButton>} />
        </div>
      </main>
    </>
  );
}
