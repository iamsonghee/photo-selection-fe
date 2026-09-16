"use client";

import { RecommendationMark } from "@/components/RecommendationMark";

import { memo, useState } from "react";
import { SimilarityGroupBadge } from "@/components/ui/SimilarityGroupBadge";
import Link from "next/link";
import { Star, AlertTriangle, EyeOff, MessageSquare } from "lucide-react";
import { PhotoThumbnailFrame } from "@/components/ui/PhotoThumbnailFrame";
import { COLOR_OPTIONS, getPhotoDisplayName } from "@/lib/gallery-filter";
import { useQueuedThumbSrc, type ThumbLoadQueue } from "@/lib/thumb-load-queue";
import type { Photo, StarRating, ColorTag } from "@/types";

const EMPTY_COLOR_TAGS: ColorTag[] = [];

type GalleryPhotoCardProps = {
  token: string;
  photo: Photo;
  selected: boolean;
  checkDisabled?: boolean;
  recommended?: boolean;
  rating?: StarRating;
  colorTags?: ColorTag[];
  hasComment?: boolean;
  showGroupBadge: boolean;
  groupId?: string;
  groupLabel?: string;
  /** 표지 외에 접혀서 숨겨진 사진 수 — 항상 totalCount - 1, 셀렉 개수와 무관하게 고정 */
  restCount: number;
  /** 그룹 전체 사진 수 */
  totalCount: number;
  /** 그룹 내 셀렉 수 — 0이면 배지에 표시하지 않고 기존 +N만 노출 */
  selectedCount: number;
  isGroupExpanded: boolean;
  /** 펼쳐진 그룹(표지+멤버 전체)에 속함 — 그룹 경계를 테두리로 시각 구분 */
  inExpandedGroup?: boolean;
  presignedThumb?: string;
  thumbQueue: ThumbLoadQueue;
  viewerQueryString: string;
  density: number;
  /** 파일명 검색·파일명 정렬이 켜진 동안만 true — 그때는 파일명이 작업의 대상이라 격자에도 보여야 한다 */
  showFilename?: boolean;
  onPhotoClick: (e: React.MouseEvent, photoId: string) => void;
  onCheckClick: (e: React.MouseEvent, photoId: string) => void;
  onGroupBadgeClick: (e: React.MouseEvent, groupId: string) => void;
  onRate: (photoId: string, star: StarRating | undefined) => void;
  onThumbError: (photoId: string) => void;
};

function GalleryPhotoCardImpl({
  token,
  photo,
  selected,
  checkDisabled = false,
  recommended = false,
  rating,
  colorTags = EMPTY_COLOR_TAGS,
  hasComment = false,
  showGroupBadge,
  groupId,
  groupLabel,
  totalCount,
  selectedCount,
  isGroupExpanded,
  inExpandedGroup,
  presignedThumb,
  thumbQueue,
  viewerQueryString,
  showFilename = false,
  onPhotoClick,
  onCheckClick,
  onGroupBadgeClick,
  onRate,
  onThumbError,
}: GalleryPhotoCardProps) {
  const [hoverStar, setHoverStar] = useState(0);
  /* 격자에는 파일명을 그리지 않는다 — 고르는 동안에는 읽지 않는 글자인데 밀도마다 다른 자리
   * (사진 밖 / 사진 위 / 숨김)를 차지해 화면끼리 어긋났다. 파일명은 상세보기 한 곳에서만 말한다.
   *
   * 예외는 **파일명 검색·파일명 정렬이 켜진 동안**이다. 그때는 파일명이 곧 작업의 대상이라,
   * 안 보이면 무엇이 왜 걸렸는지·어떤 순서로 놓였는지 확인할 수 없다.
   * 자리는 **사진 위**다(사진 밖이 아니라) — 사진 밖에 두면 카드 높이가 검색 상태에 따라 바뀌어
   * 가상 스크롤 행 높이(`MOBILE_LAYOUT[n].info`)까지 같이 흔들린다. 사진 위면 높이가 고정이다.
   * 4열은 8px 글자가 뭉개져 읽히지 않으므로 그때는 켜도 감춘다(CSS). */
  const displayName = getPhotoDisplayName(photo);
  const isBlurry = photo.isBlurry === true;
  const isEyesClosed = photo.faceDetected === true && photo.eyesClosed === true;
  const { cellRef, imgRef, shouldLoad, handleLoad, handleError } = useQueuedThumbSrc(presignedThumb, {
    queue: thumbQueue,
    rootMargin: "150px",
  });


  /* 별점·코멘트·색 줄 — 사진 위 오버레이와 2열 정보 패널 양쪽에서 같은 것을 쓴다 */
  const controls = (
    <div className="gl-overlay-interactive" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 14 }}>
      <span className="gl-rating-summary" aria-label={rating ? `별점 ${rating}점` : "별점 없음"}>
        {rating ? <><Star size={12} fill="#FF4D00" color="#FF4D00" aria-hidden />{rating}</> : null}
      </span>
      <div
        className="gl-rating-row"
        style={{ display: "flex", gap: 1 }}
        onClick={(e) => e.stopPropagation()}
        onMouseLeave={() => setHoverStar(0)}
      >
        {([1, 2, 3, 4, 5] as const).map((s) => {
          const currentRating = Number(rating) || 0;
          const displayRating = hoverStar || currentRating;
          const isHovering    = hoverStar > 0;
          // 기기와 별점 유무에 관계없이 다섯 별을 유지해 평가 상태를 한눈에 비교한다.
          const filled = s <= displayRating;
          return (
            <button
              key={s}
              type="button"
              aria-label={`별점 ${s}점`}
              aria-pressed={currentRating === s}
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                onRate(photo.id, currentRating === s ? undefined : s);
                setHoverStar(0);
              }}
              onMouseEnter={() => setHoverStar(s)}
              onPointerDown={() => setHoverStar(s)}
              style={{
                fontSize: 9,
                lineHeight: 1,
                padding: 0,
                border: "none",
                background: "none",
                cursor: "pointer",
                /* 별은 사진 위 그라데이션에 얹힌다 — 빈 별을 어두운 회색으로 두면 사진에 묻혀
                 * "별점을 줄 수 있다"는 것 자체가 보이지 않는다(2열에서는 빈 별도 늘 그린다). */
                color: filled ? (isHovering ? "rgba(255,77,0,.7)" : "#FF4D00") : "rgba(255,255,255,.72)",
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,.45))",
              }}
            >
              <Star size={14} fill={filled ? "currentColor" : "none"} strokeWidth={2} aria-hidden="true" style={{ display: "block", flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
      <div className="gl-marker-row" style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {hasComment && (
          <span className="gl-comment-indicator" role="img" aria-label="코멘트 있음" title="코멘트 있음">
            <MessageSquare size={13} strokeWidth={2} aria-hidden />
          </span>
        )}
        {colorTags.map((tag) => {
          const hex = COLOR_OPTIONS.find((c) => c.key === tag)?.hex;
          return hex ? <span key={tag} className="gl-color-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: hex, display: "block", flexShrink: 0 }} /> : null;
        })}
      </div>
    </div>

  );

  const card = (
    <Link
      ref={cellRef}
      href={`/c/${token}/viewer/${photo.id}${viewerQueryString}`}
      onClick={(e) => onPhotoClick(e, photo.id)}
      data-photo-id={photo.id}
      className={`gl-photo-card${selected ? " gl-selected" : ""}${inExpandedGroup ? " gl-in-expanded-group" : ""}`}
    >
      <PhotoThumbnailFrame
        className={`gl-card-media${inExpandedGroup ? " gl-group-media" : showGroupBadge ? " gl-group-stack" : ""}`}
        active={selected}
        ringLayer={19}
      >
        {shouldLoad && presignedThumb ? (
          <img
            key={presignedThumb}
            ref={imgRef}
            src={presignedThumb}
            alt={getPhotoDisplayName(photo)}
            // 큐가 IntersectionObserver로 화면 근처 사진만 허용한 뒤 마운트하므로
            // 브라우저 lazy-load를 다시 적용하면 가시 이미지가 이중으로 지연된다.
            loading="eager"
            decoding="async"
            draggable={false}
            onLoad={handleLoad}
            onError={() => {
              handleError();
              onThumbError(photo.id);
            }}
          />
        ) : (
          // presigned URL 대기 중이거나, 큐에서 아직 슬롯을 못 받은 placeholder
          <div className="gl-card-placeholder" aria-hidden />
        )}

        <button
        type="button"
        onClick={(e) => onCheckClick(e, photo.id)}
        disabled={checkDisabled}
        aria-label={selected ? "선택 해제" : "선택"}
        className="gl-check-box"
      >
        {selected && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={4}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        </button>
        {recommended && (
          <span className="gl-recommended-badge" title="작가 추천">
            <RecommendationMark size={12} /> 작가 추천
          </span>
        )}

      {/* 흐림과 눈감음은 둘 다 해당하면 나란히 표시 — 원인이 다르므로 하나로 합치지 않는다.
        * (흐림 배지 안에서 흔들림·초점을 합친 것과는 별개 판단 — 그 둘은 작가·고객 모두에게
        *  "이 컷은 못 쓴다"로 결론이 같지만, 눈감음은 다른 결론이다.)
        * 문구가 "흔들림"이 아니라 "흐림"인 이유: 판정이 `blur_or_shake`와 `focus_issue`를
        * 합친 값이라, 둘 중 하나만 가리키는 말을 쓰면 사실과 어긋난다(§photo-quality). */}
        {isBlurry && (
        <div className="gl-quality-badge gl-quality-badge-blur" title="흐림 의심" aria-label="흐림 의심">
          <AlertTriangle size={11} />
        </div>
        )}
        {isEyesClosed && (
        <div
          className="gl-quality-badge gl-quality-badge-eyes"
          style={{ right: isBlurry ? 36 : 10 }}
          title="눈 감음 의심"
          aria-label="눈 감음 의심"
        >
          <EyeOff size={11} />
        </div>
        )}

        {(showGroupBadge || inExpandedGroup) && groupId && (
          <SimilarityGroupBadge count={totalCount} expanded={isGroupExpanded} label={groupLabel}
            selectedCount={showGroupBadge ? selectedCount : 0}
            onClick={(event) => onGroupBadgeClick(event, groupId)} />
        )}
      </PhotoThumbnailFrame>

      <div className="gl-card-overlay">
        <div className="gl-card-overlay-content">
          {showFilename && <p className="gl-overlay-filename">{displayName}</p>}
          {controls}
        </div>
      </div>
    </Link>
  );

  return card;
}

export const GalleryPhotoCard = memo(GalleryPhotoCardImpl);
