"use client";

import { Copy, Link2, Share2 } from "lucide-react";
import { useState } from "react";

export function CustomerShareLinkField({ projectId, token, allowShare = false }: { projectId: string; token: string; allowShare?: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const relativeUrl = `/customer-select/${projectId}/select?share_token=${token}`;
  const url = () => `${window.location.origin}${relativeUrl}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url());
      setMessage("초대 링크를 복사했어요.");
    } catch {
      window.prompt("아래 링크를 복사해 주세요", url());
    }
  }

  async function shareLink() {
    if (!navigator.share) return copyLink();
    try {
      await navigator.share({ title: "함께 사진 골라요", url: url() });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyLink();
    }
  }

  return <div>
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised p-2 pl-4">
      <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">A-CUT 초대 링크 · 주소의 보안 토큰은 숨겨져 있어요</span>
      {allowShare ? <button type="button" onClick={shareLink} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 text-xs font-bold text-foreground hover:border-border-strong"><Share2 className="size-4" />공유</button> : null}
      <button type="button" onClick={copyLink} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-bold text-background"><Copy className="size-4" />복사</button>
    </div>
    {message ? <p className="mt-2 text-xs font-semibold text-muted-foreground" role="status">{message}</p> : null}
  </div>;
}
