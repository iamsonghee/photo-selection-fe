"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Expand, X } from "lucide-react";
import { PrevNextButton } from "@/components/PrevNextButton";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";
import type { FinalDeliveryPreviewFile } from "@/lib/customer-api-server";
import styles from "./FinalDeliveryPreview.module.css";

export function FinalDeliveryPreview({ files }: { files: FinalDeliveryPreviewFile[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const visibleFiles = useMemo(() => files.slice(0, 5), [files]);
  const activeFile = activeIndex === null ? null : files[activeIndex];

  const move = useCallback((delta: number) => {
    setActiveIndex((current) => current === null ? current : (current + delta + files.length) % files.length);
  }, [files.length]);

  useEffect(() => {
    if (activeIndex === null || focused) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveIndex(null);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, focused, move]);

  if (files.length === 0) return null;

  return (
    <section className={styles.root} aria-label="최종 보정본 미리보기">
      <div className={styles.heading}>
        <div>
          <h2>최종 보정본</h2>
        </div>
        <span className={styles.count}>총 {files.length.toLocaleString()}장</span>
      </div>
      <p className={styles.description}>사진을 눌러 크게 보기</p>

      <div className={styles.grid}>
        {visibleFiles.map((file, index) => {
          const isMobileMoreCard = index === 2 && files.length > 2;
          const isDesktopMoreCard = index === 4 && files.length > 5;
          return (
            <button key={`${file.photoId}-${index}`} type="button" className={styles.thumb} onClick={() => setActiveIndex(index)} aria-label={`${file.filename} 크게 보기`}>
              <img src={file.thumbnailUrl} alt="" />
              {isMobileMoreCard && (
                <span className={`${styles.more} ${styles.mobileMore}`}>
                  <strong>+{(files.length - index).toLocaleString()}</strong>
                  <small>더보기</small>
                </span>
              )}
              {isDesktopMoreCard && (
                <span className={`${styles.more} ${styles.desktopMore}`}>
                  <strong>+{(files.length - index).toLocaleString()}</strong>
                  <small>더보기</small>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeFile && (
        <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={`${activeFile.filename} 상세 보기`} onClick={(event) => event.target === event.currentTarget && setActiveIndex(null)}>
          <header className={styles.viewerHeader}>
            <div>
              <strong>{activeFile.filename}</strong>
              <span>{(activeIndex! + 1).toLocaleString()} / {files.length.toLocaleString()}</span>
            </div>
            <button type="button" aria-label="닫기" onClick={() => setActiveIndex(null)}><X size={21} /></button>
          </header>
          <div className={styles.stage}>
            {files.length > 1 && <PrevNextButton direction="prev" size="lg" onClick={(event) => { event.stopPropagation(); move(-1); }} />}
            <button type="button" className={styles.photoButton} onClick={() => setFocused(true)} aria-label="사진만 크게 보기">
              <img src={activeFile.url} alt={activeFile.filename} />
              <span><Expand size={14} aria-hidden /> 사진만 크게 보기</span>
            </button>
            {files.length > 1 && <PrevNextButton direction="next" size="lg" onClick={(event) => { event.stopPropagation(); move(1); }} />}
          </div>
        </div>
      )}

      <PhotoFocusOverlay
        open={focused && Boolean(activeFile)}
        src={activeFile?.url ?? ""}
        alt={activeFile?.filename ?? "최종 보정본"}
        onClose={() => setFocused(false)}
        onPrev={files.length > 1 ? () => move(-1) : undefined}
        onNext={files.length > 1 ? () => move(1) : undefined}
      />
    </section>
  );
}
