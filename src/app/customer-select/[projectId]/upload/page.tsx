"use client";

/**
 * S4 — 사진 업로드. 원본 파일명을 유지한 채 브라우저에서 직접 서버(BE 커스텀 업로드
 * 엔드포인트)로 올린다 — 압축 없이 그대로 전송하고, 썸네일·프리뷰 생성은 BE가 담당한다
 * (원본 파일 리사이즈 파이프라인은 작가 플로우 전용이라 여기서는 재사용하지 않음, 단계 6 결정).
 */
import { useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogoBar } from "@/components/BrandLogo";
import { useCustomerSelectStore } from "../../_lib/real-store";
import ui from "../../_lib/ui.module.css";

const BATCH_SIZE = 20;

export default function CustomerUploadPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const shareToken = useSearchParams().get("share_token");
  const router = useRouter();
  const { project, hydrated, refresh } = useCustomerSelectStore();
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setTotal(files.length);
    setProgress(0);

    const {
      data: { session },
    } = await createClient().auth.getSession();
    const authHeader: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

    const list = Array.from(files);
    let uploaded = 0;
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);
      const formData = new FormData();
      formData.append("project_id", projectId);
      if (shareToken) formData.append("share_token", shareToken);
      batch.forEach((f) => formData.append("files", f));
      try {
        const res = await fetch("/api/customer-select/upload/photos", { method: "POST", headers: authHeader, body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const detail = data.detail;
          const msg = typeof detail === "string" ? detail : detail?.message ?? detail?.error;
          throw new Error(msg ?? "업로드 실패");
        }
        const data = await res.json();
        uploaded += data.uploaded ?? batch.length;
      } catch (e) {
        setError(e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다.");
        setUploading(false);
        await refresh();
        return;
      }
      setProgress(uploaded);
    }
    await refresh();
    setUploading(false);
  }

  const displayName = project.name || "이름 없는 프로젝트";

  if (!hydrated) {
    return (
      <div className={ui.shell}>
        <header className={ui.brandbar}>
          <BrandLogoBar size="sm" variant="customerEntry" />
        </header>
      </div>
    );
  }

  return (
    <div className={ui.shell}>
      <header className={ui.brandbar}>
        <BrandLogoBar size="sm" variant="customerEntry" />
      </header>
      <div className={ui.shellMain}>
      <div className={ui.page} style={{ minHeight: "unset" }}>
        <div className={ui.header}>
          <h1 className={ui.title}>{displayName}</h1>
        </div>
        <div className={ui.body}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
          {!uploading && project.photoCount === 0 && (
            <div
              style={{
                border: "1.5px dashed #dde1e4",
                borderRadius: 18,
                padding: "38px 18px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                textAlign: "center",
                background: "#f7f6f4",
              }}
            >
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "#fff0ea", color: "#ff4d00", display: "grid", placeItems: "center", fontSize: 22 }}>
                ⬆
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>여기로 사진을 끌어다 놓으세요</div>
              <button type="button" className={`${ui.btn} ${ui.btnPrimary} ${ui.btnSm}`} style={{ width: 200 }} onClick={() => inputRef.current?.click()}>
                사진 선택
              </button>
              <span className={ui.supportText}>JPG · PNG · HEIC · 최대 2,000장</span>
            </div>
          )}

          {uploading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#5f5e5b" }}>
                <span>{progress} / {total}장</span>
                <span>{progress >= total ? "완료" : "업로드 중…"}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "#ecebe8", overflow: "hidden" }}>
                <div style={{ width: `${total ? (progress / total) * 100 : 0}%`, height: "100%", background: "#ff4d00", transition: "width .2s linear" }} />
              </div>
            </div>
          )}

          {!uploading && project.photoCount > 0 && (
            <>
              <p className={ui.bodyText}>사진 {project.photoCount}장을 올렸어요. 이제 마음에 드는 사진을 골라주세요.</p>
              <button type="button" className={`${ui.btn} ${ui.btnSm}`} style={{ width: 160 }} onClick={() => inputRef.current?.click()}>
                사진 더 올리기
              </button>
            </>
          )}
          {error && <span className={ui.bannerHeadWarn}>{error}</span>}
        </div>
        <div className={ui.ctaDock}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={project.photoCount === 0 || uploading}
            onClick={() => router.push(`/customer-select/${projectId}/select${shareToken ? `?share_token=${shareToken}` : ""}`)}
          >
            셀렉 시작하기{project.photoCount > 0 ? ` (${project.photoCount}장)` : ""}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
