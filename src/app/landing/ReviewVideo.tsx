"use client";
import { useEffect, useRef, useState } from "react";

const BASE = "/landing/review/acut-review";
/** 랜딩 전용 정적 영상. 운영 API 없이 poster와 무음 미디어만 읽는다. */
export function ReviewVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ending, setEnding] = useState(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setEnabled(!preference.matches); if (preference.matches) { video.current?.pause(); setPlaying(false); } };
    sync(); preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!enabled || !element) return;
    let disposed = false;
    element.play()?.catch(() => { if (!disposed) setPlaying(false); });
    return () => { disposed = true; element.pause(); };
  }, [enabled]);
  return <div className="as-review-film" data-playing={enabled && playing} data-ending={ending}>
    {/* 로딩·실패·움직임 축소 상태에서도 같은 비율의 첫 장면을 유지한다. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`${BASE}-poster.webp`} width={2400} height={1440} alt="보정본을 원본과 비교하고 사진별 재보정 요청을 남기는 A-CUT 검토 화면" loading="lazy" />
    {enabled && <video ref={video} autoPlay muted playsInline loop preload="metadata" poster={`${BASE}-poster.webp`} width={2400} height={1440}
      aria-label="원본 보기 버튼을 2초씩 두 번 누르고 사진별 요청을 남기는 12초 시연"
      onPlaying={() => setPlaying(true)} onError={() => setPlaying(false)}
      // 마지막 장면에서 첫 장면으로 부드럽게 돌아온다. waiting은 오류로 취급하지 않는다.
      onTimeUpdate={event => setEnding(event.currentTarget.currentTime > 11.4)}>
      <source src={`${BASE}.webm`} type="video/webm" /><source src={`${BASE}.mp4`} type="video/mp4" />
    </video>}
  </div>;
}
