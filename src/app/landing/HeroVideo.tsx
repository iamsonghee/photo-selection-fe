"use client";

import { Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// 진단 정보는 브라우저 안에만 보관하며 서버로 전송하지 않는다.
function recordPlayback(element: HTMLVideoElement, result: string) {
  element.dispatchEvent(new CustomEvent("acut-playback", { detail: result }));
}

const POSTER = "/landing/hero/acut-demo-poster.webp";

export function HeroVideo() {
  const video = useRef<HTMLVideoElement>(null);
  // 서버 HTML은 모바일 MP4로 시작해 iOS가 hydration 전부터 네이티브 autoplay를 시도하게 한다.
  const [mobile, setMobile] = useState(true);
  const stem = mobile ? "acut-demo-mobile" : "acut-demo";
  const poster = mobile ? "/landing/hero/acut-demo-mobile-poster.webp" : POSTER;
  const [playing, setPlaying] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  const [diagnostics, setDiagnostics] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("videoDebug") !== "1") return;
    const element = video.current;
    if (!element) return;
    const events: string[] = [];
    const update = (event?: Event) => {
      if (event) {
        events.push(`${Math.round(performance.now())}ms ${event.type}: ${event instanceof CustomEvent ? event.detail : ""}`);
        if (events.length > 30) events.shift();
      }
      const rect = element.getBoundingClientRect();
      setDiagnostics(JSON.stringify({
        version: "hero-autoplay-v2", userAgent: navigator.userAgent,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        visibility: document.visibilityState, viewport: [innerWidth, innerHeight],
        bounds: [rect.x, rect.y, rect.width, rect.height],
        source: element.currentSrc, time: element.currentTime,
        paused: element.paused, muted: element.muted, inline: element.playsInline,
        readyState: element.readyState, networkState: element.networkState,
        error: element.error ? { code: element.error.code, message: element.error.message } : null,
        events,
      }, null, 2));
    };
    const names = ["loadstart", "loadedmetadata", "canplay", "playing", "pause", "waiting", "stalled", "error", "acut-playback"];
    names.forEach(name => element.addEventListener(name, update));
    const timer = setInterval(update, 1000);
    return () => { clearInterval(timer); names.forEach(name => element.removeEventListener(name, update)); };
  }, [mobile]);

  // 재생 이벤트가 늦어도 실제 시간 진행을 확인해 남아 있는 재생 버튼을 숨긴다.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let previous = element.currentTime;
    const observeProgress = () => {
      const current = element.currentTime;
      if (!element.paused && !element.seeking && current !== previous) {
        setPlaying(true);
        setPlaybackBlocked(false);
      }
      previous = current;
    };
    element.addEventListener("timeupdate", observeProgress);
    return () => element.removeEventListener("timeupdate", observeProgress);
  }, [mobile]);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(viewport.matches);
    sync();
    viewport.addEventListener("change", sync);
    return () => {
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

    // 사용자 요청에 따라 움직임 축소 설정과 무관하게 무음 자동재생을 시도한다.
    element.autoplay = true;
    element.setAttribute("autoplay", "");
    let inView = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    let pending = false;
    const tryPlay = () => {
      if (pending || (!element.paused && element.readyState >= 2)) return;
      pending = true;
      recordPlayback(element, "automatic request");
      element.play()?.then(() => {
        if (!disposed) { recordPlayback(element, "automatic resolved"); setPlaybackBlocked(false); }
      }).catch((error: unknown) => {
        if (!disposed) {
          recordPlayback(element, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
          if (element.paused) setPlaying(false);
        }
      }).finally(() => { pending = false; });
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
  }, [mobile]);

  const retryPlayback = useCallback(() => {
    const element = video.current;
    if (!element) return;
    element.muted = true;
    element.defaultMuted = true;
    element.setAttribute("muted", "");
    element.setAttribute("playsinline", "");
    element.setAttribute("webkit-playsinline", "");
    setPlaybackBlocked(false);
    // 클릭 이벤트 안에서 곧바로 play()를 호출해야 iOS의 사용자 제스처 권한이 유지된다.
    recordPlayback(element, "manual request");
    element.play()?.then(() => setPlaybackBlocked(false)).catch((error: unknown) => {
      recordPlayback(element, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      if (element.paused) setPlaybackBlocked(true);
    });
  }, []);

  return (
    <figure id="product-preview" className="ac-preview" tabIndex={-1} aria-labelledby="preview-caption">
      <div className="ac-hero-film" data-playing={playing}>
        {/* 첫 프레임을 독립적으로 유지해 소스 오류 때도 빈 화면이 생기지 않는다. */}
        <picture><source media="(max-width: 767px)" srcSet="/landing/hero/acut-demo-mobile-poster.webp" /><img className="ac-hero-poster" src={POSTER} width={2400} height={1282} fetchPriority="high" alt="휴대폰에서 사진을 선택하고 작가에게 요청을 전달하는 A-CUT 고객 화면" /></picture>
        <video
          key={stem}
          ref={video}
          autoPlay muted playsInline loop
          preload="metadata"
          poster={poster}
          width={mobile ? 960 : 2400} height={mobile ? 1200 : 1282}
          aria-label="고객이 사진 3장을 선택하고 요청을 남기면 작가에게 동일한 사진과 요청이 정리되고 작가가 보정본을 업로드하는 20초 제품 시연"
          // 반복 경계의 waiting은 오류가 아니다. 재생한 프레임을 유지해 poster 전환 깜빡임을 막는다.
          onPlaying={() => {
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
      {diagnostics !== null && (
        <details style={{ marginTop: 12, textAlign: "left" }}>
          <summary>영상 재생 진단 · 펼쳐서 결과 복사</summary>
          <textarea aria-label="영상 재생 진단 결과" readOnly value={diagnostics}
            onFocus={event => event.currentTarget.select()}
            style={{ width: "100%", height: 240, fontSize: 12, color: "#222", background: "#fff" }} />
        </details>
      )}
      <figcaption id="preview-caption">고객은 사진을 고르고 요청을 남기고, 작가는 선택 결과를 모아 확인합니다.</figcaption>
    </figure>
  );
}
