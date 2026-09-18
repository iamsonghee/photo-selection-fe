"use client";

/**
 * S3 — 프로젝트 생성.
 * 실제 API 연동 전 목업 단계라 프로젝트를 서버에 만들지 않고, 브라우저에서 id만 생성해
 * 바로 업로드 화면으로 넘어간다(단계 5 범위: 목업 데이터로 화면·인터랙션 확인).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogoBar } from "@/components/BrandLogo";
import ui from "../_lib/ui.module.css";

const SHOOT_TYPES = ["웨딩", "돌·성장", "가족", "프로필", "커플·우정", "행사"];

export default function NewCustomerProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [shootType, setShootType] = useState("돌·성장");
  const [target, setTarget] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && !submitting;

  function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    const projectId = `demo-${Date.now().toString(36)}`;
    // 생성 직후 필요한 값만 sessionStorage에 남기고, 실제 project 레코드는
    // upload 페이지 진입 시 mock-store가 만든다(이름/유형/목표 수는 여기서 미리 전달).
    try {
      window.sessionStorage.setItem(
        `acut:customer-select:draft:${projectId}`,
        JSON.stringify({ name: name.trim(), shootType, target })
      );
    } catch {
      /* 저장소 접근 불가 — 업로드 화면에서 기본값으로 대체된다 */
    }
    router.push(`/customer-select/${projectId}/upload`);
  }

  return (
    <div className={ui.shell}>
      <header className={ui.brandbar}>
        <BrandLogoBar size="sm" variant="customerEntry" />
      </header>
      <div className={ui.shellMain}>
      <div className={ui.page} style={{ minHeight: "unset" }}>
        <div className={ui.header}>
          <h1 className={ui.title}>새 프로젝트</h1>
        </div>
        <div className={ui.body}>
          <div className={ui.field}>
            <span className={ui.label}>프로젝트 이름</span>
            <input
              className={ui.input}
              type="text"
              placeholder="예: 지우 돌잔치"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <span className={ui.label}>촬영 유형</span>
            <div className={ui.chipRow}>
              {SHOOT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${ui.chip} ${shootType === t ? ui.chipOn : ""}`}
                  onClick={() => setShootType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className={ui.field}>
            <span className={ui.label}>목표 셀렉 수</span>
            <input
              className={ui.input}
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
            />
            <span className={ui.hint}>ⓘ 참고용이에요. 더 골라도, 덜 골라도 괜찮아요.</span>
          </div>
        </div>
        <div className={ui.ctaDock}>
          <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} disabled={!canSubmit} onClick={handleCreate}>
            {submitting ? "만드는 중…" : "만들고 사진 올리기"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
