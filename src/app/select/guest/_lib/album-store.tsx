"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { GuestAlbumInfo, GuestMedia, GuestUploadLimits } from "@/lib/guest-album";

type GuestAlbumState = {
  album: GuestAlbumInfo;
  media: GuestMedia[];
  guests: number;
  limits: GuestUploadLimits;
  /** 셀렉 시작 = 하객 업로드 마감 */
  close: () => Promise<void>;
  selected: Set<string>;
  toggle: (id: string) => void;
  saving: boolean;
  saveError: string;
  setWeddingDate: (date: string) => void;
};

const GuestAlbumContext = createContext<GuestAlbumState | null>(null);

export function useGuestAlbum() {
  const value = useContext(GuestAlbumContext);
  if (!value) throw new Error("useGuestAlbum must be used inside the guest album layout");
  return value;
}

/**
 * 하객 앨범(신랑신부 화면) 상태. 앨범·파일은 레이아웃(서버)이 읽어 넘긴다.
 * 파일별 선택을 서버에 저장한다. 실패하면 화면 선택을 되돌린다.
 */
export function GuestAlbumProvider({ initialAlbum, media, guests, limits, children }: {
  initialAlbum: GuestAlbumInfo;
  media: GuestMedia[];
  guests: number;
  limits: GuestUploadLimits;
  children: ReactNode;
}) {
  const [album, setAlbum] = useState(initialAlbum);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(media.filter((item) => item.selected).map((item) => item.id)));
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function close() {
    const res = await fetch(`/api/customer-select/guest-albums/${album.id}/close`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "셀렉을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    setAlbum((current) => ({ ...current, closed: true }));
  }

  async function toggle(id: string) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setSaveError("");
    const previous = selected;
    const next = new Set(previous);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
    try {
      const response = await fetch(`/api/customer-select/guest-albums/${album.id}`, {
        method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select", mediaId: id, selected: next.has(id) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "저장하지 못했어요.");
    } catch (error) {
      setSelected(previous);
      setSaveError(`${error instanceof Error ? error.message : "저장하지 못했어요."} 다시 선택해 주세요.`);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <GuestAlbumContext.Provider value={{ album, media, guests, limits, close, selected, toggle, saving, saveError, setWeddingDate: (date) => setAlbum((current) => ({ ...current, weddingDate: date })) }}>
      {children}
    </GuestAlbumContext.Provider>
  );
}
