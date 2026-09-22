"use client";

import { useState } from "react";
import { Copy, Link2, RefreshCw, Unlink } from "lucide-react";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";

type ShareAction = "disable" | "rotate";

export function CustomerShareLinkManager({ projectId, initialToken, initialEnabled }: { projectId: string; initialToken: string; initialEnabled: boolean }) {
  const [token, setToken] = useState(initialToken);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [confirmAction, setConfirmAction] = useState<ShareAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const relativeUrl = `/customer-select/${projectId}/select?share_token=${token}`;

  async function copyLink() {
    const url = `${window.location.origin}${relativeUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("초대 링크를 복사했어요.");
    } catch {
      window.prompt("아래 링크를 복사해 주세요", url);
    }
  }

  async function applyAction() {
    if (!confirmAction) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/customer-select/projects/${projectId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: confirmAction }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "공유 링크를 변경하지 못했어요.");
      setToken(result.shareToken);
      setEnabled(result.sharingEnabled);
      setMessage(confirmAction === "disable" ? "링크 공유를 중지했어요." : "새 초대 링크를 만들었어요.");
      setConfirmAction(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "공유 링크를 변경하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section id="sharing" className="rounded-2xl border border-border-subtle bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-foreground">함께 고르는 사람</h2>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground">초대 링크로 최대 5명까지 참여할 수 있어요.</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-surface-raised text-muted-foreground"}`}>{enabled ? "공유 중" : "공유 중지"}</span>
      </div>

      {enabled ? <div className="mt-5 flex min-w-0 items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised p-2 pl-4">
        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{relativeUrl}</span>
        <button type="button" onClick={copyLink} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-foreground px-4 text-xs font-bold text-background"><Copy className="h-4 w-4" />복사</button>
      </div> : <div className="mt-5 rounded-xl bg-surface-raised px-4 py-3 text-[13px] leading-5 text-muted-foreground">기존 링크와 참여자의 접속이 차단된 상태예요. 기존 셀렉과 의견 기록은 그대로 보존됩니다.</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        <PhotographerLightButton variant="secondary" onClick={() => setConfirmAction("rotate")}><RefreshCw className="h-4 w-4" />{enabled ? "링크 재발급" : "새 링크 만들기"}</PhotographerLightButton>
        {enabled && <PhotographerLightButton variant="secondary" onClick={() => setConfirmAction("disable")}><Unlink className="h-4 w-4" />공유 중지</PhotographerLightButton>}
      </div>
      {message && <p className="mt-3 text-xs font-semibold text-muted-foreground" role="status">{message}</p>}
    </section>

    {confirmAction && <SelectionConfirmDialog
      title={confirmAction === "disable" ? "링크 공유를 중지할까요?" : enabled ? "초대 링크를 재발급할까요?" : "새 초대 링크를 만들까요?"}
      description={confirmAction === "disable"
        ? <>현재 링크와 이미 접속한 참여자의 이용이 즉시 중지됩니다.<br />셀렉과 의견 기록은 삭제되지 않아요.</>
        : <>기존 링크와 참여자의 접속은 즉시 만료됩니다.<br />새 링크를 다시 전달해 주세요.</>}
      confirmLabel={confirmAction === "disable" ? "공유 중지" : "새 링크 만들기"}
      busyLabel="변경 중…"
      confirming={busy}
      danger={confirmAction === "disable"}
      onCancel={() => setConfirmAction(null)}
      onConfirm={applyAction}
    />}
  </>;
}
