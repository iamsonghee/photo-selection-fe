"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Lock } from "lucide-react";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import { getProfileImageUrl } from "@/lib/photographer";
import { BrandLogoBar } from "@/components/BrandLogo";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { CustomerFooter } from "@/components/customer/CustomerFooter";

const CUSTOMER_CANCEL_MAX = 3;
const MONO = "'JetBrains Mono', 'Courier New', Courier, monospace";

type PhotographerInfo = {
  name: string | null;
  profile_image_url: string | null;
  bio: string | null;
  instagram_url: string | null;
  portfolio_url: string | null;
} | null;

function statusMessage(status: string): string {
  switch (status) {
    case "confirmed":   return "작가가 보정을 준비하고 있습니다";
    case "editing":     return "작가가 보정을 진행 중입니다. 완료되면 검토 요청을 드립니다";
    case "editing_v2":  return "작가가 재보정을 진행 중입니다";
    case "delivered":   return "모든 보정이 완료되었습니다";
    default:            return "작가가 보정을 진행 중입니다";
  }
}

/** 이 페이지는 셀렉 확정(confirmed)뿐 아니라 직접 URL로 들어오는 editing 등에도 쓰인다 */
function confirmedHero(status: string, customerName: string | null): { cmd: string; heading: string; subtitle: string } {
  const name = customerName ? `${customerName}님,` : "";
  const br = customerName ? "\n" : "";
  if (status === "editing_v2") {
    return {
      cmd: "REVIEW · SUBMITTED",
      heading: `${name}${br}의견을 작가에게 전달했어요.`,
      subtitle: "재보정을 요청한 장은 다시 손보고, 확정한 장은 그대로 반영돼요.",
    };
  }
  if (status === "editing") {
    return {
      cmd: "RETOUCH · IN_PROGRESS",
      heading: `${name}${br}보정이 진행 중이에요.`,
      subtitle: "완료되면 다시 검토 링크를 드릴게요.",
    };
  }
  return {
    cmd: "SELECTION · CONFIRMED",
    heading: `${name}${br}셀렉이 확정됐어요.`,
    subtitle: "작가가 보정을 시작합니다",
  };
}

export default function ConfirmedPage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";
  const ctx = useSelectionOptional();
  const project = ctx?.project ?? null;
  const loading = ctx?.loading ?? true;
  const [mounted, setMounted] = useState(false);
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({
        name: data.name ?? null,
        profile_image_url: data.profile_image_url ?? null,
        bio: data.bio ?? null,
        instagram_url: data.instagram_url ?? null,
        portfolio_url: data.portfolio_url ?? null,
      }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!project || !token) return;
    if (project.status === "selecting") { router.replace(`/c/${token}/gallery`); return; }
    if (project.status === "reviewing_v1" || project.status === "reviewing_v2") {
      router.replace(`/c/${token}`);
      return;
    }
    if (project.status === "delivered") {
      router.replace(`/c/${token}/delivered`);
    }
  }, [project, token, router]);

  if (!mounted || loading) {
    return (
      <div style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", background: "var(--background)" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(var(--accent-rgb), 0.2)", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  if (!project) {
    return (
      <div style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", background: "var(--background)", color: "var(--subtle-foreground)", fontFamily: MONO, fontSize: 13 }}>
        존재하지 않는 초대 링크입니다.
      </div>
    );
  }
  if (project.status === "selecting" || project.status === "reviewing_v1" || project.status === "reviewing_v2") {
    return (
      <div style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", background: "var(--background)" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(var(--accent-rgb), 0.2)", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const N = project.requiredCount ?? 0;
  const M = project.photoCount;
  const cancelCount = project.customerCancelCount ?? 0;
  const atCancelLimit = cancelCount >= CUSTOMER_CANCEL_MAX;
  const remainingCancels = Math.max(0, CUSTOMER_CANCEL_MAX - cancelCount);
  const confirmedDate = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy.MM.dd HH:mm", { locale: ko })
    : null;
  const photographerName = photographer?.name ?? "담당 작가";
  const customerName = project.customerName?.trim() || null;
  const hero = confirmedHero(project.status, customerName);

  const handleConfirmCancel = async () => {
    if (!project?.id || !token) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/c/cancel-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, project_id: project.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[확정 취소]", (data as { error?: string }).error ?? res.statusText);
        setCancelling(false); return;
      }
      setCancelModalOpen(false);
      if (typeof window !== "undefined") window.location.replace(`/c/${token}/gallery`);
    } catch (e) {
      console.error(e);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)", display: "flex", flexDirection: "column", position: "relative", overflowX: "hidden", fontFamily: "'Pretendard Variable','Pretendard',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');

        .cf-grid-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: linear-gradient(to right, var(--border-subtle) 1px, transparent 1px), linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .cf-bracket {
          position: fixed; width: 32px; height: 32px;
          border: 2px solid var(--border-strong); z-index: 50; pointer-events: none;
        }
        .cf-bracket-tl { top: 20px; left: 20px; border-right: none; border-bottom: none; }
        .cf-bracket-tr { top: 20px; right: 20px; border-left: none; border-bottom: none; }
        .cf-bracket-bl { bottom: 20px; left: 20px; border-right: none; border-top: none; }
        .cf-bracket-br { bottom: 20px; right: 20px; border-left: none; border-top: none; }

        .cf-header {
          position: sticky; top: 0; z-index: 50; padding: 12px 16px;
        }
        .cf-header-inner {
          display: flex; height: 44px; align-items: center; justify-content: space-between;
          border-radius: 999px; padding: 0 16px;
          background: rgba(5,5,5,0.80); backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .cf-header-badge {
          display: flex; align-items: center; gap: 6px; border-radius: 999px;
          padding: 4px 10px; font-size: 11px; color: var(--muted-foreground);
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.07);
          font-family: ${MONO}; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .cf-main {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          padding: 40px 20px 80px; position: relative; z-index: 10;
        }

        .cf-cmd {
          font-family: ${MONO}; font-size: 12px; color: var(--accent);
          letter-spacing: 2px; margin-bottom: 24px; text-transform: uppercase;
          display: flex; align-items: center; gap: 12px;
        }
        .cf-cmd::before, .cf-cmd::after {
          content: ''; width: 24px; height: 1px; background: var(--accent);
        }

        .cf-card {
          width: 100%; max-width: 640px;
          background: rgba(10,10,10,0.6); border: 1px solid var(--border);
          padding: 48px 40px; position: relative; backdrop-filter: blur(4px);
        }
        @media (max-width: 600px) {
          .cf-card { padding: 32px 20px; }
        }
        .cf-card-corner {
          position: absolute; width: 8px; height: 8px;
          border: 1px solid var(--border-strong); pointer-events: none;
        }
        .cf-card-tl { top: -1px; left: -1px; border-right: none; border-bottom: none; }
        .cf-card-br { bottom: -1px; right: -1px; border-left: none; border-top: none; }

        .cf-heading {
          font-size: clamp(32px, 6vw, 42px); font-weight: 800;
          line-height: 1.2; letter-spacing: -1px; margin-bottom: 12px;
          word-break: keep-all; text-align: center;
        }
        .cf-subtitle {
          font-size: 16px; line-height: 1.6; color: var(--muted-foreground);
          text-align: center; margin-bottom: 4px; word-break: keep-all;
        }
        .cf-date {
          font-family: ${MONO}; font-size: 11px; color: var(--subtle-foreground);
          text-align: center; margin-bottom: 40px; letter-spacing: 0.05em;
        }

        .cf-data-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 1px; background: var(--border);
          border: 1px solid var(--border); margin-bottom: 32px;
        }
        @media (max-width: 480px) {
          .cf-data-grid { grid-template-columns: 1fr; }
        }
        .cf-data-cell {
          background: var(--background); padding: 18px 20px;
          display: flex; flex-direction: column; gap: 6px;
        }
        .cf-data-cell-full { grid-column: 1 / -1; }
        .cf-data-label {
          font-family: ${MONO}; font-size: 10px; color: var(--subtle-foreground);
          text-transform: uppercase; letter-spacing: 1px;
        }
        .cf-data-value { font-size: 15px; font-weight: 600; color: var(--foreground); }
        .cf-data-value-accent { font-size: 36px; font-weight: 800; color: var(--accent); line-height: 1; letter-spacing: -1px; }
        .cf-data-value-muted { font-size: 13px; color: var(--subtle-foreground); margin-top: 2px; }

        .cf-btn-primary {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          width: 100%; background: var(--accent); color: #000;
          font-size: 17px; font-weight: 700; padding: 18px 32px;
          border: none; cursor: pointer; text-decoration: none;
          transition: background 0.2s; font-family: inherit; margin-bottom: 16px;
        }
        .cf-btn-primary:hover { background: #ff6600; }
        .cf-btn-primary .cf-arrow { margin-left: 4px; font-weight: 800; transition: transform 0.2s; }
        .cf-btn-primary:hover .cf-arrow { transform: translateX(4px); }

        .cf-btn-secondary {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; height: 48px; background: transparent;
          border: 1px solid var(--border-strong); color: var(--subtle-foreground);
          font-family: ${MONO}; font-size: 12px; letter-spacing: 0.08em;
          cursor: pointer; transition: border-color 0.15s, color 0.15s;
          text-decoration: none;
        }
        .cf-btn-secondary:hover { border-color: var(--border-strong); color: var(--muted-foreground); }

        .cf-btn-cancel {
          display: flex; align-items: center; justify-content: center;
          width: 100%; height: 44px; background: transparent;
          border: 1px solid var(--border); color: var(--subtle-foreground);
          font-family: ${MONO}; font-size: 11px; letter-spacing: 0.1em;
          cursor: pointer; transition: border-color 0.15s, color 0.15s;
        }
        .cf-btn-cancel:hover:not(:disabled) { border-color: #ff4757; color: #ff4757; }
        .cf-btn-cancel:disabled { opacity: 0.35; cursor: not-allowed; }

        .cf-photographer-card {
          margin-top: 40px; padding-top: 28px;
          border-top: 1px dashed var(--border);
          display: flex; align-items: center; justify-content: space-between;
        }
        .cf-photo-meta { display: flex; align-items: center; gap: 14px; }
        .cf-avatar-box {
          width: 48px; height: 48px; border: 1px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.03); overflow: hidden; flex-shrink: 0;
        }
        .cf-author-name { font-size: 15px; font-weight: 700; }
        .cf-author-role {
          font-family: ${MONO}; font-size: 10px; color: var(--subtle-foreground);
          text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;
        }
        .cf-sys-tag {
          font-family: ${MONO}; font-size: 10px; color: var(--accent);
          border: 1px solid rgba(var(--accent-rgb), 0.3); padding: 4px 8px;
          letter-spacing: 0.5px; white-space: nowrap;
        }

        .cf-footer {
          text-align: center; padding: 20px;
          font-family: ${MONO}; font-size: 10px; color: var(--disabled-foreground);
          letter-spacing: 0.1em; position: relative; z-index: 10;
        }

        .cf-modal-overlay {
          position: fixed; inset: 0; z-index: 100;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.85); backdrop-filter: blur(6px); padding: 16px;
        }
        .cf-modal-box {
          width: 100%; max-width: 420px;
          background: var(--surface-raised); border: 1px solid var(--accent);
          padding: 32px; position: relative;
        }
        .cf-modal-title {
          font-size: 22px; font-weight: 800; margin-bottom: 12px;
          letter-spacing: -0.5px; color: var(--foreground);
        }
        .cf-modal-desc { font-size: 13px; line-height: 1.7; color: var(--muted-foreground); margin-bottom: 24px; }
        .cf-modal-actions { display: flex; gap: 10px; }
        .cf-modal-cancel {
          flex: 1; height: 48px; border: 1px solid var(--border-strong); background: none;
          color: var(--muted-foreground); font-size: 13px; font-weight: 700; cursor: pointer;
          font-family: inherit; transition: all 0.15s;
        }
        .cf-modal-cancel:hover { background: var(--foreground); color: #000; }
        .cf-modal-confirm {
          flex: 1; height: 48px; background: var(--accent); color: #000;
          font-size: 13px; font-weight: 900; border: none;
          cursor: pointer; font-family: ${MONO}; letter-spacing: 0.05em;
          transition: opacity 0.15s;
        }
        .cf-modal-confirm:disabled { opacity: 0.6; cursor: wait; }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="cf-grid-bg" />
      <div className="cf-bracket cf-bracket-tl" />
      <div className="cf-bracket cf-bracket-tr" />
      <div className="cf-bracket cf-bracket-bl" />
      <div className="cf-bracket cf-bracket-br" />

      {/* 헤더 */}
      <CustomerHeader>
        <BrandLogoBar size="sm" href={token ? `/c/${token}` : undefined} />
        <span className="font-mono text-[11px] text-subtle-foreground max-w-[180px] truncate">{project.name}</span>
      </CustomerHeader>

      {/* 메인 */}
      <main className="cf-main">
        <div className="cf-cmd">{hero.cmd}</div>

        <div className="cf-card">
          <div className="cf-card-corner cf-card-tl" />
          <div className="cf-card-corner cf-card-br" />

          {/* 타이틀 */}
          <h1 className="cf-heading" style={{ whiteSpace: "pre-line" }}>
            {hero.heading}
          </h1>
          <p className="cf-subtitle">{hero.subtitle}</p>
          {confirmedDate && <p className="cf-date">{confirmedDate}</p>}

          {/* 데이터 그리드 */}
          <div className="cf-data-grid">
            <div className="cf-data-cell">
              <span className="cf-data-label">DATA :: 선택한 사진</span>
              <span className="cf-data-value-accent">{N}<span style={{ fontSize: 18, fontWeight: 600, color: "var(--accent)", marginLeft: 4 }}>장</span></span>
              <span className="cf-data-value-muted">전체 {M}장 중</span>
            </div>
            <div className="cf-data-cell">
              <span className="cf-data-label">FIELD :: 프로젝트</span>
              <span className="cf-data-value">{project.name}</span>
            </div>
            <div className="cf-data-cell cf-data-cell-full">
              <span className="cf-data-label">SYS :: 현재 상태</span>
              <span className="cf-data-value" style={{ fontSize: 14, fontWeight: 500, color: "var(--muted-foreground)" }}>
                {statusMessage(project.status)}
              </span>
            </div>
          </div>

          {/* 버튼 */}
          <Link href={`/c/${token}/locked`} className="cf-btn-primary">
            <Lock size={16} />
            선택한 사진 보기
            <span className="cf-arrow">→</span>
          </Link>

          {/* 작가 카드 */}
          <div className="cf-photographer-card">
            <div className="cf-photo-meta">
              <div className="cf-avatar-box">
                <img
                  src={getProfileImageUrl(photographer?.profile_image_url)}
                  alt={photographerName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <div>
                <div className="cf-author-name">{photographerName}</div>
                <div className="cf-author-role">담당 작가</div>
              </div>
            </div>
            <div className="cf-sys-tag">VERIFIED_CREATOR</div>
          </div>

          {/* 확정 취소 */}
          {project.status === "confirmed" && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
              <p style={{ textAlign: "center", fontFamily: MONO, fontSize: 11, color: "var(--subtle-foreground)", marginBottom: 12 }}>
                확정 취소 가능 횟수 <span style={{ color: "var(--muted-foreground)", fontWeight: 700 }}>{remainingCancels}회</span> 남음
              </p>
              <button
                type="button"
                disabled={atCancelLimit}
                onClick={() => !atCancelLimit && setCancelModalOpen(true)}
                className="cf-btn-cancel"
              >
                확정 취소 후 다시 선택
              </button>
            </div>
          )}
        </div>
      </main>

      {/* 푸터 */}
      <CustomerFooter>
        <span className="font-mono text-[10px] text-subtle-foreground">SECURE_CONNECTION</span>
        <span className="font-mono text-[10px] text-subtle-foreground">© 2026 A컷</span>
      </CustomerFooter>

      {/* 취소 모달 */}
      {cancelModalOpen && project.status === "confirmed" && (
        <div className="cf-modal-overlay" onClick={() => setCancelModalOpen(false)}>
          <div className="cf-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="cf-modal-title">확정을 취소할까요?</h3>
            <p className="cf-modal-desc">
              취소 후 갤러리로 돌아가 사진을 다시 선택할 수 있습니다.
              <br />
              남은 횟수 <span style={{ fontFamily: MONO, color: "var(--foreground)", fontWeight: 700 }}>{remainingCancels}회</span>
            </p>
            <div className="cf-modal-actions">
              <button type="button" className="cf-modal-cancel" onClick={() => setCancelModalOpen(false)}>
                아니요
              </button>
              <button type="button" className="cf-modal-confirm" onClick={handleConfirmCancel} disabled={cancelling}>
                {cancelling ? "처리 중..." : "예, 다시 선택"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
