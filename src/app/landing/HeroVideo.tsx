"use client";

import { Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const POSTER = "/landing/hero/acut-demo-poster.webp";

export function HeroVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [mobile, setMobile] = useState(false);
  const poster = mobile ? "/landing/hero/acut-demo-mobile-poster.webp" : POSTER;
  const stem = mobile ? "acut-demo-mobile" : "acut-demo";
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    // 사용자 설정을 확인하기 전에는 poster만 표시해 불필요한 다운로드/재생을 막는다.
    const viewport = window.matchMedia("(max-width: 767px)");
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setMobile(viewport.matches);
      setEnabled(!preference.matches);
      if (preference.matches) {
        video.current?.pause();
        setPlaying(false);
      }
    };
    sync();
    preference.addEventListener("change", sync);
    viewport.addEventListener("change", sync);
    return () => { preference.removeEventListener("change", sync); viewport.removeEventListener("change", sync); };
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!enabled || !element) return;
    let disposed = false;

    // iOS Safari는 소스가 바뀐 직후 play()를 호출하면 준비 전 요청을 취소할 수 있다.
    // MP4를 다시 선택하도록 load()한 뒤 canplay 시점에도 재생을 시도한다.
    element.muted = true;
    element.defaultMuted = true;
    element.setAttribute("muted", "");
    element.setAttribute("playsinline", "");
    element.setAttribute("webkit-playsinline", "");

    const tryPlay = () => {
      const request = element.play();
      request?.then(() => {
        if (!disposed) setPlaybackBlocked(false);
      }).catch(() => {
        if (!disposed) {
          setPlaying(false);
          setPlaybackBlocked(true);
        }
      });
    };
    const handleCanPlay = () => tryPlay();

    element.addEventListener("canplay", handleCanPlay, { once: true });
    element.load();
    if (element.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) tryPlay();

    return () => {
      disposed = true;
      element.removeEventListener("canplay", handleCanPlay);
      element.pause();
    };
  }, [enabled, mobile]);

  const retryPlayback = useCallback(() => {
    const element = video.current;
    if (!element) return;
    element.muted = true;
    setPlaybackBlocked(false);
    element.play()?.catch(() => setPlaybackBlocked(true));
  }, []);

  return (
    <figure id="product-preview" className="ac-preview" tabIndex={-1} aria-labelledby="preview-caption">
      <div className="ac-hero-film" data-playing={playing && enabled}>
        {/* 첫 프레임을 독립적으로 유지해 소스 오류 때도 빈 화면이 생기지 않는다. */}
        <picture><source media="(max-width: 767px)" srcSet="/landing/hero/acut-demo-mobile-poster.webp" /><img className="ac-hero-poster" src={POSTER} width={2400} height={1282} fetchPriority="high" alt="휴대폰에서 사진을 선택하고 작가에게 요청을 전달하는 A-CUT 고객 화면" /></picture>
        {enabled && <video
          key={stem}
          ref={video}
          autoPlay muted playsInline loop
          preload="metadata"
          poster={poster}
          width={mobile ? 960 : 2400} height={mobile ? 1200 : 1282}
          aria-label="고객이 사진 3장을 선택하고 요청을 남기면 작가에게 동일한 사진과 요청이 정리되고 작가가 보정본을 업로드하는 20초 제품 시연"
          // 반복 경계의 waiting은 오류가 아니다. 재생한 프레임을 유지해 poster 전환 깜빡임을 막는다.
          onLoadStart={() => setPlaybackBlocked(false)}
          onPlaying={() => { setPlaying(true); setPlaybackBlocked(false); }}
          onError={() => { setPlaying(false); setPlaybackBlocked(true); }}
        >
          {/* H.264 MP4를 먼저 두어 iOS Safari가 WebM을 잘못 선택하는 경우를 피한다. */}
          <source src={`/landing/hero/${stem}.mp4`} type="video/mp4" />
          <source src={`/landing/hero/${stem}.webm`} type="video/webm" />
        </video>}
        {enabled && playbackBlocked && (
          <button type="button" className="ac-hero-play" onClick={retryPlayback} aria-label="제품 시연 영상 재생">
            <Play size={16} fill="currentColor" aria-hidden="true" />
            영상 재생
          </button>
        )}
      </div>
      <figcaption id="preview-caption">고객은 사진을 고르고 요청을 남기고, 작가는 선택 결과를 모아 확인합니다.</figcaption>
    </figure>
  );
}
