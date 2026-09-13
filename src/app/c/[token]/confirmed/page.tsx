"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Images, Monitor } from "lucide-react";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import { BrandLogoBar } from "@/components/BrandLogo";
import OriginalDownloadEntry from "@/components/customer/OriginalDownloadEntry";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";

const CUSTOMER_CANCEL_MAX = 3;

function completionCopy(status: string) {
  if (status === "editing_v2") {
    return {
      title: "의견 전달이 완료되었어요",
      description: <>작가님에게 검토 의견이 전달되었습니다.<br />재보정본이 완성되면 알림을 보내드릴게요.</>,
    };
  }
  if (status === "editing") {
    return {
      title: "사진 보정이 진행 중이에요",
      description: <>작가님이 셀렉한 사진을 보정하고 있습니다.<br />보정본이 완성되면 알림을 보내드릴게요.</>,
    };
  }
  return {
    title: "사진 셀렉이 완료되었어요",
    description: <>선택한 사진을 작가님에게 전달했어요.<br />보정이 완료되면 알림으로 알려드릴게요.</>,
  };
}

export default function ConfirmedPage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";
  const context = useSelectionOptional();
  const project = context?.project ?? null;
  const loading = context?.loading ?? true;
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!project || !token) return;
    if (project.status === "selecting") {
      router.replace(`/c/${token}/gallery`);
      return;
    }
    if (project.status === "reviewing_v1" || project.status === "reviewing_v2") {
      router.replace(`/c/${token}`);
      return;
    }
    if (project.status === "delivered") router.replace(`/c/${token}/delivered`);
  }, [project, router, token]);

  if (loading) return <SystemLoadingScreen />;
  if (!project) {
    return <main className="flex min-h-dvh items-center justify-center bg-white text-sm text-[#7d7a75]">존재하지 않는 초대 링크입니다.</main>;
  }
  if (["selecting", "reviewing_v1", "reviewing_v2", "delivered"].includes(project.status)) {
    return <SystemLoadingScreen />;
  }

  const cancelCount = project.customerCancelCount ?? 0;
  const remainingCancels = Math.max(0, CUSTOMER_CANCEL_MAX - cancelCount);
  const canCancel = project.status === "confirmed" && remainingCancels > 0;
  const copy = completionCopy(project.status);
  const confirmedDateLabel = project.confirmedAt
    ? new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(project.confirmedAt))
    : null;

  const handleConfirmCancel = async () => {
    if (!project.id || !token || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const response = await fetch("/api/c/cancel-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, project_id: project.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCancelError((data as { error?: string }).error ?? "확정을 취소하지 못했습니다.");
        return;
      }
      window.location.replace(`/c/${token}/gallery`);
    } catch {
      setCancelError("네트워크 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="confirmed-page">
      <header className="confirmed-brandbar">
        <BrandLogoBar size="sm" href={token ? `/c/${token}` : undefined} variant="customerEntry" />
      </header>

      <main className="confirmed-main">
        <section className="confirmed-result" aria-labelledby="confirmed-title">
          <span className="confirmed-success" aria-hidden>
            <Check size={28} strokeWidth={2.4} />
          </span>
          <div className="confirmed-copy">
            <h1 id="confirmed-title">{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
        </section>

        <section className="confirmed-selection-summary" aria-label="선택 결과">
          <span className="confirmed-selection-icon" aria-hidden>
            <Images size={21} strokeWidth={1.8} />
          </span>
          <span className="confirmed-selection-copy">
            <strong>선택 완료 · {project.requiredCount.toLocaleString()}장</strong>
            <span>{confirmedDateLabel ? `${confirmedDateLabel} 확정` : "작가님에게 전달 완료"}</span>
          </span>
        </section>

        <Link href={`/c/${token}/locked`} className="confirmed-primary">선택한 사진 보기</Link>

        <section className="confirmed-download" aria-label="원본 다운로드 정보">
          <h2>전체 원본 다운로드</h2>
          <OriginalDownloadEntry token={token} variant="summary" />
          <p className="confirmed-download-note">
            <Monitor size={15} strokeWidth={1.8} aria-hidden />
            파일 용량으로 인해 PC에서 다운로드하는 것을 권장해요.
          </p>
        </section>

        {project.status === "confirmed" && (
          <button
            type="button"
            className="confirmed-secondary"
            disabled={!canCancel}
            onClick={() => canCancel && setCancelModalOpen(true)}
          >
            {canCancel ? "확정 취소하기" : "확정 취소 횟수를 모두 사용했어요"}
          </button>
        )}
      </main>

      {cancelModalOpen && (
        <div className="confirmed-cancel-backdrop" onClick={() => !cancelling && setCancelModalOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="cancel-confirm-title" className="confirmed-cancel-dialog" onClick={(event) => event.stopPropagation()}>
            <span className="confirmed-cancel-icon" aria-hidden><AlertTriangle size={18} /></span>
            <h2 id="cancel-confirm-title">확정을 취소할까요?</h2>
            <p>갤러리로 돌아가 사진을 다시 선택할 수 있습니다.<br />취소 가능 횟수는 {remainingCancels}회 남아 있어요.</p>
            {cancelError && <p className="confirmed-cancel-error" role="alert">{cancelError}</p>}
            <div>
              <button type="button" onClick={() => setCancelModalOpen(false)} disabled={cancelling}>유지하기</button>
              <button type="button" className="danger" onClick={handleConfirmCancel} disabled={cancelling}>{cancelling ? "처리 중..." : "취소하기"}</button>
            </div>
          </section>
        </div>
      )}

      <style>{`
        .confirmed-page {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: #fff;
          color: #191918;
          font-family: Pretendard, "Pretendard Variable", -apple-system, sans-serif;
        }
        .confirmed-brandbar {
          height: calc(56px + env(safe-area-inset-top));
          box-sizing: border-box;
          display: flex;
          align-items: flex-end;
          padding: env(safe-area-inset-top) 20px 12px;
          background: #fff;
          border-bottom: 1px solid #f1f2f3;
        }
        .confirmed-main {
          width: min(100%, 375px);
          margin: 0 auto;
          flex: 1;
          padding: 44px 20px calc(28px + env(safe-area-inset-bottom));
          box-sizing: border-box;
        }
        .confirmed-result { display: flex; flex-direction: column; align-items: center; text-align: center; }
        .confirmed-success {
          width: 68px;
          height: 68px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #fff3ed;
          color: #ff4d00;
        }
        .confirmed-copy { width: 100%; margin-top: 20px; }
        .confirmed-copy h1 { margin: 0; font-size: 24px; line-height: 36px; font-weight: 600; letter-spacing: -1.47px; }
        .confirmed-copy p { margin: 12px 0 0; color: #5f5e5b; font-size: 14px; line-height: 21px; font-weight: 400; }
        .confirmed-selection-summary {
          min-height: 72px;
          margin-top: 32px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border: 1px solid #ebeef0;
          border-radius: 10px;
          background: #fafafa;
        }
        .confirmed-selection-icon {
          width: 40px;
          height: 40px;
          flex: 0 0 40px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: #fff3ed;
          color: #ff4d00;
        }
        .confirmed-selection-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .confirmed-selection-copy strong { color: #191918; font-size: 15px; line-height: 22px; font-weight: 700; letter-spacing: -.3px; }
        .confirmed-selection-copy span { color: #7d7a75; font-size: 12px; line-height: 18px; }
        .confirmed-download { margin-top: 32px; }
        .confirmed-download h2 { margin: 0 0 10px; color: #191918; font-size: 14px; line-height: 22px; font-weight: 700; letter-spacing: -.28px; }
        .confirmed-download-note { margin: 10px 4px 0; display: flex; align-items: center; gap: 7px; color: #7d7a75; font-size: 11px; line-height: 17px; }
        .confirmed-download-note svg { flex: 0 0 15px; }
        .confirmed-primary {
          width: 100%;
          height: 52px;
          margin-top: 12px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #26282c;
          color: #fff;
          font-size: 15px;
          line-height: 22px;
          font-weight: 700;
          letter-spacing: -0.3px;
          text-decoration: none;
          transition: background-color 140ms ease, transform 100ms ease;
        }
        .confirmed-primary:hover { background: #191918; }
        .confirmed-primary:active { transform: scale(.99); }
        .confirmed-secondary {
          width: 100%;
          min-height: 44px;
          margin-top: 18px;
          border: 0;
          background: transparent;
          color: #5f5e5b;
          font: 400 13px/20px Pretendard, sans-serif;
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
        }
        .confirmed-secondary:disabled { color: #aab0b8; cursor: not-allowed; text-decoration: none; }
        .confirmed-primary:focus-visible, .confirmed-secondary:focus-visible { outline: 2px solid #ff4d00; outline-offset: 2px; }
        .confirmed-cancel-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,.5); }
        .confirmed-cancel-dialog { width: min(335px, 100%); box-sizing: border-box; padding: 24px; border-radius: 12px; background: #fff; text-align: center; }
        .confirmed-cancel-icon { width: 40px; height: 40px; margin: 0 auto 12px; display: grid; place-items: center; border-radius: 50%; background: #fff3ed; color: #ff4d00; }
        .confirmed-cancel-dialog h2 { margin: 0; font-size: 19px; line-height: 29px; }
        .confirmed-cancel-dialog p { margin: 8px 0 20px; color: #5f5e5b; font-size: 12px; line-height: 19px; }
        .confirmed-cancel-dialog .confirmed-cancel-error { margin-top: -8px; color: #d92d20; }
        .confirmed-cancel-dialog > div { display: flex; gap: 8px; }
        .confirmed-cancel-dialog button { flex: 1; height: 44px; border: 1px solid #d9d9d9; border-radius: 4px; background: #fff; color: #191918; font-size: 14px; cursor: pointer; }
        .confirmed-cancel-dialog button.danger { border-color: #ff4d00; background: #ff4d00; color: #fff; font-weight: 700; }
        @media (min-width: 768px) {
          .confirmed-main { width: min(100%, 440px); padding-top: 56px; }
        }
      `}</style>
    </div>
  );
}
