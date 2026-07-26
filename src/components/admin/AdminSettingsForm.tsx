"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AppSettings } from "@/lib/app-settings";

const FIELD_DEFS: { key: keyof AppSettings; label: string; note?: string; suffix: string }[] = [
  { key: "generalMaxProjects", label: "일반(Trial) 현재 보유 가능 프로젝트 수", note: "삭제하면 슬롯이 즉시 다시 확보됨(베타와 동일 기준)", suffix: "개" },
  { key: "generalMaxPhotosPerProject", label: "일반(Trial) 프로젝트당 최대 사진 수", suffix: "장" },
  { key: "betaMaxProjectsTotal", label: "베타 현재 보유 가능 프로젝트 수", suffix: "개" },
  { key: "betaMaxPhotosPerProject", label: "베타 프로젝트당 최대 사진 수", suffix: "장" },
  { key: "betaMaxRevisionCount", label: "최대 재보정 라운드", suffix: "회" },
  { key: "betaDefaultDurationDays", label: "베타 부여 시 기본 이용 기간", note: "종료일을 지정하지 않으면 자동 적용", suffix: "일" },
];

function toFormValues(settings: AppSettings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key } of FIELD_DEFS) out[key] = String(settings[key] as number);
  return out;
}

export function AdminSettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const [values, setValues] = useState(() => toFormValues(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedInfo, setSavedInfo] = useState<{ updatedAt: string | null; updatedBy: string | null } | null>(
    initial.updatedAt ? { updatedAt: initial.updatedAt, updatedBy: initial.updatedBy } : null
  );

  async function save() {
    setError("");
    const payload: Record<string, number> = {};
    for (const { key, label } of FIELD_DEFS) {
      const n = Number(values[key]);
      if (!Number.isInteger(n) || n < 1) {
        setError(`${label}는 1 이상의 정수여야 합니다.`);
        return;
      }
      payload[keyToSnake(key)] = n;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "저장 실패");
      setSavedInfo({ updatedAt: data.updated_at ?? null, updatedBy: data.updated_by ?? null });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface">
      {FIELD_DEFS.map(({ key, label, note, suffix }) => (
        <div key={key} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
          <div>
            <span className="text-sm text-muted-foreground">{label}</span>
            {note && <div className="text-xs text-warning">{note}</div>}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={values[key]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [key]: e.target.value.replace(/\D/g, "").slice(0, 6) }))
              }
              inputMode="numeric"
              className="w-20 rounded-md border border-border bg-background px-2.5 py-1.5 text-right text-sm text-foreground"
            />
            <span className="text-sm text-muted-foreground">{suffix}</span>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-xs text-muted-foreground">
          {savedInfo?.updatedAt
            ? `마지막 변경: ${new Date(savedInfo.updatedAt).toLocaleString("ko-KR")}${savedInfo.updatedBy ? ` · ${savedInfo.updatedBy}` : ""}`
            : "아직 변경 이력 없음(기본값)"}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
      {error && <p className="px-4 pb-3 text-xs text-danger">{error}</p>}
    </div>
  );
}

function keyToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}
