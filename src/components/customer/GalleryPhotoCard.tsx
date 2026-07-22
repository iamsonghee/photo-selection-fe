"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, EyeOff } from "lucide-react";
import { COLOR_OPTIONS, getPhotoDisplayName } from "@/lib/gallery-filter";
import { useQueuedThumbSrc, type ThumbLoadQueue } from "@/lib/thumb-load-queue";
import type { Photo, StarRating, ColorTag } from "@/types";

const EMPTY_COLOR_TAGS: ColorTag[] = [];

type GalleryPhotoCardProps = {
  token: string;
  photo: Photo;
  selected: boolean;
  rating?: StarRating;
  colorTags?: ColorTag[];
  showGroupBadge: boolean;
  groupId?: string;
  restCount: number;
  isGroupExpanded: boolean;
  /** 펼쳐진 그룹(대표컷+멤버 전체)에 속함 — 그룹 경계를 테두리로 시각 구분 */
  inExpandedGroup?: boolean;
  presignedThumb?: string;
  thumbQueue: ThumbLoadQueue;
  viewerQueryString: string;
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
  rating,
  colorTags = EMPTY_COLOR_TAGS,
  showGroupBadge,
  groupId,
  restCount,
  isGroupExpanded,
  inExpandedGroup,
  presignedThumb,
  thumbQueue,
  viewerQueryString,
  onPhotoClick,
  onCheckClick,
  onGroupBadgeClick,
  onRate,
  onThumbError,
}: GalleryPhotoCardProps) {
  const [hoverStar, setHoverStar] = useState(0);
  const isBlurry = photo.isBlurry === true;
  const isEyesClosed = photo.faceDetected === true && photo.eyesClosed === true;
  const { cellRef, imgRef, shouldLoad, handleLoad, handleError } = useQueuedThumbSrc(presignedThumb, {
    queue: thumbQueue,
    rootMargin: "150px",
  });

  return (
    <Link
      ref={cellRef}
      href={`/c/${token}/viewer/${photo.id}${viewerQueryString}`}
      onClick={(e) => onPhotoClick(e, photo.id)}
      className={`gl-photo-card${selected ? " gl-selected" : ""}${inExpandedGroup ? " gl-in-expanded-group" : ""}`}
    >
      {shouldLoad && presignedThumb ? (
        <img
          key={presignedThumb}
          ref={imgRef}
          src={presignedThumb}
          alt={getPhotoDisplayName(photo)}
          loading="lazy"
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
        <div style={{ width: "100%", height: "100%", background: "var(--surface)" }} aria-hidden />
      )}

      <button
        type="button"
        onClick={(e) => onCheckClick(e, photo.id)}
        aria-label={selected ? "선택 해제" : "선택"}
        className="gl-check-box"
      >
        {selected && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth={4}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* 둘 다 해당하면 나란히 표시 — 원인이 다르므로 하나로 합치지 않는다 */}
      {isBlurry && (
        <div className="gl-quality-badge gl-quality-badge-blur" title="흔들림 의심" aria-label="흔들림 의심">
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

      {showGroupBadge && groupId && (
        <button
          type="button"
          onClick={(e) => onGroupBadgeClick(e, groupId)}
          aria-label={`유사컷 ${restCount}장 ${isGroupExpanded ? "접기" : "펼치기"}`}
          className="gl-group-badge"
        >
          {isGroupExpanded ? `${restCount + 1}장 −` : `+${restCount}`}
        </button>
      )}

      <div className="gl-card-overlay">
        <div className="gl-card-overlay-content">
          <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 9, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
            {getPhotoDisplayName(photo)}
          </p>
          <div className="gl-overlay-interactive" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 14 }}>
            <div
              style={{ display: "flex", gap: 1 }}
              onClick={(e) => e.stopPropagation()}
              onMouseLeave={() => setHoverStar(0)}
            >
              {([1, 2, 3, 4, 5] as const).map((s) => {
                const currentRating = Number(rating) || 0;
                const displayRating = hoverStar || currentRating;
                const isHovering    = hoverStar > 0;
                // hover 없고 rating 없으면 숨김, hover 없고 rating 있으면 채워진 별만 표시
                if (!isHovering && s > currentRating) return null;
                const filled = s <= displayRating;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      onRate(photo.id, currentRating === s ? undefined : s);
                      setHoverStar(0);
                    }}
                    onMouseEnter={() => setHoverStar(s)}
                    style={{ fontSize: 9, lineHeight: 1, padding: 0, border: "none", background: "none", cursor: "pointer", color: filled ? "var(--accent)" : "rgba(60,60,70,0.95)" }}
                  >
                    {filled ? "★" : "☆"}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
              {colorTags.map((tag) => {
                const hex = COLOR_OPTIONS.find((c) => c.key === tag)?.hex;
                return hex ? <span key={tag} style={{ width: 6, height: 6, borderRadius: "50%", background: hex, display: "block", flexShrink: 0 }} /> : null;
              })}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export const GalleryPhotoCard = memo(GalleryPhotoCardImpl);
