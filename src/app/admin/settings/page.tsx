import { ADMIN_EMAILS } from "@/lib/admin-auth";
import { getAppSettings } from "@/lib/app-settings";
import { AdminSettingsForm } from "@/components/admin/AdminSettingsForm";

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <div className="text-sm font-medium text-foreground">{value}</div>
        {note && <div className="text-xs text-warning">{note}</div>}
      </div>
    </div>
  );
}

export default async function AdminSettingsPage() {
  const settings = await getAppSettings();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        등급별 이용 한도 — 값을 바꾸고 저장하면 재배포 없이 즉시 반영됩니다. 관리자 계정은 읽기 전용(사용자별 개별 조정은 Beta Users에서)
      </p>

      <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        일반(Trial) · 베타 이용 한도
      </h3>
      <AdminSettingsForm initial={settings} />

      <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        관리자 계정
      </h3>
      <div className="mt-3 rounded-xl border border-border bg-surface">
        {ADMIN_EMAILS.map((email) => (
          <Row key={email} label="이메일" value={email} note="이용 한도 없음" />
        ))}
      </div>
    </div>
  );
}
