"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BETA_APPLICATION_STATUS_LABELS, type BetaApplicationStatus } from "@/lib/admin-db";
import type { BetaStatus } from "@/lib/beta-policy";

const STATUS_OPTIONS: BetaApplicationStatus[] = ["applied", "reviewing", "on_hold", "approved", "rejected"];

export function AdminBetaApplicationControl({
  id,
  initialStatus,
  initialAdminNote,
  initialContacted,
  matchedPhotographerId,
  matchedPhotographerBetaStatus,
}: {
  id: string;
  initialStatus: BetaApplicationStatus;
  initialAdminNote: string | null;
  initialContacted: boolean;
  matchedPhotographerId: string | null;
  matchedPhotographerBetaStatus: BetaStatus | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<BetaApplicationStatus>(initialStatus);
  const [adminNote, setAdminNote] = useState(initialAdminNote ?? "");
  const [contacted, setContacted] = useState(initialContacted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [granting, setGranting] = useState(false);
  const [granted, setGranted] = useState(false);
  const [grantError, setGrantError] = useState("");

  async function save(overrides?: { status?: BetaApplicationStatus; contacted?: boolean }) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/beta-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: overrides?.status ?? status,
          admin_note: adminNote || null,
          contacted: overrides?.contacted ?? contacted,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "저장 실패");
      }
      if (overrides?.status !== undefined) setStatus(overrides.status);
      if (overrides?.contacted !== undefined) setContacted(overrides.contacted);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  // 신청 시점에 이미 로그인돼 있어 matched_photographer_id가 항상 채워지므로, 계정은 이미 존재한다 —
  // 가입 전 이메일 사전등록(beta_invitations)이 아니라 기존 계정에 바로 베타를 부여한다.
  async function grantBeta() {
    if (!matchedPhotographerId) return;
    setGranting(true);
    setGrantError("");
    try {
      const res = await fetch(`/api/admin/users/${matchedPhotographerId}/beta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beta_status: "active" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "베타 부여 실패");
      }
      setGranted(true);
      router.refresh();
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : "베타 부여 실패");
    } finally {
      setGranting(false);
    }
  }

  const alreadyActive = matchedPhotographerBetaStatus === "active" || granted;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground">상태</label>
          <select
            value={status}
            disabled={saving}
            onChange={(e) => save({ status: e.target.value as BetaApplicationStatus })}
            className="mt-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground disabled:opacity-50"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {BETA_APPLICATION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={contacted}
            disabled={saving}
            onChange={(e) => save({ contacted: e.target.checked })}
          />
          연락 완료
        </label>
      </div>

      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">관리자 메모</label>
        <textarea
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          rows={3}
          className="mt-1 w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
          placeholder="내부 참고용 메모"
        />
      </div>

      <div>
        <button
          type="button"
          onClick={() => save()}
          disabled={saving}
          className="rounded-md border border-border px-4 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised disabled:opacity-50"
        >
          {saving ? "저장 중…" : "메모 저장"}
        </button>
        {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      </div>

      {status === "approved" && !alreadyActive && (
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs font-medium text-foreground">가입 연결</p>
          {matchedPhotographerId ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={grantBeta}
                disabled={granting}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised disabled:opacity-50"
              >
                {granting ? "부여 중…" : "베타 부여"}
              </button>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                기본 베타 기간(설정값)이 오늘부터 자동 적용됩니다. 기간을 다르게 하려면 계정 상세에서 조정하세요.
              </p>
              {grantError && <p className="mt-1.5 text-xs text-danger">{grantError}</p>}
            </div>
          ) : (
            <p className="mt-2 text-xs text-danger">
              매칭된 계정이 없습니다 — 신청은 로그인 후에만 가능하므로 정상적으로는 발생하지 않는
              상황입니다. Supabase 대시보드에서 직접 확인이 필요합니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
