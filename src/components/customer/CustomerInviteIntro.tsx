"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CustomerEntryHeader, CustomerEntryShell } from "./CustomerEntryShell";
import styles from "./CustomerInviteIntro.module.css";

const AVATAR_FALLBACK = "/customer/entry/avatar-fallback.svg";

export function CustomerInviteIntro({
  href,
  heroUrl,
  heroAlt,
  photographerLabel,
  photographerAvatarUrl,
  children,
  actions,
  variant = "review",
}: {
  href?: string;
  heroUrl: string | null;
  heroAlt: string;
  photographerLabel: string;
  photographerAvatarUrl: string;
  children: ReactNode;
  actions: ReactNode;
  variant?: "selection" | "review";
}) {
  const [preloadedHero, setPreloadedHero] = useState<{ requestedUrl: string; resolvedUrl: string } | null>(null);
  const [paintedHeroUrl, setPaintedHeroUrl] = useState<string | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const resolvedHeroUrl = preloadedHero?.requestedUrl === heroUrl ? preloadedHero.resolvedUrl : null;
  const avatarSrc = photographerAvatarUrl && failedAvatarUrl !== photographerAvatarUrl
    ? photographerAvatarUrl
    : AVATAR_FALLBACK;

  useEffect(() => {
    if (!heroUrl) return;

    let cancelled = false;
    const preload = new Image();
    preload.onload = () => {
      if (!cancelled) setPreloadedHero({ requestedUrl: heroUrl, resolvedUrl: heroUrl });
    };
    preload.onerror = () => {
      if (!cancelled) {
        setPreloadedHero((current) => current?.requestedUrl === heroUrl ? null : current);
      }
    };
    preload.src = heroUrl;

    return () => {
      cancelled = true;
      preload.onload = null;
      preload.onerror = null;
    };
  }, [heroUrl]);

  return (
    <CustomerEntryShell
      className={`${styles.canvas} ${variant === "selection" ? styles.selectionCanvas : ""}`}
      layout="responsive"
    >
      <div className={styles.hero} data-entry-hero>
        <div className={styles.heroPlaceholder} data-entry-hero-placeholder aria-hidden="true">
          <span>A</span>
        </div>
        {resolvedHeroUrl ? (
          <img
            className={`${styles.heroImage} ${paintedHeroUrl === resolvedHeroUrl ? styles.heroImageLoaded : ""}`}
            src={resolvedHeroUrl}
            alt={heroAlt}
            onLoad={() => setPaintedHeroUrl(resolvedHeroUrl)}
            onError={() => setPreloadedHero(null)}
          />
        ) : null}
        <CustomerEntryHeader href={href} overlay />
        <div className={styles.creator}>
          <img
            className={styles.avatar}
            src={avatarSrc}
            alt=""
            width={30}
            height={30}
            onError={() => {
              if (avatarSrc !== AVATAR_FALLBACK) setFailedAvatarUrl(avatarSrc);
            }}
          />
          <p className={styles.creatorName}>{photographerLabel}</p>
        </div>
      </div>

      <div className={styles.panel} data-entry-panel>
        <div
          className={`${styles.copy} ${variant === "selection" ? styles.selectionCopy : ""}`}
          data-entry-copy
        >
          {children}
        </div>
        <div className={styles.actions} data-entry-actions>{actions}</div>
      </div>
    </CustomerEntryShell>
  );
}
