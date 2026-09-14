"use client";

import { Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const POSTER = "/landing/hero/acut-demo-poster.webp";

export function HeroVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const manualPlayback = useRef(false);
  const reducedMotionEnabled = useRef(false);
  // 서버 HTML은 모바일 MP4로 시작해 iOS가 hydration 전부터 네이티브 autoplay를 시도하게 한다.
  const [mobile, setMobile] = useState(true);
  const stem = mobile ? "acut-demo-mobile" : "acut-demo";
  const poster = mobile ? "/landing/hero/acut-demo-mobile-poster.webp" : POSTER;
  const [reducedMotion, setReducedMotion] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 767px)");
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotionEnabled.current = preference.matches;
      setMobile(viewport.matches);
      setReducedMotion(preference.matches);
      if (preference.matches) {
        manualPlayback.current = false;
        video.current?.pause();
        setPlaying(false);
        setPlaybackBlocked(true);
      }
    };
    sync();
    preference.addEventListener("change", sync);
    viewport.addEventListener("change", sync);
    return () => {
      preference.removeEventListener("change", sync);
      viewport.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let disposed = false;

    // video를 첫 HTML부터 유지하고 muted/inline 상태를 보강해 iOS의 네이티브 autoplay 조건을 지킨다.
    element.muted = true;
    element.defaultMuted = true;
    element.setAttribute("muted", "");
    element.setAttribute("playsinline", "");
    element.setAttribute("webkit-playsinline", "");

    if (reducedMotion) {
      element.removeAttribute("autoplay");
      element.pause();
      const reducedTimer = setTimeout(() => {
        if (!disposed) setPlaybackBlocked(true);
      }, 0);
      return () => {
        disposed = true;
        clearTimeout(reducedTimer);
      };
    }

    element.autoplay = true;
    element.setAttribute("autoplay", "");
    let inView = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const tryPlay = () => {
      element.play()?.then(() => {
        if (!disposed) setPlaybackBlocked(false);
      }).catch(() => {
        if (!disposed) setPlaying(false);
      });
    };
    const scheduleFallback = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => {
        if (disposed || !inView) return;
        const unavailable = element.paused || element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || Boolean(element.error);
        if (unavailable) setPlaybackBlocked(true);
      }, 3000);
    };
    const playWhenVisible = () => {
      if (!inView || document.hidden) return;
      tryPlay();
      scheduleFallback();
    };
    const handleCanPlay = () => playWhenVisible();
    const handleVisibility = () => playWhenVisible();
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) playWhenVisible();
      else if (fallbackTimer) clearTimeout(fallbackTimer);
    }, { threshold: 0.1 });

    // iOS는 화면 밖에서 거절한 autoplay를 다시 시도하지 않을 수 있어 실제 노출 시점에 재요청한다.
    observer.observe(element);
    document.addEventListener("visibilitychange", handleVisibility);
    element.addEventListener("canplay", handleCanPlay);

    return () => {
      disposed = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      element.removeEventListener("canplay", handleCanPlay);
      element.pause();
    };
  }, [mobile, reducedMotion]);

  const retryPlayback = useCallback(() => {
    const element = video.current;
    if (!element) return;
    manualPlayback.current = true;
    element.muted = true;
    element.defaultMuted = true;
    element.setAttribute("muted", "");
    element.setAttribute("playsinline", "");
    element.setAttribute("webkit-playsinline", "");
    setPlaybackBlocked(false);
    // 클릭 이벤트 안에서 곧바로 play()를 호출해야 iOS의 사용자 제스처 권한이 유지된다.
    element.play()?.then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
  }, []);

  return (
    <figure id="product-preview" className="ac-preview" tabIndex={-1} aria-labelledby="preview-caption">
      <div className="ac-hero-film" data-playing={playing}>
        {/* 첫 프레임을 독립적으로 유지해 소스 오류 때도 빈 화면이 생기지 않는다. */}
        <picture><source media="(max-width: 767px)" srcSet="/landing/hero/acut-demo-mobile-poster.webp" /><img className="ac-hero-poster" src={POSTER} width={2400} height={1282} fetchPriority="high" alt="휴대폰에서 사진을 선택하고 작가에게 요청을 전달하는 A-CUT 고객 화면" /></picture>
        <video
          key={stem}
          ref={video}
          autoPlay={!reducedMotion} muted playsInline loop
          preload={reducedMotion ? "none" : "metadata"}
          poster={poster}
          width={mobile ? 960 : 2400} height={mobile ? 1200 : 1282}
          aria-label="고객이 사진 3장을 선택하고 요청을 남기면 작가에게 동일한 사진과 요청이 정리되고 작가가 보정본을 업로드하는 20초 제품 시연"
          // 반복 경계의 waiting은 오류가 아니다. 재생한 프레임을 유지해 poster 전환 깜빡임을 막는다.
          onPlaying={() => {
            if (reducedMotionEnabled.current && !manualPlayback.current) {
              video.current?.pause();
              setPlaying(false);
              setPlaybackBlocked(true);
              return;
            }
            setPlaying(true);
            setPlaybackBlocked(false);
          }}
          onError={() => { setPlaying(false); setPlaybackBlocked(true); }}
        >
          {/* iOS 첫 HTML에는 모바일 H.264 MP4 하나만 제공해 source 재선택을 피한다. */}
          <source src={`/landing/hero/${stem}.mp4`} type="video/mp4" />
        </video>
        {playbackBlocked && (
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
