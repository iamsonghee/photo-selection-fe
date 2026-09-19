"use client";

/**
 * S8 — 작가 전달 결과.
 * 실제 서비스에서는 작가용 화면에 이미 있는 내보내기 로직(csvEscape·downloadTextFile,
 * ProjectAssetsPageClient.tsx)을 그대로 옮겨 쓸 수 있다(단계 0 조사 결과). 이 목업 단계에서는
 * 같은 형식의 텍스트를 만들고 클립보드 복사까지만 실제로 동작시킨다 — 파일 다운로드는
 * 실제 서비스 구현 때 위 기존 로직을 연결한다.
 */
import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BrandLogoBar } from "@/components/BrandLogo";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import { useCustomerSelectStore } from "../../_lib/real-store";
import ui from "../../_lib/ui.module.css";

function buildExportText(
  selected: { id: string; name: string }[],
  comments: Record<string, string | undefined>
): string {
  const lines = [`[선택 사진 ${selected.length}장]`];
  selected.forEach(({ id, name }) => {
    const comment = comments[id];
    lines.push(comment ? `${name} — ${comment}` : name);
  });
  return lines.join("\n");
}

export default function CustomerExportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const shareToken = useSearchParams().get("share_token");
  const router = useRouter();
  const { project, hydrated, update } = useCustomerSelectStore();
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  const selected = project.photos
    .filter((p) => project.selectedIds.includes(p.id))
    .map((p) => ({ id: p.id, name: getPhotoDisplayName(p) }));
  const comments = Object.fromEntries(Object.entries(project.photoStates).map(([id, s]) => [id, s.comment]));
  const text = buildExportText(selected, comments);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("ok");
    } catch {
      setCopyState("fail");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  }

  // 하이드레이션 전 첫 프레임 — real-store.tsx 참고(서버/클라이언트 렌더 불일치 방지).
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
          <button type="button" className={ui.back} onClick={() => router.back()}>
            ←
          </button>
          <h1 className={ui.title}>작가님께 전달하기</h1>
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
          <span className={ui.supportText}>ⓘ 이 목업은 복사만 시연합니다. CSV·TXT 다운로드는 실제 서비스에서 제공됩니다.</span>
        </div>
        <div className={`${ui.ctaDock} ${ui.ctaDockRow}`} style={{ alignItems: "center" }}>
          <span className={ui.bodyText} style={{ flex: 1, fontSize: 12.5 }}>
            전달하셨나요?
          </span>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSm}`}
            style={{ width: "auto", padding: "0 16px" }}
            onClick={() => update({ exported: true })}
          >
            {project.exported ? "전달 완료됨 ✓" : "전달 완료로 표시"}
          </button>
        </div>
        {project.exported && (
          <div style={{ padding: "0 24px 20px" }}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSm}`}
              style={{ width: "100%" }}
              onClick={() => router.push(`/customer-select/${projectId}/retouch/upload${shareToken ? `?share_token=${shareToken}` : ""}`)}
            >
              보정본 받으셨나요? 업로드하기 →
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
