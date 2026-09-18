"use client";

/**
 * S4 — 사진 업로드.
 * 실제로는 브라우저에서 원본을 축소해 썸네일·프리뷰만 서버에 올리지만(단계 0 조사 결과,
 * 기존 upload-client-compress.ts가 identity 비의존이라 실제 연동 때 그대로 재사용 가능),
 * 이 목업 단계에서는 파일 선택 없이 "N장 업로드됐다"는 결과만 즉시 만들어 다음 화면 검증에 쓴다.
 */
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CustomerEntryShell, CustomerEntryHeader } from "@/components/customer/CustomerEntryShell";
import { generateMockPhotos, useCustomerSelectStore } from "../../_lib/mock-store";
import ui from "../../_lib/ui.module.css";

const TOTAL = 800;

export default function CustomerUploadPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const { project, hydrated, update } = useCustomerSelectStore();
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  function startUpload() {
    setUploading(true);
    let uploaded = 0;
    const timer = setInterval(() => {
      uploaded = Math.min(TOTAL, uploaded + Math.ceil(TOTAL / 22));
      setProgress(uploaded);
      if (uploaded >= TOTAL) {
        clearInterval(timer);
        update({ photos: generateMockPhotos(projectId, TOTAL), photoCount: TOTAL, uploaded: true });
      }
    }, 90);
  }

  const displayName = project.name || "이름 없는 프로젝트";

  // sessionStorage 값을 아직 못 읽어온 첫 프레임 — 하이드레이션 불일치를 피하려고 서버와
  // 같은 빈 값으로 그린 뒤, 로드가 끝나면 실제 값으로 바뀐다(mock-store.tsx 참고).
  if (!hydrated) {
    return (
      <CustomerEntryShell>
        <CustomerEntryHeader />
      </CustomerEntryShell>
    );
  }

  return (
    <CustomerEntryShell>
      <CustomerEntryHeader />
      <div className={ui.page} style={{ minHeight: "unset" }}>
        <div className={ui.header}>
          <h1 className={ui.title}>{displayName}</h1>
        </div>
        <div className={ui.body}>
          {!uploading && !project.uploaded && (
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
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: "#fff0ea",
                  color: "#ff4d00",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                }}
              >
                ⬆
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>여기로 사진을 끌어다 놓으세요</div>
              <button type="button" className={`${ui.btn} ${ui.btnPrimary} ${ui.btnSm}`} style={{ width: 200 }} onClick={startUpload}>
                사진 선택 ({TOTAL}장 시뮬레이션)
              </button>
              <span className={ui.supportText}>JPG · PNG · HEIC · 최대 2,000장</span>
            </div>
          )}

          {uploading && !project.uploaded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#5f5e5b" }}>
                <span>{progress} / {TOTAL}장</span>
                <span>{progress >= TOTAL ? "완료" : "업로드 중…"}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "#ecebe8", overflow: "hidden" }}>
                <div style={{ width: `${(progress / TOTAL) * 100}%`, height: "100%", background: "#ff4d00", transition: "width .2s linear" }} />
              </div>
            </div>
          )}

          {project.uploaded && (
            <p className={ui.bodyText}>사진 {project.photoCount}장을 올렸어요. 이제 마음에 드는 사진을 골라주세요.</p>
          )}
        </div>
        <div className={ui.ctaDock}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={!project.uploaded}
            onClick={() => router.push(`/customer-select/${projectId}/select`)}
          >
            셀렉 시작하기{project.uploaded ? ` (${project.photoCount}장)` : ""}
          </button>
        </div>
      </div>
    </CustomerEntryShell>
  );
}
