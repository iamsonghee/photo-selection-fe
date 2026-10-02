"use client";

import { useState, type ComponentProps } from "react";
import Image from "next/image";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";

export function SelectImage(props: ComponentProps<typeof Image>) {
  const [failed, setFailed] = useState(false);
  return <>
    <Image {...props} alt={props.alt} className={`${props.className ?? ""} ${failed ? "invisible" : ""}`} onLoad={event => { setFailed(false); props.onLoad?.(event); }} onError={event => { setFailed(true); props.onError?.(event); }} />
    {failed && <span role="img" aria-label={props.alt + " 불러오기 실패"} className="absolute inset-0 grid place-items-center bg-[var(--select-line)] p-2 text-center text-[12px] text-[var(--customer-ink-secondary)]">미리보기 오류</span>}
  </>;
}

export function SelectPhotoFocus(props: ComponentProps<typeof PhotoFocusOverlay>) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const src = props.src + (attempt ? `${props.src.includes("?") ? "&" : "?"}retry=${attempt}` : "");
  return <div onErrorCapture={event => { if (event.target instanceof HTMLImageElement) setFailedSrc(props.src); }}>
    <PhotoFocusOverlay {...props} src={src} />
    {props.open && failedSrc === props.src && <div role="status" className="fixed inset-0 z-[201] grid place-items-center bg-black text-center text-white"><div><p className="text-sm">사진을 불러오지 못했어요.</p><div className="mt-4 flex gap-2"><button className="min-h-11 rounded border border-white/40 px-4 text-xs" onClick={() => { setFailedSrc(null); setAttempt(attempt + 1); }}>다시 불러오기</button><button className="min-h-11 rounded border border-white/40 px-4 text-xs" onClick={props.onClose}>닫기</button></div></div></div>}
  </div>;
}
