"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BetaStatus } from "@/lib/beta-policy";

const STATUS_OPTIONS: { value: BetaStatus; label: string }[] = [
  { value: "not_invited", label: "미참여" },
  { value: "active", label: "참여중" },
  { value: "ended", label: "종료" },
  { value: "suspended", label: "중지" },
];

export function AdminBetaControl({
  photographerId,
  initialBetaStatus,
  initialBetaStartDate,
  initialBetaEndDate,
  initialAdminNote,
}: {
  photographerId: string;
  initialBetaStatus: BetaStatus;
  initialBetaStartDate: string | null;
  initialBetaEndDate: string | null;
  initialAdminNote: string | null;
}) {
  const router = useRouter();
  const [betaStatus, setBetaStatus] = useState<BetaStatus>(initialBetaStatus);
  const [betaStartDate, setBetaStartDate] = useState(initialBetaStartDate ?? "");
  const [betaEndDate, setBetaEndDate] = useState(initialBetaEndDate ?? "");
  const [adminNote, setAdminNote] = useState(initialAdminNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${photographerId}/beta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beta_status: betaStatus,
          beta_start_date: betaStartDate || null,
          beta_end_date: betaEndDate || null,
          admin_note: adminNote || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "저장 실패");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">베타 상태</label>
        <select
          value={betaStatus}
          onChange={(e) => setBetaStatus(e.target.value as BetaStatus)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div />
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">시작일</label>
        <input
          type="date"
          value={betaStartDate}
          onChange={(e) => setBetaStartDate(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">종료일</label>
        <input
          type="date"
          value={betaEndDate}
          onChange={(e) => setBetaEndDate(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs uppercase tracking-wide text-muted-foreground">관리자 메모</label>
        <textarea
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          rows={2}
          className="mt-1 w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
          placeholder="내부 참고용 메모"
        />
      </div>
      <div className="sm:col-span-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md border border-border px-4 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
