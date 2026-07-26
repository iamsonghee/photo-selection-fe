"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminPinControl({ projectId, initialPin }: { projectId: string; initialPin: string | null }) {
  const router = useRouter();
  const [pin, setPin] = useState(initialPin ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(nextPin: string | null) {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_pin: nextPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "저장 실패");
      setPin(nextPin ?? "");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="설정 안 함"
          className="w-24 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
        />
        <button
          type="button"
          disabled={saving || !/^\d{4}$/.test(pin)}
          onClick={() => save(pin)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
        >
          저장
        </button>
        {initialPin && (
          <button
            type="button"
            disabled={saving}
            onClick={() => save(null)}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-raised disabled:opacity-40"
          >
            제거
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
