"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Globe2, Instagram, X } from "lucide-react";
import { CustomerEntryHeader, CustomerEntryShell } from "./CustomerEntryShell";
import { DEFAULT_PROFILE_IMAGE } from "@/lib/photographer";
import styles from "./CustomerInviteIntro.module.css";

const AVATAR_FALLBACK = DEFAULT_PROFILE_IMAGE;

export function CustomerInviteIntro({
  href,
  heroUrl,
  heroAlt,
  photographerLabel,
  photographerAvatarUrl,
  photographerBio,
  photographerInstagramUrl,
  photographerPortfolioUrl,
  children,
  actions,
  variant = "review",
}: {
  href?: string;
  heroUrl: string | null;
  heroAlt: string;
  photographerLabel: string;
  photographerAvatarUrl: string;
  photographerBio?: string | null;
  photographerInstagramUrl?: string | null;
  photographerPortfolioUrl?: string | null;
  children: ReactNode;
  actions: ReactNode;
  variant?: "selection" | "review";
}) {
  const profileDialogRef = useRef<HTMLDialogElement>(null);
  const [preloadedHero, setPreloadedHero] = useState<{ requestedUrl: string; resolvedUrl: string } | null>(null);
  const [paintedHeroUrl, setPaintedHeroUrl] = useState<string | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const resolvedHeroUrl = preloadedHero?.requestedUrl === heroUrl ? preloadedHero.resolvedUrl : null;
  const avatarSrc = photographerAvatarUrl && failedAvatarUrl !== photographerAvatarUrl
    ? photographerAvatarUrl
    : AVATAR_FALLBACK;
  const bio = photographerBio?.trim() || null;
  const instagramUrl = safeExternalUrl(photographerInstagramUrl);
  const portfolioUrl = safeExternalUrl(photographerPortfolioUrl);
  const hasProfileDetails = Boolean(bio || instagramUrl || portfolioUrl);

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
          {hasProfileDetails ? (
            <button
              type="button"
              className={styles.creatorButton}
              aria-label={`${photographerLabel} 소개 보기`}
              onClick={() => profileDialogRef.current?.showModal()}
            >
              <ProfileIdentity avatarSrc={avatarSrc} label={photographerLabel} onAvatarError={() => {
                if (avatarSrc !== AVATAR_FALLBACK) setFailedAvatarUrl(avatarSrc);
              }} />
              <span className={styles.creatorAction}>작가 소개 <ChevronRight size={14} aria-hidden /></span>
            </button>
          ) : (
            <div className={styles.creatorIdentity}>
              <ProfileIdentity avatarSrc={avatarSrc} label={photographerLabel} onAvatarError={() => {
                if (avatarSrc !== AVATAR_FALLBACK) setFailedAvatarUrl(avatarSrc);
              }} />
            </div>
          )}
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

      {hasProfileDetails ? (
        <dialog
          ref={profileDialogRef}
          className={styles.profileDialog}
          aria-labelledby="customer-photographer-profile-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
        >
          <div className={styles.profileSheet}>
            <span className={styles.profileHandle} aria-hidden />
            <button
              type="button"
              className={styles.profileClose}
              aria-label="작가 소개 닫기"
              onClick={() => profileDialogRef.current?.close()}
            >
              <X size={19} aria-hidden />
            </button>
            <div className={styles.profileHeading}>
              <img className={styles.profileAvatar} src={avatarSrc} alt="" width={56} height={56} />
              <div>
                <p className={styles.profileEyebrow}>PHOTOGRAPHER</p>
                <h2 id="customer-photographer-profile-title" className={styles.profileTitle}>{photographerLabel}</h2>
              </div>
            </div>
            {bio ? <p className={styles.profileBio}>{bio}</p> : null}
            {instagramUrl || portfolioUrl ? (
              <div className={styles.profileLinks}>
                {instagramUrl ? (
                  <a href={instagramUrl} target="_blank" rel="noreferrer">
                    <Instagram size={17} aria-hidden /> Instagram
                  </a>
                ) : null}
                {portfolioUrl ? (
                  <a href={portfolioUrl} target="_blank" rel="noreferrer">
                    <Globe2 size={17} aria-hidden /> Portfolio
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </dialog>
      ) : null}
    </CustomerEntryShell>
  );
}

function ProfileIdentity({ avatarSrc, label, onAvatarError }: {
  avatarSrc: string;
  label: string;
  onAvatarError: () => void;
}) {
  return (
    <>
      <img className={styles.avatar} src={avatarSrc} alt="" width={30} height={30} onError={onAvatarError} />
      <span className={styles.creatorName}>{label}</span>
    </>
  );
}

function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
