"use client";

import { useEffect, useState } from "react";
import { Download, X, PackageOpen } from "lucide-react";
import { formatStoredFileSizeBytes } from "@/lib/format-file-size";

interface OriginalDownloadFile {
  filename: string;
  url: string;
  byteSize: number;
}
interface OriginalArchiveDownloadFile {
  partNumber: number;
  url: string;
  fileCount: number;
  byteSize: number;
}

interface OriginalDownloadInfo {
  visible: boolean;
  available: boolean;
  expired: boolean;
  preparing: boolean;
  failed: boolean;
  fileCount: number;
  totalBytes: number;
  expiresAt: string | null;
  files: OriginalDownloadFile[];
  archivePreparing: boolean;
  archiveFailed: boolean;
  archiveFiles: OriginalArchiveDownloadFile[];
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 납품용 원본 다운로드 접이식 진입점 — /c/[token]/** 전 페이지(핀 인증 전/뷰어/온보딩 제외)에
 * CustomerLayoutClient에서 1회만 마운트된다. include_original=false이거나 아카이브가 준비되지
 * 않은 프로젝트에서는 아무것도 렌더하지 않는다.
 */
export default function OriginalDownloadEntry({ token }: { token: string }) {
  const [info, setInfo] = useState<OriginalDownloadInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"archive" | "files">("archive");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`/api/c/original-download?token=${encodeURIComponent(token)}`)
        .then((res) => (res.ok ? (res.json() as Promise<OriginalDownloadInfo>) : null))
        .then((data) => {
          if (!cancelled && data) setInfo(data);
        })
        .catch(() => {
          // 조용히 무시 — 진입점은 선택적 기능이라 실패해도 나머지 화면에 영향 없음
        });
    };
    load();
    const timer = window.setInterval(() => {
      if (info?.preparing || info?.archivePreparing) load();
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, info?.preparing, info?.archivePreparing]);

  if (!info || !info.visible) return null;

  const openDownloadModal = () => {
    setSelected(new Set());
    setMode("archive");
    setQuery("");
    setOpen(true);
  };
  const toggleFile = (index: number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });
  const toggleAll = () => setSelected((current) =>
    current.size === info.files.length ? new Set() : new Set(info.files.map((_, index) => index))
  );
  const downloadSelected = () => {
    [...selected].sort((a, b) => a - b).forEach((index, order) => {
      const file = info.files[index];
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = file.url;
        link.rel = "noopener";
        link.download = file.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, order * 250);
    });
  };
  const downloadArchives = () => {
    info.archiveFiles.forEach((file, index) => {
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = file.url;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 250);
    });
  };
  const visibleFiles = info.files
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => file.filename.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <button
        type="button"
        onClick={openDownloadModal}
        aria-label="납품용 원본 다운로드"
        style={{
          position: "fixed",
          right: 16,
          bottom: 84,
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 14px",
          borderRadius: 999,
          background: "rgba(10,10,12,0.92)",
          border: "1px solid rgba(var(--accent-rgb),0.4)",
          color: "#fff",
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          backdropFilter: "blur(8px)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <PackageOpen size={16} />
        원본 다운로드
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(960px, 100%)",
              maxHeight: "calc(100vh - 40px)",
              background: "#0f0f12",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              padding: "28px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>납품용 원본 다운로드</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>파일 수</div>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{info.preparing ? "준비 중" : `${info.fileCount.toLocaleString()}장`}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>총 용량</div>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{info.preparing ? "준비 중" : formatStoredFileSizeBytes(info.totalBytes)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>만료일</div>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{info.preparing ? "준비 후 안내" : formatExpiry(info.expiresAt)}</div>
              </div>
            </div>

            {info.available && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {(["archive", "files"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setMode(tab)} style={{ border: "none", borderRadius: 8, padding: "9px 12px", background: mode === tab ? "rgba(var(--accent-rgb),0.18)" : "rgba(255,255,255,0.06)", color: mode === tab ? "#fff" : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {tab === "archive" ? "전체 압축파일" : "개별 파일 선택"}
                  </button>
                ))}
              </div>
            )}

            {info.available && mode === "archive" && (
              <div style={{ marginBottom: 16, padding: "20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 13 }}>
                {info.archivePreparing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><strong style={{ color: "#fff" }}>전체 압축파일을 준비하고 있습니다</strong><span style={{ color: "rgba(255,255,255,0.62)" }}>준비가 끝나면 이곳에서 한 번에 다운로드할 수 있습니다. 개별 파일은 지금 바로 받을 수 있어요.</span></div>
                ) : info.archiveFailed ? (
                  <span style={{ color: "#ff9b9b" }}>전체 압축파일 준비에 실패했습니다. 개별 원본 다운로드는 계속 가능합니다.</span>
                ) : info.archiveFiles.length > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><strong style={{ color: "#fff" }}>전체 압축파일 준비 완료</strong><span style={{ color: "rgba(255,255,255,0.6)" }}>{info.fileCount.toLocaleString()}장 · {formatStoredFileSizeBytes(info.totalBytes)}{info.archiveFiles.length > 1 ? ` · ${info.archiveFiles.length}개 ZIP` : ""}</span></div>
                    <button type="button" onClick={downloadArchives} style={{ border: "none", borderRadius: 8, padding: "12px 15px", background: "var(--accent, #4f7eff)", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>전체 압축파일 다운로드</button>
                  </div>
                ) : null}
              </div>
            )}

            {!info.available ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                {info.preparing
                  ? "작가가 납품용 원본 파일을 준비하고 있습니다. 준비가 완료되면 이 화면에서 바로 다운로드할 수 있어요."
                  : info.failed
                    ? "납품용 원본 파일을 준비하는 중 문제가 발생했습니다. 작가가 다시 준비하면 다운로드할 수 있어요."
                    : "다운로드 기간이 종료되었습니다."}
              </div>
            ) : mode === "archive" ? (
              <div style={{ padding: "14px", borderRadius: 10, background: "rgba(255,255,255,0.035)", color: "rgba(255,255,255,0.5)", fontSize: 12.5, textAlign: "center" }}>
                특정 파일만 필요하면 <button type="button" onClick={() => setMode("files")} style={{ padding: 0, border: 0, background: "none", color: "var(--accent, #91b1ff)", fontSize: "inherit", cursor: "pointer" }}>개별 파일 선택</button>에서 받을 수 있습니다.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.75)", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={selected.size === info.files.length && info.files.length > 0} onChange={toggleAll} />
                    전체 선택
                  </label>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{selected.size.toLocaleString()}개 선택됨</span>
                </div>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="파일명 검색" style={{ width: "100%", boxSizing: "border-box", marginBottom: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 13, outline: "none" }} />
                <div style={{ minHeight: 0, maxHeight: "calc(100vh - 330px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
                  {visibleFiles.map(({ file, index }) => (
                    <div key={`${file.filename}-${index}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 13 }}>
                      <input type="checkbox" checked={selected.has(index)} onChange={() => toggleFile(index)} aria-label={`${file.filename} 선택`} />
                      <Download size={15} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{file.filename}</span>
                      <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>{formatStoredFileSizeBytes(file.byteSize)}</span>
                      <a href={file.url} rel="noopener" download={file.filename} style={{ color: "var(--accent, #91b1ff)", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>다운로드</a>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={downloadSelected} disabled={selected.size === 0} style={{ width: "100%", marginTop: 16, padding: "13px", border: "none", borderRadius: 10, background: selected.size ? "var(--accent, #4f7eff)" : "rgba(255,255,255,0.1)", color: selected.size ? "#000" : "rgba(255,255,255,0.35)", fontSize: 14, fontWeight: 700, cursor: selected.size ? "pointer" : "not-allowed" }}>
                  선택한 파일 다운로드 ({selected.size.toLocaleString()})
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
