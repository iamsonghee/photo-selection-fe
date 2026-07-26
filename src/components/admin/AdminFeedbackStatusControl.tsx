"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@/lib/admin-db";

const STATUSES: FeedbackStatus[] = ["new", "reviewing", "resolved"];

export function AdminFeedbackStatusControl({ id, status }: { id: string; status: FeedbackStatus }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(next: FeedbackStatus) {
    if (next === status) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      // 실패 시 select는 이전 값으로 되돌아감(router.refresh 미호출)
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={status}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value as FeedbackStatus)}
      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {FEEDBACK_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
