"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { getSamplePhoto } from "./sample-project";
import "./sample-photo.css";

/** 기존 사진 프레임의 비율을 그대로 채운다. URL별 상태를 분리해 이전 사진을 보여주지 않는다. */
export function SamplePhoto({ id, retouched = false, priority = false }: { id: string; retouched?: boolean; priority?: boolean }) {
  const photo = getSamplePhoto(id);
  const available = retouched ? photo.retouchedAvailable : photo.originalAvailable;
  if (!available) {
    return <div className="ac-sample-placeholder" role="img" aria-label={`${photo.filename} ${retouched ? "보정본" : "원본"} 준비 중`}><ImageIcon size={26} strokeWidth={1} aria-hidden="true" /><span>{retouched ? "보정본 준비 중" : `PHOTO ${id}`}</span></div>;
  }
  const src = retouched ? photo.retouchedSrc : photo.originalSrc;
  return <SamplePhotoImage key={src} src={src} id={id} retouched={retouched} priority={priority} />;
}
function SamplePhotoImage({ src, id, retouched, priority }: { src: string; id: string; retouched: boolean; priority: boolean }) {
  const photo = getSamplePhoto(id);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const imageRef = useRef<HTMLImageElement>(null);

  // SSR 이미지가 hydration 전에 캐시에서 완료돼도 loading 상태가 남지 않게 보정한다.
  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    const frame = requestAnimationFrame(() => {
      setStatus(image.naturalWidth > 0 ? "loaded" : "error");
    });
    return () => cancelAnimationFrame(frame);
  }, [src]);

  return <div className="ac-sample-image" data-image-state={status} data-photo-id={id} data-version={retouched ? "retouched" : "original"}>
    {/* 불러오는 동안은 글자 없이 골격만 — 사진 버튼 안에 접근성 이름과 다른 글자가 보이지 않게 한다. */}
    {status === "loading" && <span className="ac-sample-image-skeleton skeleton-block" aria-hidden="true" />}
    {status === "error" && <span className="ac-sample-image-status" role="status">사진을 불러오지 못했어요.</span>}
    {/* 로컬 JPEG를 직접 사용해 이미지 최적화 서버나 외부 URL 없이 동일 자산을 공유한다. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={imageRef} src={src} width={photo.width} height={photo.height} alt={`${photo.filename} · ${photo.description} · ${retouched ? "보정본" : "원본"} (AI 생성)`} loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} style={{ objectPosition: photo.objectPosition }} onLoad={() => setStatus("loaded")} onError={() => setStatus("error")} />
  </div>;
}
