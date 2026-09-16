"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import { getProfileImageUrl } from "@/lib/photographer";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { Badge } from "@/components/ui/Badge";
import OriginalDownloadEntry from "@/components/customer/OriginalDownloadEntry";
import { CustomerInviteIntro } from "@/components/customer/CustomerInviteIntro";
import { CustomerEntryHeader, CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import { customerDDay } from "@/lib/customer-dday";
import styles from "./customer-entry.module.css";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;

/* ── Loading ── */
function LoadingScreen() {
  return <SystemLoadingScreen />;
}

/* ══════════════════════════════════════════════════════════ */

export default function InvitePageClient() {
  const router   = useRouter();
  const params   = useParams();
  const token    = (params?.token as string) ?? "";
  const inviteHref = token ? `/c/${token}` : undefined;
  const ctx      = useSelectionOptional();
  const project  = ctx?.project ?? null;
  const firstPhotoId = ctx?.photos[0]?.id ?? null;
  const coverPhotoId = project?.coverPhotoId && ctx?.photos.some((photo) => photo.id === project.coverPhotoId)
    ? project.coverPhotoId
    : firstPhotoId;
  const loading  = ctx?.loading ?? true;
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);
  const [introImage, setIntroImage] = useState<{ photoId: string; url: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !coverPhotoId) return;
    let cancelled = false;
    fetch(`/api/c/presign-preview?token=${encodeURIComponent(token)}&photoId=${encodeURIComponent(coverPhotoId)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled && data?.url) setIntroImage({ photoId: coverPhotoId, url: data.url });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [coverPhotoId, token]);

  useEffect(() => {
    if (!project) return;
    if (project.status === "confirmed")  { router.replace(`/c/${token}/confirmed`); return; }
    if (project.status === "delivered")  { router.replace(`/c/${token}/delivered`); return; }
  }, [project, token, router]);

  if (loading) return <LoadingScreen />;

  if (!project) {
    return (
      <CustomerEntryShell className={styles.invalidCanvas}>
        <CustomerEntryHeader />
        <div className={styles.entryCopy}>
          <h1 className={styles.entryTitle}>이 링크는 사용할 수 없어요</h1>
          <p className={styles.entryDescription}>
            주소가 잘못되었거나 링크가 삭제되었을 수 있어요.<br />
            받은 메세지의 링크를 다시 확인해 주세요.
          </p>
        </div>
        <div className={styles.invalidIllustrationWrap} aria-hidden="true">
          <img
            className={styles.invalidIllustration}
            src="/customer/entry/invalid-link.png"
            alt=""
            width={245}
            height={367}
          />
        </div>
        <div className={styles.stickyActions}>
          <button
            className={styles.entryPrimary}
            type="button"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.assign("/");
            }}
          >
            작가에게 문의하기
          </button>
        </div>
      </CustomerEntryShell>
    );
  }

  if (["confirmed", "delivered"].includes(project.status)) return <LoadingScreen />;

  const introImageUrl = introImage?.photoId === coverPhotoId ? introImage.url : null;
  const entryPhotographerName = photographer?.name?.trim();
  const photographerLabel = entryPhotographerName ? `${entryPhotographerName} 작가` : "담당 작가";
  const avatarUrl = photographer?.profile_image_url
    ? getProfileImageUrl(photographer.profile_image_url)
    : "/customer/entry/avatar-fallback.svg";
  const introCommonProps = {
    href: inviteHref,
    heroUrl: introImageUrl,
    heroAlt: `${project.name} 대표 사진`,
    photographerLabel,
    photographerAvatarUrl: avatarUrl,
  };

  if (project.status === "selecting") {
    const recommendedCount = ctx?.photos.filter((photo) => photo.photographerRecommended).length ?? 0;
    const deadlineDate = new Date(project.deadline);
    // 고객 화면의 모든 기한은 갤러리·검토·다운로드와 같은 계산과 Badge를 사용한다.
    const dday = customerDDay(deadlineDate);
    return (
      <CustomerInviteIntro
        {...introCommonProps}
        variant="selection"
        actions={(
          <>
            {(ctx?.Y ?? 0) > 0 ? (
              <>
                <Link href={`/c/${token}/gallery`} className={styles.entryPrimary}>이어서 선택하기</Link>
                {recommendedCount > 0 && <Link href={`/c/${token}/gallery?selected=recommended`} className={styles.entrySecondary}>작가 추천 확인하기</Link>}
              </>
            ) : recommendedCount > 0 ? (
              <>
                <Link href={`/c/${token}/gallery?selected=recommended`} className={styles.entryPrimary}>
                  작가 추천 확인하기
                </Link>
                <Link href={`/c/${token}/gallery`} className={styles.entrySecondary}>
                  전체 사진에서 고르기
                </Link>
              </>
            ) : (
              <Link href={`/c/${token}/gallery`} className={styles.entryPrimary}>
                사진 선택하기
              </Link>
            )}
            <OriginalDownloadEntry token={token} variant="entry" />
          </>
        )}
      >
        <div className={styles.introTextGroup}>
          <p className={styles.projectLabel}>{project.name}</p>
          <h1 className={`${styles.entryTitle} ${styles.introTitle}`}>
            {project.customerName ? `${project.customerName}님,` : "고객님,"}<br />
            사진이 도착했어요
          </h1>
          <p className={styles.entryDescription}>
            {(ctx?.Y ?? 0) > 0
              ? <>지금까지 <strong className={styles.introAccent}>{ctx?.Y} / {project.requiredCount}장</strong>을 선택했어요. 이어서 확인해보세요.</>
              : recommendedCount > 0
              ? <>총 {project.requiredCount}장을 골라주세요. 작가가 추천한 <strong className={styles.introAccent}>{recommendedCount.toLocaleString()}장</strong>부터 확인할 수 있어요.</>
              : <>총 {project.photoCount.toLocaleString()}장 중 마음에 드는 <strong className={styles.introAccent}>{project.requiredCount.toLocaleString()}장</strong>을 골라주세요.</>}
          </p>
        </div>
        <div className={styles.deadlineRow} aria-label={`선택 마감일 ${format(deadlineDate, "yyyy년 M월 d일 EEEE", { locale: ko })}${dday ? `, ${dday.label}` : ""}`}>
          <CalendarDays className={styles.deadlineIcon} aria-hidden="true" strokeWidth={1.6} />
          <span className={styles.deadlineLabel}>선택 기한</span>
          <span className={styles.deadlineDate}>{format(deadlineDate, "yyyy.MM.dd (EEE)", { locale: ko })}</span>
          {dday && <Badge tone={dday.tone} theme="customerLight" className="font-mono">{dday.label}</Badge>}
        </div>
      </CustomerInviteIntro>
    );
  }

  /* ──────────────── reviewing_v1 / v2 ──────────────── */
  if (project.status === "reviewing_v1" || project.status === "reviewing_v2") {
    const isV2 = project.status === "reviewing_v2";
    const revisionRemaining = Math.max(0, (project.maxRevisionCount ?? 0) - (project.revisionRound ?? 0));
    const deadlineDate = new Date(project.reviewDeadline ?? project.deadline);
    const deadlineStr = format(deadlineDate, "yyyy.MM.dd (EEE)", { locale: ko });
    const dday = customerDDay(deadlineDate);
    const reviewPath = `/c/${token}/review`;
    return (
      <CustomerInviteIntro
        {...introCommonProps}
        actions={(
          <>
            <Link href={reviewPath} className={styles.entryPrimary}>
              보정본 검토하기
            </Link>
            <OriginalDownloadEntry token={token} variant="entry" />
          </>
        )}
      >
        <div className={styles.introTextGroup}>
          <p className={styles.projectLabel}>{project.name}</p>
          <p className={styles.reviewEyebrow}>{isV2 ? "재보정본 검토" : "1차 보정본 검토"}</p>
          <h1 className={`${styles.entryTitle} ${styles.introTitle}`}>
            {project.customerName ? `${project.customerName}님,` : "고객님,"}<br />
            <span className={styles.introAccent}>보정본</span>이 도착했어요
          </h1>
          <p className={styles.entryDescription}>
            사진을 확인하고 마음에 들면 확정해 주세요.<br />수정이 필요하면 재보정을 요청할 수 있어요.
          </p>
        </div>

        <dl className={styles.reviewSummary} aria-label="보정본 검토 정보">
          <div className={styles.reviewSummaryRow}>
            <dt>검토 기한</dt>
            <dd className={styles.reviewDeadline}>
              <span>{deadlineStr}</span>
              {dday && <Badge tone={dday.tone} theme="customerLight" className="font-mono">{dday.label}</Badge>}
            </dd>
          </div>
          <div className={styles.reviewSummaryRow}>
            <dt>재보정</dt>
            <dd>{revisionRemaining}회 요청 가능</dd>
          </div>
        </dl>
      </CustomerInviteIntro>
    );
  }

  /* ──────────────── editing / editing_v2 (보정·재보정 진행 중) ────────────────
   * 예전에는 이 상태에서 이 화면 진입 자체를 막고 /locked로 튕겼다 — 그러면 /locked에서
   * 로고를 눌러도 같은 화면으로 되돌아올 뿐이라 "처음으로" 이동이 항상 no-op이었다.
   * 검토 CTA는 아직 검토할 보정본이 없으므로 비활성화하고, 대신 진행 상태를 보여준다.
   * 원본 다운로드는 이 상태에서도 가능해야 하므로 그대로 유지한다.
   * 그런데 그 수정이 반대쪽 문제를 만들었다: 이 화면엔 /locked로 돌아갈 방법이 없어서,
   * 갤러리·상세뷰어가 editing 상태를 보고 /locked로 보낸 뒤(§gallery, §viewer)
   * 고객이 로고를 한 번 누르면 자신이 고른 사진·재보정 요청 코멘트를 다시 볼 방법이
   * 아예 없어졌다 — 확정 화면(`/confirmed`)이 이미 쓰는 것과 같은 링크를 그대로 둔다.
   * 비활성 버튼("보정 진행 중")은 없앴다 — 바로 위 eyebrow·제목이 같은 말을 이미 하고 있어
   * 누를 수 없는 버튼이 그 문구를 한 번 더 반복할 뿐이었다. 그 자리를 실제로 갈 수 있는
   * "선택한 사진 보기"가 대신 차지한다(primary 자리). */
  if (project.status === "editing" || project.status === "editing_v2") {
    const isV2 = project.status === "editing_v2";
    return (
      <CustomerInviteIntro {...introCommonProps} actions={(
        <>
          <Link href={`/c/${token}/locked`} className={styles.entryPrimary}>
            선택한 사진 보기
          </Link>
          <OriginalDownloadEntry token={token} variant="entry" />
        </>
      )}>
        <div className={styles.introTextGroup}>
          <p className={styles.projectLabel}>{project.name}</p>
          <p className={styles.reviewEyebrow}>{isV2 ? "재보정 진행 중" : "보정 진행 중"}</p>
          <h1 className={`${styles.entryTitle} ${styles.introTitle}`}>
            {project.customerName ? `${project.customerName}님,` : "고객님,"}<br />
            작가가 {isV2 ? "재보정" : "보정"}을 진행하고 있어요
          </h1>
          <p className={styles.entryDescription}>
            {isV2 ? "재보정" : "보정"}이 끝나면 이 링크에서 검토 요청을 받으실 수 있어요.
          </p>
        </div>
      </CustomerInviteIntro>
    );
  }

  // 준비 중에도 동일한 초대 레이아웃을 사용하며, 선택 화면으로의 진입은 제공하지 않는다.
  return (
    <CustomerInviteIntro {...introCommonProps} actions={(
      <p className={styles.entryDescription}>사진 준비가 끝나면 이 링크에서 확인하실 수 있어요.</p>
    )}>
      <div className={styles.introTextGroup}>
        <p className={styles.projectLabel}>{project.name}</p>
        <p className={styles.reviewEyebrow}>사진 준비 중</p>
        <h1 className={`${styles.entryTitle} ${styles.introTitle}`}>
          {project.customerName ? `${project.customerName}님,` : "고객님,"}<br />사진을 준비하고 있어요
        </h1>
        <p className={styles.entryDescription}>작가가 촬영한 사진을 정리하고 있어요.<br />조금만 기다려 주세요.</p>
      </div>
    </CustomerInviteIntro>
  );
}
