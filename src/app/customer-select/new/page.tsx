"use client";

/** S3 — 프로젝트 생성. 로그인한 소유자만 접근하며, 실제 API로 프로젝트를 만든다(단계 6). */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogoBar } from "@/components/BrandLogo";
import ui from "../_lib/ui.module.css";

const SHOOT_TYPES = ["웨딩", "돌·성장", "가족", "프로필", "커플·우정", "행사"];

export default function NewCustomerProjectPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [name, setName] = useState("");
  const [shootType, setShootType] = useState("돌·성장");
  const [target, setTarget] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data.user) {
          router.replace("/customer-select/login");
          return;
        }
        setCheckingAuth(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/customer-select/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), shootType, target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      router.push(`/customer-select/${data.id}/upload`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
      setSubmitting(false);
    }
  }

  if (checkingAuth) {
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
          {error && <span className={ui.bannerHeadWarn}>{error}</span>}
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
