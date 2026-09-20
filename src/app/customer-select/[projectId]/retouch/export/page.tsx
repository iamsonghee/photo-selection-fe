"use client";

/** S12 — 재보정 요청 전달. 1차 S8과 같은 형식(복사/CSV/TXT — 복사만 실동작, 나머지는 실제 서비스에서). */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BrandLogoBar } from "@/components/BrandLogo";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { useRetouchData, latestVersion } from "../../../_lib/retouch-store";
import ui from "../../../_lib/ui.module.css";

export default function RetouchExportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const shareToken = useSearchParams().get("share_token");
  const router = useRouter();
  const { photos, loading } = useRetouchData(projectId, shareToken);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  const redoList = useMemo(() => {
    return photos
      .map((p) => ({ photo: p, version: latestVersion(p) }))
      .filter((x) => x.version?.decision === "redo") as { photo: (typeof photos)[number]; version: NonNullable<ReturnType<typeof latestVersion>> }[];
  }, [photos]);

  const doneHref = `/customer-select/${projectId}/done${shareToken ? `?share_token=${shareToken}` : ""}`;

  useEffect(() => {
    // 재보정 0건이면 S13으로 바로 이동(단계 1 결정).
    if (!loading && redoList.length === 0) router.replace(doneHref);
  }, [loading, redoList.length, router, doneHref]);

  const text = useMemo(() => {
    const lines = [`[재보정 요청 ${redoList.length}장]`];
    redoList.forEach(({ photo, version }) => lines.push(`${photo.filename} — ${version.redoReason}`));
    return lines.join("\n");
  }, [redoList]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("ok");
    } catch {
      setCopyState("fail");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  }

  if (loading || redoList.length === 0) {
    return <SystemLoadingScreen title={loading ? "재보정 요청을 불러오고 있어요" : "완료 화면으로 이동하고 있어요"} />;
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
            <h1 className={ui.title}>재보정 요청 전달</h1>
          </div>
          <div className={ui.body}>
            <p className={ui.bodyText}>아래 내용을 복사해서 작가님께 보내주세요.</p>
            <pre className={ui.exportBlock}>{text}</pre>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={`${ui.btn} ${ui.btnPrimary} ${ui.btnSm}`} style={{ flex: 1 }} onClick={handleCopy}>
                {copyState === "ok" ? "복사했어요 ✓" : copyState === "fail" ? "복사 실패" : "📋 복사하기"}
              </button>
              <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ flex: 1 }} disabled title="실제 서비스에서 파일로 받을 수 있어요">
                CSV
              </button>
              <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ flex: 1 }} disabled title="실제 서비스에서 파일로 받을 수 있어요">
                TXT
              </button>
            </div>
          </div>
          <PhotographerPageActionBar maxWidth={1120} actions={<PhotographerLightButton onClick={() => router.push(`/customer-select/${projectId}/retouch/upload${shareToken ? `?share_token=${shareToken}` : ""}`)}>다음 보정본 기다리기</PhotographerLightButton>} />
        </div>
      </div>
    </div>
  );
}
