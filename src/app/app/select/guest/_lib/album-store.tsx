"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
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
};

const GuestAlbumContext = createContext<GuestAlbumState | null>(null);

export function useGuestAlbum() {
  const value = useContext(GuestAlbumContext);
  if (!value) throw new Error("useGuestAlbum must be used inside the guest album layout");
  return value;
}

/**
 * 하객 앨범(신랑신부 화면) 상태. 앨범·파일은 레이아웃(서버)이 읽어 넘긴다.
 * ponytail: 고른 파일은 아직 메모리에만 있다(새로고침하면 초기화) — 2단계에서 서버에 저장한다.
 */
export function GuestAlbumProvider({ initialAlbum, media, guests, limits, children }: {
  initialAlbum: GuestAlbumInfo;
  media: GuestMedia[];
  guests: number;
  limits: GuestUploadLimits;
  children: ReactNode;
}) {
  const [album, setAlbum] = useState(initialAlbum);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  async function close() {
    const res = await fetch(`/api/customer-select/guest-albums/${album.id}/close`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "셀렉을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    setAlbum((current) => ({ ...current, closed: true }));
  }

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  return (
    <GuestAlbumContext.Provider value={{ album, media, guests, limits, close, selected, toggle }}>
      {children}
    </GuestAlbumContext.Provider>
  );
}
