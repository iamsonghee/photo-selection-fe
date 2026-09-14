"use client";

import { Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// 진단 정보는 브라우저 안에만 보관하며 서버로 전송하지 않는다.
function recordPlayback(element: HTMLVideoElement, result: string) {
  element.dispatchEvent(new CustomEvent("acut-playback", { detail: result }));
}

type LandingVideoProps = {
  src: string; poster: string; width: number; height: number;
  className: string; label: string; alt: string; priority?: boolean;
};

/** 랜딩 영상의 자동재생·가시성 재시도·오류 복구를 한 곳에서 관리한다. */
export function LandingVideo({ src, poster, width, height, className, label, alt, priority = false }: LandingVideoProps) {
  const video = useRef<HTMLVideoElement>(null);
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
        version: "landing-autoplay-v3", userAgent: navigator.userAgent,
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
  }, [src]);

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
  }, [src]);

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
  }, [src]);

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
    <>
      <div className={className} data-playing={playing}>
        {/* 영상 준비 전에도 동일 비율의 poster를 유지한다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ac-hero-poster" src={poster} width={width} height={height}
          fetchPriority={priority ? "high" : "auto"} loading={priority ? "eager" : "lazy"} alt={alt} />
        <video
          key={src}
          ref={video}
          autoPlay muted playsInline loop
          preload="metadata"
          poster={poster}
          width={width} height={height}
          aria-label={label}
          // 반복 경계의 waiting은 오류가 아니다. 재생한 프레임을 유지해 poster 전환 깜빡임을 막는다.
          onPlaying={() => {
            setPlaying(true);
            setPlaybackBlocked(false);
          }}
          onError={() => { setPlaying(false); setPlaybackBlocked(true); }}
        >
          {/* 히어로와 검토 영상 모두 H.264 MP4 하나를 제공한다. */}
          <source src={src} type="video/mp4" />
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
    </>
  );
}
