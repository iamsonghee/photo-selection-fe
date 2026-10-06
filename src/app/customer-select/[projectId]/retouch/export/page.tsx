"use client";

/** S12 — 재보정 요청 전달. 1차 S8과 같은 형식(복사/CSV/TXT). */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { ProjectBodySkeleton } from "../../../_lib/ProjectBodySkeleton";
import { csvEscape, downloadTextFile } from "@/lib/text-file-download";
import { useRetouchData, latestVersion } from "../../../_lib/retouch-store";
import { RetouchErrorScreen } from "../../../_lib/RetouchErrorScreen";
import ui from "../../../_lib/ui.module.css";

export default function RetouchExportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { photos, error: loadError, loading } = useRetouchData(projectId);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  const redoList = useMemo(() => {
    return photos
      .map((p) => ({ photo: p, version: latestVersion(p) }))
      .filter((x) => x.version?.decision === "redo") as { photo: (typeof photos)[number]; version: NonNullable<ReturnType<typeof latestVersion>> }[];
  }, [photos]);

  const doneHref = `/customer-select/${projectId}/done`;

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

  function handleDownloadCsv() {
    const rows = redoList.map(({ photo, version }) => `${csvEscape(photo.filename)},${csvEscape(version.redoReason ?? "")}`);
    downloadTextFile("재보정_요청.csv", ["파일명,재보정 요청", ...rows].join("\n"), "text/csv;charset=utf-8");
  }

  function handleDownloadTxt() {
    downloadTextFile("재보정_요청.txt", redoList.map(({ photo, version }) => `${photo.filename} — ${version.redoReason ?? ""}`).join("\n"), "text/plain;charset=utf-8");
  }

  if (loadError) return <RetouchErrorScreen message={loadError} />;
  if (loading || redoList.length === 0) {
    return <ProjectBodySkeleton variant="cards" label={loading ? "재보정 요청을 불러오고 있어요" : "완료 화면으로 이동하고 있어요"} />;
  }

  return (
    <>
      <main className={ui.shellMain}>
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
              <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ flex: 1 }} aria-label="CSV 다운로드" onClick={handleDownloadCsv}>
                CSV
              </button>
              <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ flex: 1 }} aria-label="TXT 다운로드" onClick={handleDownloadTxt}>
                TXT
              </button>
            </div>
          </div>
          <PhotographerPageActionBar maxWidth={1120} actions={<PhotographerLightButton size="work-panel" onClick={() => router.push(`/customer-select/${projectId}/retouch/upload`)}>보정본 업로드 화면으로</PhotographerLightButton>} />
        </div>
      </main>
    </>
  );
}
