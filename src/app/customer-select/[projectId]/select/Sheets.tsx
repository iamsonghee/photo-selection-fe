"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { CustomerShareLinkField } from "../../_lib/CustomerShareLinkField";
import type { Person } from "./PhotoDetail";
import s from "./select.module.css";

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={s.sheetBackdrop} onClick={onClose}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className={s.sheetHead}>
          <h2>{title}</h2>
          <button type="button" className={s.sheetClose} onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>
        <div className={s.sheetBody}>{children}</div>
      </div>
    </div>
  );
}

const MAX_PEOPLE = 5;

export function InviteSheet({ projectId, shareToken, shareEnabled, people, online, done, onClose }: {
  projectId: string;
  shareToken: string;
  shareEnabled: boolean;
  people: Person[];
  online: ReadonlySet<string>;
  done: Record<string, boolean>;
  onClose: () => void;
}) {
  return (
    <Sheet title="함께 고르기" onClose={onClose}>
      <p>링크를 받은 사람은 마음에 드는 사진에 찜과 메모를 남길 수 있어요. 보정 받을 사진은 나만 정해요. 나를 포함해 최대 {MAX_PEOPLE}명까지 함께할 수 있어요.</p>
      {shareEnabled && shareToken
        ? <CustomerShareLinkField projectId={projectId} token={shareToken} allowShare />
        : <p>초대 링크가 중지되어 있어요. 설정에서 다시 켤 수 있어요.</p>}
      <div>
        {people.map((person) => (
          <div key={person.id} className={s.personRow}>
            <i style={{ background: person.hex }} />
            <strong>{person.name}</strong>
            <span>{[online.has(person.id) ? "온라인" : null, done[person.id] ? "다 골랐어요" : null].filter(Boolean).join(" · ") || "참여 중"}</span>
          </div>
        ))}
      </div>
      <Link className={s.textLink} href={`/customer-select/${projectId}/settings#sharing`}>링크 관리 (중지 · 새 링크 만들기)</Link>
    </Sheet>
  );
}
