"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminBetaInvitation } from "@/lib/admin-db";
import { formatAdminDate } from "@/lib/admin-format";

export function AdminBetaInvitations({ invitations }: { invitations: AdminBetaInvitation[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function invite() {
    if (!email.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/beta-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "등록 실패");
      setEmail("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    await fetch(`/api/admin/beta-invitations/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">베타 사전 초대</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        등록한 이메일로 가입하면 자동으로 베타가 부여됩니다.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && invite()}
          placeholder="example@email.com"
          className="w-64 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
        />
        <button
          type="button"
          onClick={invite}
          disabled={saving || !email.trim()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
        >
          등록
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}

      {invitations.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between rounded-md bg-surface-raised px-3 py-1.5 text-sm">
              <span className="text-foreground">
                {inv.email} <span className="text-xs text-muted-foreground">· {formatAdminDate(inv.invitedAt)} 등록</span>
              </span>
              <button
                type="button"
                onClick={() => cancel(inv.id)}
                className="text-xs text-muted-foreground hover:text-danger"
              >
                취소
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
