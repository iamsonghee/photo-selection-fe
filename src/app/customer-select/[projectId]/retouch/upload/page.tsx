"use client";

/**
 * S10 — 보정본 업로드 + 매칭 확인. 파일명 자동 매칭은 기존 순수 함수(lib/version-mapping.ts)를
 * 그대로 재사용한다(단계 1 결정) — 정확일치 → 접미사 제거 매칭, 실패분은 수동 지정.
 */
import { useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { buildVersionMapping, type MappingResult } from "@/lib/version-mapping";
import { compressImagesInParallel } from "@/lib/upload-client-compress";
import { UPLOAD_INTERMEDIATE_MAX_EDGE, UPLOAD_INTERMEDIATE_JPEG_QUALITY } from "@/lib/upload-work-queue";
import { useRetouchData, uploadRetouched, type RetouchPhoto } from "../../../_lib/retouch-store";
import { RetouchErrorScreen } from "../../../_lib/RetouchErrorScreen";
import { CustomerSelectShell } from "../../../_lib/CustomerSelectShell";
import ui from "../../../_lib/ui.module.css";

export default function RetouchUploadPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { photos, error: loadError, loading, refresh } = useRetouchData(projectId);

  const [files, setFiles] = useState<File[]>([]);
  const [mapping, setMapping] = useState<MappingResult<RetouchPhoto>[]>([]);
  const [manualAssign, setManualAssign] = useState<Record<string, string>>({}); // fileName -> photoId
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const unmatchedFiles = useMemo(() => {
    const matchedNames = new Set(mapping.filter((m) => m.file).map((m) => m.file!.name));
    return files.filter((f) => !matchedNames.has(f.name));
  }, [files, mapping]);

  function handleSelect(list: FileList | null) {
    if (!list || list.length === 0) return;
    const arr = Array.from(list);
    setFiles(arr);
    setMapping(buildVersionMapping(arr, photos));
    setManualAssign({});
    setError(null);
  }

  async function handleConfirm() {
    setUploading(true);
    setError(null);
    const pairs: { file: File; photoId: string }[] = [];
    mapping.forEach((m) => {
      if (m.file) pairs.push({ file: m.file, photoId: m.target.id });
    });
    unmatchedFiles.forEach((f) => {
      const photoId = manualAssign[f.name];
      if (photoId) pairs.push({ file: f, photoId });
    });
    if (pairs.length === 0) {
      setError("업로드할 사진과 원본 연결을 먼저 확인해주세요.");
      setUploading(false);
      return;
    }
    try {
      let compressed: File[];
      try {
        compressed = await compressImagesInParallel(
          pairs.map((p) => p.file),
          new AbortController().signal,
          3,
          { maxEdge: UPLOAD_INTERMEDIATE_MAX_EDGE, jpegQuality: UPLOAD_INTERMEDIATE_JPEG_QUALITY }
        );
      } catch {
        compressed = pairs.map((p) => p.file);
      }
      const result = await uploadRetouched(projectId, compressed, pairs.map((p) => p.photoId));
      await refresh();
      if (result.rejected.length || result.uploaded !== pairs.length) {
        const rejected = new Set(result.rejected);
        const retryFiles = pairs.map((pair) => pair.file).filter((file) => rejected.has(file.name));
        setFiles(retryFiles);
        setMapping(buildVersionMapping(retryFiles, photos));
        setManualAssign({});
        setError(`${result.uploaded}장은 업로드했고 ${Math.max(result.rejected.length, pairs.length - result.uploaded)}장은 실패했어요. 실패한 파일을 다시 확인해 주세요.`);
        return;
      }
      router.push(`/customer-select/${projectId}/retouch/compare`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <SystemLoadingScreen title="보정본 정보를 불러오고 있어요" homeHref="/customer-select" />;
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
            <h1 className={ui.title}>보정본 업로드</h1>
          </div>
          <div className={ui.body}>
            <p className={ui.bodyText}>작가님께 받은 보정본을 올려주세요. 파일명이 비슷하면 자동으로 원본과 연결해요.</p>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => handleSelect(e.target.files)} />
            <button type="button" className={`${ui.btn} ${ui.btnPrimary} ${ui.btnSm}`} style={{ width: 200 }} onClick={() => inputRef.current?.click()}>
              보정본 선택
            </button>

            {mapping.filter((m) => m.file).length > 0 && (
              <div>
                <p className={ui.label} style={{ marginBottom: 8 }}>
                  자동 연결됨 ({mapping.filter((m) => m.file).length}장)
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {mapping.filter((m) => m.file).map((m) => (
                    <div key={m.target.id} className={ui.reqItem}>
                      <span className="fn">{m.target.filename}</span>
                      <span className="tx">← {m.file!.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {unmatchedFiles.length > 0 && (
              <div>
                <p className={ui.label} style={{ marginBottom: 8 }}>
                  연결 안 된 파일 — 직접 골라주세요 ({unmatchedFiles.length}장)
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {unmatchedFiles.map((f) => (
                    <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={ui.supportText} style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.name}
                      </span>
                      <select
                        className={ui.input}
                        style={{ height: 38, width: 160, fontSize: 12.5 }}
                        value={manualAssign[f.name] ?? ""}
                        onChange={(e) => setManualAssign((prev) => ({ ...prev, [f.name]: e.target.value }))}
                      >
                        <option value="">원본 선택</option>
                        {photos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.filename}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {error && <span className={ui.bannerHeadWarn}>{error}</span>}
          </div>
          <PhotographerPageActionBar maxWidth={1120} actions={<PhotographerLightButton size="work-panel" pending={uploading} pendingLabel="업로드 중…" disabled={files.length === 0} onClick={handleConfirm}>매칭 확인하고 검토 시작</PhotographerLightButton>} />
        </div>
      </main>
    </CustomerSelectShell>
  );
}
