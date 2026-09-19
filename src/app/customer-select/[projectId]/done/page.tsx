"use client";

/** S13 — 완료. */
import { useParams, useSearchParams } from "next/navigation";
import { BrandLogoBar } from "@/components/BrandLogo";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { useRetouchData, markRetouchDone, latestVersion } from "../../_lib/retouch-store";
import ui from "../../_lib/ui.module.css";

export default function CustomerDonePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const shareToken = useSearchParams().get("share_token");
  const { photos, retouchDone, loading, refresh } = useRetouchData(projectId, shareToken);

  const confirmedCount = photos.filter((p) => latestVersion(p)?.decision === "confirmed").length;

  async function handleDone() {
    await markRetouchDone(projectId, shareToken, true);
    await refresh();
  }

  if (loading) {
    return (
      <div className={ui.shell}>
        <header className={ui.brandbar}>
          <BrandLogoBar size="sm" href="/customer-select" variant="default" />
        </header>
      </div>
    );
  }

  return (
    <div className={ui.shell}>
      <header className={ui.brandbar}>
        <BrandLogoBar size="sm" href="/customer-select" variant="default" />
      </header>
      <div className={ui.shellMain}>
        <div className={ui.page} style={{ minHeight: "unset" }}>
          <div className={ui.header}>
            <h1 className={ui.title}>완료</h1>
          </div>
          <div className={ui.body}>
            <div
              style={{ width: 68, height: 68, borderRadius: "50%", background: "#fff3ed", color: "#ff4d00", display: "grid", placeItems: "center", fontSize: 30, margin: "0 auto" }}
            >
              ✓
            </div>
            <p className={ui.entryTitle} style={{ textAlign: "center" }}>
              {retouchDone ? "모든 보정이 완료됐어요" : "확정된 보정본을 확인해주세요"}
            </p>
            <div className={ui.statPill}>
              <span className={ui.n}>{confirmedCount}장</span>
              <span className={ui.l}>확정된 사진</span>
            </div>
            <p className={ui.supportText} style={{ textAlign: "center" }}>
              새 보정본을 받으면 언제든 업로드해서 이어서 진행할 수 있어요.
            </p>
          </div>
          <PhotographerPageActionBar maxWidth={1120} actions={<PhotographerLightButton disabled={retouchDone} onClick={handleDone}>{retouchDone ? "완료로 표시됨 ✓" : "완료로 표시"}</PhotographerLightButton>} />
        </div>
      </div>
    </div>
  );
}
