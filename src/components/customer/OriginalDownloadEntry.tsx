"use client";

import { useEffect, useState } from "react";
import { Download, X, PackageOpen, TriangleAlert } from "lucide-react";
import { formatStoredFileSizeBytes } from "@/lib/format-file-size";

interface OriginalDownloadFile {
  partNumber: number;
  url: string;
  fileCount: number;
  byteSize: number;
}

interface OriginalDownloadInfo {
  visible: boolean;
  available: boolean;
  expired: boolean;
  fileCount: number;
  totalBytes: number;
  expiresAt: string | null;
  files: OriginalDownloadFile[];
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
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
  const [mobileNotice, setMobileNotice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/c/original-download?token=${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? (res.json() as Promise<OriginalDownloadInfo>) : null))
      .then((data) => {
        if (!cancelled && data) setInfo(data);
      })
      .catch(() => {
        // 조용히 무시 — 진입점은 선택적 기능이라 실패해도 나머지 화면에 영향 없음
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!info || !info.visible) return null;

  const triggerDownload = () => {
    for (const f of info.files) {
      const a = document.createElement("a");
      a.href = f.url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleDownloadClick = () => {
    if (!info.available) return;
    if (isMobileViewport() && !mobileNotice) {
      setMobileNotice(true);
      return;
    }
    triggerDownload();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
            alignItems: "flex-end",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              background: "#0f0f12",
              border: "1px solid rgba(255,255,255,0.08)",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "20px 20px calc(20px + env(safe-area-inset-bottom,0px))",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>납품용 원본 다운로드</span>
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
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{info.fileCount.toLocaleString()}장</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>총 용량</div>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{formatStoredFileSizeBytes(info.totalBytes)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>만료일</div>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{formatExpiry(info.expiresAt)}</div>
              </div>
            </div>

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
                다운로드 기간이 종료되었습니다.
              </div>
            ) : mobileNotice ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "rgba(255,180,60,0.12)",
                    border: "1px solid rgba(255,180,60,0.3)",
                    color: "#ffd08a",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>전체 원본은 파일 용량이 크므로 PC에서 다운로드해주세요.<br />안정적인 Wi-Fi 환경을 권장합니다.</span>
                </div>
                <button
                  type="button"
                  onClick={triggerDownload}
                  style={{
                    padding: "12px 0",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.1)",
                    border: "none",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  그래도 계속 다운로드
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDownloadClick}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "13px 0",
                  borderRadius: 10,
                  background: "var(--accent, #4f7eff)",
                  border: "none",
                  color: "#000",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Download size={16} />
                전체 원본 다운로드{info.files.length > 1 ? ` (${info.files.length}개 파일)` : ""}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
