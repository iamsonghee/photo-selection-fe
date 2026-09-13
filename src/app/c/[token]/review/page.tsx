"use client";

import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { MessageSquare } from "lucide-react";
import { customerDDay } from "@/lib/customer-dday";
import { normalizeReviewDeadlineYmd } from "@/lib/format-review-deadline";
import { isReceiptMode } from "@/lib/review-mode";
import { useCustomerLightCanvas } from "@/lib/use-customer-light-canvas";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import { BrandLogoBar } from "@/components/BrandLogo";
import { PrevNextButton } from "@/components/PrevNextButton";
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";
import { useAdjacentImagePreload } from "@/lib/use-adjacent-image-preload";
import { hasShortcutModifier } from "@/lib/keyboard-shortcut-guard";
import type { Project } from "@/types";

/** 검토 목록 격자를 좁히는 상태 필터 — `all`은 필터 해제 */
type ReviewStatusFilter = "all" | "approved" | "revision_requested" | "pending";

const MONO   = "'JetBrains Mono', 'Space Mono', monospace";
const ACCENT = "var(--accent)";
const BORDER = "var(--border)";

export default function ReviewRedirectPage() {
  const params  = useParams();
  const router  = useRouter();
  const token   = (params?.token as string) ?? "";

  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, resetAll } = useReview();

  useEffect(() => {
    if (!project?.id || !project?.status) return;
    loadReviewPhotos(token, project.id, project.status);
  }, [token, project?.id, project?.status, loadReviewPhotos]);

  const isReceiptOnly =
    !!project &&
    project.status === "reviewing_v1" &&
    (project.maxRevisionCount ?? 0) === 0;

  /* 검토할 수 없는 상태로 들어오면 고객 홈으로 돌린다.
   * 예전에는 여기서 데스크탑만 첫 사진으로 자동 이동시켰는데, 상세의 닫기/Esc가 이 경로로
   * 돌아오는 탓에 PC에서는 뷰어를 닫을 수 없고 항상 0번 사진으로 튕겼다. 목록을 두 플랫폼
   * 모두에 두고(ReviewGalleryView) 진입은 썸네일 탭이 대신한다. */
  useEffect(() => {
    if (selectionLoading || reviewPhotosLoading) return;
    if (!project) return;
    if (isReceiptOnly) return; // 재보정 0회: 수령 확인 화면 유지
    const canReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
    if (!canReview) router.replace(`/c/${token}`);
  }, [selectionLoading, reviewPhotosLoading, project, token, router, isReceiptOnly]);

  if (selectionLoading || reviewPhotosLoading || !project) {
    return <SystemLoadingScreen />;
  }

  if (isReceiptOnly) {
    return (
      <DeliveryReceiptView
        token={token}
        project={project}
        photos={reviewPhotos}
        onDone={() => {
          // SelectionContext는 token 변경 시에만 /api/c/photos를 다시 불러옵니다.
          // 수령 완료 직후 status가 delivered로 바뀌어도 client state가 stale이면
          // /delivered ↔ /c/[token] 리다이렉트 루프가 생길 수 있어 하드 리로드로 전환합니다.
          resetAll();
          window.location.replace(`/c/${token}/delivered`);
        }}
      />
    );
  }

  return (
    <ReviewGalleryView
      token={token}
      project={project}
      photos={reviewPhotos}
      onSubmitted={() => resetAll()}
    />
  );
}

/** 셀렉 갤러리의 `getPhotoDisplayName`과 같은 규칙 — 원본 파일명 → URL에서 추출 → 순번.
 * `ReviewPhotoItem`은 `Photo`가 아니라 타입을 공유할 수 없어 같은 순서를 여기서 다시 쓴다. */
function reviewPhotoDisplayName(photo: ReviewPhotoItem, index: number): string {
  const name = photo.originalFilename?.trim();
  if (name) return name.split("/").pop() ?? name;
  const fromUrl = (photo.versionUrl ?? photo.originalUrl ?? "").split("?")[0].split("/").pop();
  if (fromUrl) return decodeURIComponent(fromUrl);
  return `#${index + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────
// ReviewGalleryView — 재보정 가능 프로젝트의 검토 목록 (모바일·PC 공통)
// 썸네일 탭 → /review/[photoId] 상세로 이동, 풋터에서 일괄 제출
// ─────────────────────────────────────────────────────────────────────────

function ReviewGalleryView({
  token,
  project,
  photos,
  onSubmitted,
}: {
  token: string;
  project: Project;
  photos: ReviewPhotoItem[];
  onSubmitted: () => void;
}) {
  const router = useRouter();
  const { reviewState, getReview } = useReview();
  useCustomerLightCanvas();

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [columns, setColumns] = useState<2 | 3>(2);

  const total = photos.length;
  const approvedCount = useMemo(
    () => photos.filter((p) => getReview(p.id)?.status === "approved").length,
    [photos, reviewState, getReview]
  );
  const revisionCount = useMemo(
    () => photos.filter((p) => getReview(p.id)?.status === "revision_requested").length,
    [photos, reviewState, getReview]
  );
  const pendingCount = total - approvedCount - revisionCount;
  const reviewedCount = approvedCount + revisionCount;

  /* 남은 재보정이 없으면 이 화면의 일은 판단이 아니라 **확인**이다 — 사진마다 확정을 누르게 하는 것은
   * 답이 하나뿐인 질문을 N번 되풀이시키는 것이다. 판단 단계를 걷어내고 CTA 하나로 끝낸다.
   * (같은 상황인 `재보정 0회 상품`은 아직 `DeliveryReceiptView`가 따로 맡고 있다 — 두 화면을
   *  하나로 합치는 것은 별도 작업이다.) */
  const receiptMode = isReceiptMode(project);
  /* 수령 모드에서는 판단이라는 단계 자체가 없으므로 "다 봤는지"를 물을 근거도 없다 —
   * 전달 버튼은 처음부터 열려 있다. */
  const allReviewed = receiptMode || (total > 0 && pendingCount === 0);

  /* 확정·재보정·미검토는 **필터**다 — 숫자만 보여주면 "재보정 1장이 어느 것인지" 알려면
   * 격자를 눈으로 훑어야 한다. 30장이 넘으면 그게 불가능해진다.
   * 필터는 보이는 것만 줄이고 아래 풋터의 제출 조건(전체 검토 여부)에는 관여하지 않는다. */
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>("all");
  /* 마지막 한 장을 판단하면 그 필터가 비어 버린다(예: `미검토`만 보다가 마지막 장을 확정).
   * 빈 격자를 보여주는 대신 **그 자리에서 전체로 되돌린다** — effect로 되돌리면 빈 화면이
   * 한 프레임 먼저 그려지고, effect 안의 setState는 연쇄 렌더를 부른다(lint도 이걸 막는다). */
  const { visiblePhotos, activeFilter } = useMemo(() => {
    if (statusFilter === "all") return { visiblePhotos: photos, activeFilter: "all" as ReviewStatusFilter };
    const matched = photos.filter((p) => (getReview(p.id)?.status ?? "pending") === statusFilter);
    return matched.length > 0
      ? { visiblePhotos: matched, activeFilter: statusFilter }
      : { visiblePhotos: photos, activeFilter: "all" as ReviewStatusFilter };
  }, [photos, statusFilter, reviewState, getReview]);

  /* 필터를 걸어도 사진 이름은 그대로여야 한다 — 걸러진 목록의 순번(i)으로 이름을 만들면
   * `#3`이 필터에 따라 다른 사진을 가리킨다(파일명이 없는 사진의 대체 이름). */
  const originalIndexById = useMemo(() => {
    const map = new Map<string, number>();
    photos.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [photos]);

  const filterTabs: Array<{ key: ReviewStatusFilter; label: string; count: number; tone?: string }> = [
    { key: "all", label: "전체", count: total },
    { key: "pending", label: "미검토", count: pendingCount },
    { key: "approved", label: "확정", count: approvedCount, tone: "#12833f" },
    { key: "revision_requested", label: "재보정 요청", count: revisionCount, tone: "#b26a00" },
  ];


  const goToPhoto = useCallback(
    (id: string) => router.push(`/c/${token}/review/${id}`),
    [router, token]
  );

  /* 마감일 표기는 고객 화면 공통 규칙(customerDDay + Badge)을 쓴다 — 셀렉 마감·다운로드 기한과 같은 표기다 */
  const { deadlineLabel, dday } = useMemo(() => {
    const ymd = normalizeReviewDeadlineYmd(project.reviewDeadline ?? null);
    const date = ymd ? new Date(ymd) : null;
    if (!date || Number.isNaN(date.getTime())) return { deadlineLabel: "", dday: null };
    return { deadlineLabel: format(date, "yy.MM.dd", { locale: ko }), dday: customerDDay(date) };
  }, [project.reviewDeadline]);

  const handleSubmit = useCallback(async () => {
    if (!allReviewed || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const hasRealIds = photos.some((p) => (p as ReviewPhotoItem).photoVersionId?.length > 0);
      let finalStatus: string | null = null;
      if (hasRealIds) {
        const reviews: Array<{
          photo_version_id: string;
          photo_id: string;
          status: "approved" | "revision_requested";
          customer_comment: string | null;
        }> = [];
        for (const p of photos) {
          if (!p.photoVersionId) continue;
          /* 수령 모드에는 사진별 판단 기록이 없다(애초에 묻지 않았다) — 전부 확정으로 보낸다.
           * `DeliveryReceiptView`의 수령 완료와 같은 페이로드다. */
          if (receiptMode) {
            reviews.push({
              photo_version_id: p.photoVersionId,
              photo_id: p.id,
              status: "approved",
              customer_comment: null,
            });
            continue;
          }
          const rev = getReview(p.id);
          if (!rev || (rev.status !== "approved" && rev.status !== "revision_requested")) {
            setSubmitError(
              "일부 사진의 검토 선택이 없습니다. 각 장에서 확정 또는 재보정을 선택한 뒤 다시 시도해 주세요."
            );
            setSubmitting(false);
            return;
          }
          reviews.push({
            photo_version_id: p.photoVersionId,
            photo_id: p.id,
            status: rev.status,
            customer_comment: rev.comment ?? null,
          });
        }
        const res = await fetch("/api/c/review/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, reviews }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSubmitError((data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`);
          setSubmitting(false);
          return;
        }
        finalStatus = typeof data?.status === "string" ? data.status : null;
      } else {
        const result = revisionCount > 0 ? "has_revision" : "all_approved";
        const res = await fetch("/api/c/review-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, result }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSubmitError((data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`);
          setSubmitting(false);
          return;
        }
        finalStatus = typeof data?.status === "string" ? data.status : null;
      }
      onSubmitted();
      if (finalStatus === "delivered") {
        window.location.replace(`/c/${token}/delivered`);
        return;
      }
      if (finalStatus === "editing_v2" || finalStatus === "editing") {
        window.location.replace(`/c/${token}/locked`);
        return;
      }
      window.location.replace(`/c/${token}/confirmed`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "제출에 실패했습니다.");
      setSubmitting(false);
    }
  }, [allReviewed, submitting, photos, token, getReview, revisionCount, onSubmitted, receiptMode]);

  return (
    /* 격자/목록 화면은 라이트, 몰입형 단일 사진은 다크 — 갤러리(선택)와 같은 규칙을 따른다.
     * 검토 상세(review/[photoId])만 뷰어처럼 다크 워크스페이스를 쓴다. */
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--customer-canvas)",
        color: "var(--customer-ink)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Pretendard, 'Noto Sans KR', sans-serif",
      }}
    >
      {/* 셀렉 갤러리와 같은 머리 구조: `A` 홈 마크 + 이름 + 마감일, 오른쪽에 진행 카운트.
        * 모바일은 갤러리 앱바처럼 화면 이름(`보정본 검토`)을, PC는 갤러리 데스크톱 헤더처럼
        * 프로젝트명을 제목으로 쓴다 — 마크업은 한 벌로 두고 CSS로 갈라 둘이 어긋나지 않게 한다. */}
      <header className="rgv-header">
        <div className="rgv-head-left">
          {/* 초대 화면은 서버에서 PIN과 프로젝트 상태를 다시 판정하는 진입점이다.
            * 클라이언트 라우팅 캐시에 머물지 않도록 일반 링크로 이동해 초대 기본 화면을 확실히 다시 연다. */}
          <a href={token ? `/c/${token}` : "#"} aria-label="처음 화면으로" className="rgv-brand-mark">
            A
          </a>
          <div className="rgv-head-text">
            <h1 className="rgv-title">
              <span className="rgv-title-m">보정본 검토</span>
              <span className="rgv-title-pc">{project.name}</span>
            </h1>
            {deadlineLabel && (
              <p className="rgv-deadline">
                {deadlineLabel}
                {dday && <Badge tone={dday.tone} theme="customerLight" className="font-mono">{dday.label}</Badge>}
              </p>
            )}
          </div>
        </div>
        {/* 수령 모드에는 진행이라는 개념이 없다 — `검토 0 / 5`를 띄우면 아직 할 일이 남은 것처럼 읽힌다 */}
        <div className="rgv-head-right">
          <span className="rgv-head-label">{receiptMode ? "보정본" : "검토"}</span>
          <span className="rgv-head-count">
            {receiptMode ? total : reviewedCount} <span>{receiptMode ? "장" : `/ ${total}`}</span>
          </span>
          {!receiptMode && <span className="rgv-remaining">{pendingCount}장 남음</span>}
        </div>
      </header>

      <section className="rgv-scroll">
        <div className="rgv-inner">
          {/* 진입 버튼은 두지 않는다 — 썸네일을 누르는 것이 이 화면의 진입 방식이고(갤러리와 같다),
            * 버튼이 따로 있으면 "어디를 눌러야 하나"를 한 번 더 고르게 만든다. */}
          {/* 탭 문법은 셀렉 갤러리 데스크톱 헤더의 `전체 사진 / 선택됨`(`.gld-tab`)과 같다 —
            * 같은 고객이 오가는 두 목록이라 "격자를 좁히는 장치"가 서로 다른 모양이면 안 된다.
            * 다만 밑줄·글자색은 주황 하나가 아니라 **각 상태의 색**을 쓴다: 카드 배지(확정 #12833f /
            * 재보정 #b26a00)와 같은 색이라야 탭과 결과가 같은 것으로 읽힌다. */}
          {/* `tablist`가 아니라 **누름 토글**이다 — 탭은 패널을 바꾸지만 이건 같은 격자를 좁힌다.
            * 그래서 `aria-pressed`를 쓴다(`role="tab"`은 짝이 되는 `tabpanel`을 요구한다). */}
          {/* 수령 모드에는 확정/재보정/미검토라는 상태가 아예 없으므로 필터도 없다.
            * 대신 **왜 재보정 버튼이 없는지**를 적는다 — 없는 이유를 말하지 않으면 고객은
            * 기능이 사라졌다고 읽는다(예전에는 회색 버튼 + title 툴팁뿐이라 모바일에서는
            * 이유를 볼 방법 자체가 없었다). */}
          {receiptMode ? (
            <p className="rgv-receipt-note">
              이번이 <b>마지막 보정본</b>이라 재보정 요청은 할 수 없어요.
              사진을 확인하신 뒤 아래 <b>수령 완료</b>를 눌러 주세요.
            </p>
          ) : (
          <div className="rgv-lead" role="group" aria-label="검토 상태로 거르기">
            {filterTabs.map((tab) => {
              const active = activeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${tab.label} ${tab.count}장만 보기`}
                  /* 0장짜리 필터는 누르면 빈 화면만 나온다 — 숫자는 그대로 보여주되 누르지 못하게 한다 */
                  disabled={tab.count === 0 && tab.key !== "all"}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`rgv-tab${active ? " rgv-tab-active" : ""}`}
                  style={active && tab.tone ? { color: tab.tone, ["--rgv-tab-tone" as string]: tab.tone } : undefined}
                >
                  {tab.label} <b>{tab.count}</b>
                </button>
              );
            })}
          </div>
          )}

          <div className="rgv-grid-tools">
            <p>{receiptMode ? "사진을 눌러 크게 확인하세요." : "사진을 눌러 확인해 주세요. 검토 결과는 마지막에 작가에게 전달합니다."}</p>
            <button className="rgv-density" type="button" onClick={() => setColumns(value => value === 2 ? 3 : 2)} aria-label={`현재 ${columns}열, ${columns === 2 ? 3 : 2}열로 변경`}>{columns}열 보기</button>
          </div>
          <div className="rgv-grid" style={{ "--review-columns": columns } as React.CSSProperties}>
          {visiblePhotos.map((p) => {
            const i = originalIndexById.get(p.id) ?? 0;
            const pReview = getReview(p.id);
            const pStatus = pReview?.status ?? "pending";
            const pApproved = pStatus === "approved";
            const pRevision = pStatus === "revision_requested";
            const pillLabel = receiptMode ? null : pApproved ? "확정" : pRevision ? "재보정 요청" : "미검토";
            const thumbSrc = p.versionThumbUrl ?? p.versionUrl ?? p.originalUrl;
            const displayName = reviewPhotoDisplayName(p, i);
            return (
              <button
                key={p.id}
                type="button"
                className="rgv-card"
                onClick={() => goToPhoto(p.id)}
                aria-label={`${displayName} 검토${pillLabel ? `, ${pillLabel}` : ""}`}
              >
                {thumbSrc ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={thumbSrc} alt="" loading="lazy" decoding="async" draggable={false} />
                ) : (
                  <div className="rgv-card-placeholder" aria-hidden />
                )}
                {/* 파일명은 격자에 그리지 않는다 — 셀렉 갤러리와 같은 규칙으로 상세보기 한 곳에서만 말한다.
                  * 훑어보는 목록에서 읽는 것은 사진과 판단 상태이지 `IMG_8060.jpeg`가 아니다.
                  * 이름은 `aria-label`에 남아 있어 스크린리더에는 그대로 읽힌다. */}
                {pillLabel && (
                  <Badge className="rgv-card-pill" theme="customerLight" tone={pApproved ? "status-success" : pRevision ? "attention-warning" : "time"}>{pillLabel}</Badge>
                )}
                {pRevision && <span className="rgv-comment" aria-label="재보정 요청 있음"><MessageSquare size={15} aria-hidden /></span>}
              </button>
            );
          })}
          </div>
        </div>
      </section>

      <style>{`
        /* ── 머리 — 셀렉 갤러리(모바일 앱바 / PC 데스크톱 헤더)와 같은 뼈대 ── */
        .rgv-header {
          position: sticky; top: 0; z-index: 50; flex-shrink: 0;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          height: 51px; padding: 0 20px;
          padding-top: env(safe-area-inset-top, 0px);
          box-sizing: content-box;
          background: #fff; border-bottom: 1px solid #eef0f2;
        }
        .rgv-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .rgv-brand-mark {
          width: 26px; height: 26px; flex: 0 0 26px;
          display: grid; place-items: center; border-radius: 7px;
          background: #ff4d00; color: #fff; text-decoration: none;
          font: 800 14px/1 Pretendard, sans-serif;
          box-shadow: 0 1px 2px rgba(25,25,24,.12);
          -webkit-tap-highlight-color: transparent;
        }
        .rgv-head-text { min-width: 0; }
        .rgv-title {
          margin: 0; min-width: 0;
          font: 700 15px/1.3 Pretendard, sans-serif; letter-spacing: -.2px;
          color: var(--customer-ink);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .rgv-title-pc { display: none; }
        .rgv-deadline {
          margin: 2px 0 0; display: flex; align-items: center; gap: 8px;
          font: 12px/1 Pretendard, sans-serif; color: var(--customer-ink-secondary);
        }
        .rgv-head-right { flex: 0 0 auto; display: flex; align-items: baseline; gap: 6px; }
        .rgv-head-label { font: 600 11px/1 Pretendard, sans-serif; color: var(--customer-ink-secondary); }
        .rgv-head-count { font: 700 15px/1 Pretendard, sans-serif; color: var(--accent); font-variant-numeric: tabular-nums; }
        .rgv-head-count span { font-weight: 600; font-size: 12px; color: var(--customer-ink-secondary); }

        /* 안쪽 스크롤러의 러버밴드가 문서로 번지지 않게 한다(번지면 body의 검은 바탕이 보인다) */
        .rgv-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
        .rgv-inner {
          /* 갤러리 격자와 같은 좌우 여백(20px) */
          padding: 12px 20px;
          padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px));
        }
        /* 상태 필터 탭 — 문법(무테 버튼 + 활성 밑줄)은 셀렉 갤러리 .gld-tab과 같다.
         * 좁은 화면에서는 네 개가 한 줄을 넘길 수 있어 가로 스크롤로 흘린다(줄바꿈은 격자를 밀어낸다). */
        .rgv-lead {
          display: flex; align-items: center; gap: 2px;
          padding: 2px 0 10px;
          overflow-x: auto; scrollbar-width: none;
          border-bottom: 1px solid var(--customer-divider);
          margin-bottom: 12px;
        }
        .rgv-lead::-webkit-scrollbar { display: none; }
        .rgv-tab {
          position: relative; flex: 0 0 auto;
          padding: 8px 12px; border: 0; background: none; cursor: pointer;
          font: 600 13px/1.2 inherit; letter-spacing: -.2px; white-space: nowrap;
          color: var(--customer-ink-secondary);
        }
        .rgv-tab b { font-weight: 700; font-variant-numeric: tabular-nums; }
        /* 활성 탭 색은 인라인 스타일(상태색)이 정하고, 그게 없는 전체·미검토는 주황으로 돌아간다 */
        .rgv-tab-active { color: var(--accent); --rgv-tab-tone: var(--accent); }
        .rgv-tab-active::after {
          content: ""; position: absolute; bottom: -1px; left: 12px; right: 12px;
          height: 2px; background: var(--rgv-tab-tone);
        }
        .rgv-tab:disabled { color: var(--customer-divider); cursor: default; }
        /* 수령 모드 안내 — 필터 탭이 서던 자리를 그대로 쓴다(아래 격자와의 간격이 같아야 한다) */
        .rgv-receipt-note {
          margin: 0 0 12px; padding: 10px 12px;
          border-radius: 8px; background: rgba(255,77,0,.06);
          font-size: 12px; line-height: 1.55; letter-spacing: -.2px;
          color: var(--customer-ink-secondary);
        }
        .rgv-receipt-note b { font-weight: 700; color: var(--customer-ink); }
        .rgv-grid {
          display: grid; gap: 8px; align-content: start;
          grid-template-columns: repeat(var(--review-columns, 2), minmax(0, 1fr));
        }
        .rgv-modal { align-items: flex-end; }

        /* ── 카드 — 셀렉 갤러리 카드(.gl-photo-card)와 같은 규칙 ── */
        /* 비율·그라데이션·간격 모두 셀렉 갤러리 3열(.gl-density-3)과 같은 값이다 */
        .rgv-card {
          position: relative; aspect-ratio: 1; width: 100%;
          padding: 0; border: 0; border-radius: 4px; overflow: hidden; display: block; cursor: pointer;
          background: var(--surface);
        }
        .rgv-card img {
          width: 100%; height: 100%; object-fit: cover; display: block;
          transition: transform .6s ease;
        }
        .rgv-card:hover img { transform: none; }
        .rgv-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .rgv-card-placeholder { width: 100%; height: 100%; background: var(--surface); }
        /* 아래 그라데이션은 파일명을 읽히게 하려고 깐 것이라 파일명과 함께 걷어냈다 —
         * 남은 표식(판단 알약)은 흰 배경을 가진 우측 상단이라 스크림이 필요 없다. */
        /* 검토 결과는 이 화면에만 있는 정보라 갤러리에 짝이 없다 — 갤러리 체크박스와 같은 자리(위쪽)에 둔다 */
        .rgv-card-pill {
          position: absolute; top: 8px; right: 8px; z-index: 3;
          background-color: #fff;
        }
        /* PC는 목록 폭이 넓어져 3열로 두면 썸네일이 과하게 커진다 — 폭에 맞춰 열 수를 늘린다.
         * 컨테이너에 최대 폭을 줘서 초광폭 모니터에서 한 줄이 끝없이 늘어지는 것도 막는다. */
        @media (min-width: 768px) {
          /* PC 머리는 갤러리 데스크톱 헤더처럼 프로젝트명을 제목으로 올린다 */
          .rgv-header { height: 64px; padding: 0 max(24px, calc((100vw - 1392px) / 2)); }
          .rgv-head-left { gap: 16px; }
          .rgv-brand-mark { width: 32px; height: 32px; flex-basis: 32px; border-radius: 8px; font-size: 16px; }
          .rgv-title { font-size: 18px; }
          .rgv-title-m { display: none; }
          .rgv-title-pc { display: inline; }
          .rgv-deadline { margin-top: 4px; }
          .rgv-head-count { font-size: 18px; }

          .rgv-inner { max-width: var(--customer-gallery-max-width, 1440px); margin: 0 auto; padding: 20px 24px 120px; width: 100%; }
          .rgv-lead { padding: 0 0 10px; margin-bottom: 16px; }
          .rgv-receipt-note { margin-bottom: 16px; font-size: 13px; }
          .rgv-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
          /* 바텀시트는 손가락이 닿는 모바일의 관습이다 — PC에서는 가운데로 띄운다 */
          .rgv-modal { align-items: center; }
          .rgv-density { display:none; }
        }
        .rgv-grid-tools { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
        .rgv-grid-tools p { margin:0; font-size:12px; color:var(--customer-ink-secondary); word-break:keep-all; }
        .rgv-density { flex-shrink:0; min-height:44px; padding:0 10px; border:1px solid var(--customer-divider); border-radius:8px; font-size:12px; }
        .rgv-remaining { font-size:12px; color:var(--customer-ink-secondary); white-space:nowrap; }
        .rgv-head-right { flex-wrap:wrap; justify-content:flex-end; }
        .rgv-comment { position:absolute; left:8px; bottom:8px; padding:6px; border-radius:6px; background:#fff; color:var(--customer-ink); }
        .rgv-tab { min-height:44px; }
      `}</style>

      {/* 수령 모드에는 채워 나갈 진행이 없다 — 진행바를 0%로 띄우면 "아직 뭔가 남았다"로 읽힌다.
        * `showProgress={false}`면 좁은 화면에서 버튼이 가로를 다 쓴다(공통 풋터가 이미 그렇게 갈라 둔다). */}
      <SelectionConfirmFooter
        notice={!receiptMode && reviewedCount > 0 ? "아직 작가에게 전달되지 않았어요." : undefined}
        theme="customerLight"
        Y={reviewedCount}
        N={total}
        disabled={total === 0 || submitting}
        onConfirm={() => {
          // 판단이 남아 있으면 제출 대신 첫 미검토 사진으로 안내한다.
          if (allReviewed) setShowSubmitModal(true);
          else {
            const next = photos.find(photo => (getReview(photo.id)?.status ?? "pending") === "pending");
            if (next) goToPhoto(next.id);
          }
        }}
        progressLabel="보정본 검토"
        showProgress={!receiptMode}
        buttonLabel={receiptMode ? "수령 완료" : allReviewed ? "검토 결과 전달하기" : "미검토 사진 보기"}
        showMeta={false}
        mobileGallery
      />

      {/* 셀렉 확정과 같은 관문이라 같은 컴포넌트(라이트)를 쓴다 — 문구만 바꿔 끼운다 */}
      {showSubmitModal && (
        <SelectionConfirmDialog
          title={receiptMode ? "보정본을 수령할까요?" : "검토 결과를 전달할까요?"}
          description={
            receiptMode ? (
              <>
                사진 {total}장을 모두 확정 처리하고 작업을 마칩니다.
                <br />
                수령 후에는 되돌릴 수 없어요.
              </>
            ) : (
              <>
                확정 {approvedCount}장, 재보정 요청 {revisionCount}장을 작가에게 전달합니다.
                <br />
                전달 후에는 검토 결과를 바꿀 수 없어요.
              </>
            )
          }
          confirmLabel={receiptMode ? "수령 완료" : "전달하기"}
          busyLabel={receiptMode ? "처리 중..." : "전달 중..."}
          confirming={submitting}
          error={submitError}
          onCancel={() => { if (!submitting) { setShowSubmitModal(false); setSubmitError(null); } }}
          onConfirm={() => { void handleSubmit(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DeliveryReceiptView — 재보정 0회 프로젝트의 수령 확인 갤러리
// 단일 [수령 완료] CTA로 모든 사진을 approved 처리해 status=delivered 전환
// ─────────────────────────────────────────────────────────────────────────

function DeliveryReceiptView({
  token,
  project,
  photos,
  onDone,
}: {
  token: string;
  project: Project;
  photos: ReviewPhotoItem[];
  onDone: () => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  /* 다른 고객 뷰어와 같은 방식 — 꾹 누르는 동안 원본, 사진을 누르면 전체화면 집중 보기.
   * 원본/보정본 3단 토글과 전체화면 비교 모달을 대신한다. */
  const swipeStartX = useRef(0);
  useCustomerLightCanvas();
  const [holdOriginal, setHoldOriginal] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(max-width: 900px)");
    const apply = (matches: boolean) => {
      setIsMobile(matches);
    };
    apply(mql.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  // photos가 로딩된 후 activeIdx 안전 보정
  useEffect(() => {
    setActiveIdx((cur) => {
      if (photos.length === 0) return 0;
      if (cur < 0) return 0;
      if (cur >= photos.length) return photos.length - 1;
      return cur;
    });
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setActiveIdx((cur) => {
      if (photos.length === 0) return cur;
      return (cur - 1 + photos.length) % photos.length;
    });
  }, [photos.length]);
  const goNext = useCallback(() => {
    setActiveIdx((cur) => {
      if (photos.length === 0) return cur;
      return (cur + 1) % photos.length;
    });
  }, [photos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (focusOpen) return;
      if (hasShortcutModifier(e)) return; // 윈도우 Alt+←/→(뒤로/앞으로 가기)와 겹치지 않게
      if (e.key === "ArrowLeft")  { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, focusOpen]);

  async function handleConfirmReceipt() {
    if (submitting) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const reviews = photos
        .filter((p) => p.photoVersionId)
        .map((p) => ({
          photo_version_id: p.photoVersionId,
          photo_id: p.id,
          status: "approved" as const,
          customer_comment: null,
        }));
      if (reviews.length === 0) throw new Error("보정본을 불러오지 못했습니다.");
      const res = await fetch("/api/c/review/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reviews }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `서버 오류 (${res.status})`);
      onDone();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "수령 완료에 실패했습니다.");
      setSubmitting(false);
    }
  }

  const currentPhoto = photos[activeIdx] ?? null;
  const versionLabel = "보정본";
  const canShowViewer = photos.length > 0 && currentPhoto != null;


  const preloadUrlGroups = useMemo(
    () => photos.map((photo) => [
      photo.originalUrl,
      photo.versionUrl,
    ]),
    [photos],
  );
  useAdjacentImagePreload(preloadUrlGroups, canShowViewer ? activeIdx : null, {
    wrap: true,
    desktopBefore: 1,
    desktopAfter: 1,
    desktopMaxDecoded: 6,
    mobileMaxDecoded: 4,
  });

  const filename = useMemo(() => {
    if (!currentPhoto) return "";
    return currentPhoto.originalFilename?.split("/").pop() ?? `사진 ${activeIdx + 1}`;
  }, [currentPhoto, activeIdx]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--background)",
        color: "var(--foreground)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Pretendard Variable',-apple-system,sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "rgba(10,10,12,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", minHeight: 56,
          paddingTop: "env(safe-area-inset-top,0px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {/* 수령 확인 모드에서도 검토 목록과 동일하게 로고가 초대 기본 화면을 연다.
            * 서버 진입 검증을 다시 거치도록 일반 링크를 사용한다. */}
          <a
            href={token ? `/c/${token}` : "#"}
            aria-label="처음 화면으로"
            style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, textDecoration: "none" }}
          >
            <BrandLogoBar size="sm" />
          </a>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {project.name}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: ACCENT,
              background: "rgba(var(--accent-rgb), 0.1)",
              border: "1px solid rgba(var(--accent-rgb), 0.3)",
              padding: "3px 8px",
              borderRadius: 6,
              letterSpacing: "0.05em",
            }}
          >
            수령 대기
          </span>
        </div>
      </header>

      {/* Title + intro */}
      <section
        style={{
          padding: "20px 16px 12px",
          borderBottom: `1px solid ${BORDER}`,
          background: "rgba(5,5,8,0.6)",
        }}
      >
        <h1 style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", margin: 0, lineHeight: 1.35 }}>
          {filename}
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "8px 0 0", lineHeight: 1.6 }}>
          작가가 보정한 사진을 확인해 주세요. 확인이 끝나면 아래 [수령 완료]를 눌러 알려주세요.
        </p>
      </section>

      {/* Viewer + thumbnails */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Stage */}
        <div style={{ flex: 1, minHeight: 0, padding: 12, display: "flex", gap: 10, overflow: "hidden" }}>
          {canShowViewer ? (
            <div
              style={{ flex: 1, minWidth: 0, display: "flex", gap: 10, position: "relative" }}
              onTouchStart={(event) => { swipeStartX.current = event.touches[0].clientX; }}
              onTouchEnd={(event) => {
                const dx = swipeStartX.current - event.changedTouches[0].clientX;
                if (Math.abs(dx) > 50) { if (dx > 0) goNext(); else goPrev(); }
              }}
            >
              {/* 일반 상세에서는 화면 폭과 관계없이 이동 버튼을 유지하고, 사진 집중 보기에서만 숨긴다. */}
              <div style={{ display: "contents" }}>
                <PrevNextButton direction="prev" onClick={goPrev} size="md" />
                <PrevNextButton direction="next" onClick={goNext} size="md" />
              </div>
              {/* 카운터 오버레이 */}
              {photos.length > 0 && (
                <div style={{
                  position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
                  zIndex: 10, fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.7)",
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 99,
                  padding: "3px 12px", pointerEvents: "none", userSelect: "none",
                }}>
                  {activeIdx + 1} / {photos.length}
                </div>
              )}

              {/* 꾹 눌러 원본 — 검토 화면과 같은 방식(터치는 탭 토글) */}
              <button
                type="button"
                aria-pressed={holdOriginal}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isMobile) setHoldOriginal((v) => !v);
                }}
                onPointerDown={(event) => {
                  if (isMobile) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setHoldOriginal(true);
                }}
                onPointerUp={() => !isMobile && setHoldOriginal(false)}
                onPointerLeave={() => !isMobile && setHoldOriginal(false)}
                onPointerCancel={() => !isMobile && setHoldOriginal(false)}
                style={{
                  position: "absolute", top: 12, right: 12, zIndex: 10,
                  height: 34, padding: "0 13px", borderRadius: 999,
                  border: holdOriginal ? "1px solid #fff" : "1px solid rgba(255,255,255,.28)",
                  background: holdOriginal ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.6)",
                  color: holdOriginal ? "#fff" : "rgba(255,255,255,.82)",
                  cursor: "pointer",
                  font: "600 12px/1 Pretendard, 'Noto Sans KR', sans-serif",
                  userSelect: "none", WebkitUserSelect: "none", touchAction: "none",
                  transition: "background .15s ease, border-color .15s ease, color .15s ease",
                }}
              >
                {holdOriginal ? "원본 보는 중" : isMobile ? "원본과 비교" : "꾹 눌러 원본"}
              </button>

              <div
                style={{
                  flex: 1,
                  border: `1px solid ${BORDER}`,
                  background: "radial-gradient(circle at center,var(--surface-raised) 0%,var(--background) 100%)",
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: 12,
                  cursor: "zoom-in",
                }}
                onClick={() => setFocusOpen(true)}
                aria-label="사진 크게 보기"
              >
                <div style={{ position: "absolute", top: 10, left: 10, zIndex: 2, display: "flex", gap: 8, pointerEvents: "none" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.28)", padding: "4px 9px", borderRadius: 999 }}>
                    {holdOriginal ? "원본" : versionLabel}
                  </span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={holdOriginal ? currentPhoto.originalUrl : currentPhoto.versionUrl}
                  alt={holdOriginal ? "원본" : "보정본"}
                  decoding="async"
                  fetchPriority="high"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 12, background: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--subtle-foreground)", fontFamily: MONO, fontSize: 11 }}>
              보정본을 불러오는 중…
            </div>
          )}
        </div>

        {/* Thumbnails strip */}
        <div style={{ borderTop: `1px solid ${BORDER}`, background: "rgba(5,5,8,0.7)", padding: "10px 12px 110px" }}>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
            {photos.map((p, i) => {
              const thumbSrc = p.versionThumbUrl ?? p.versionUrl ?? p.originalUrl;
              const isActive = i === activeIdx;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  style={{
                    width: 86,
                    flexShrink: 0,
                    borderRadius: 12,
                    border: `1px solid ${isActive ? "rgba(var(--accent-rgb), 0.55)" : BORDER}`,
                    background: "var(--background)",
                    overflow: "hidden",
                    cursor: "pointer",
                    padding: 0,
                    position: "relative",
                  }}
                  aria-label={`사진 ${i + 1} 선택`}
                >
                  <div style={{ position: "relative", paddingBottom: "75%" }}>
                    {thumbSrc && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumbSrc}
                        alt=""
                        loading={isActive ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={isActive ? "high" : "low"}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: isActive ? 1 : 0.7 }}
                      />
                    )}
                    <span style={{ position: "absolute", top: 6, left: 7, fontFamily: MONO, fontSize: 10, color: "rgba(255,255,255,0.85)", background: "rgba(0,0,0,0.55)", padding: "1px 5px", borderRadius: 4 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div
        style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          zIndex: 50,
          background: "rgba(5,5,8,0.97)",
          backdropFilter: "blur(12px)",
          borderTop: `1px solid rgba(var(--accent-rgb), 0.25)`,
          padding: "12px 16px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom,0px))",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting || photos.length === 0}
            style={{
              width: "100%",
              height: 50,
              background: ACCENT,
              border: "none",
              borderRadius: 12,
              color: "#000",
              fontFamily: "'Inter','Pretendard',sans-serif",
              fontSize: 14,
              fontWeight: 700,
              cursor: submitting || photos.length === 0 ? "not-allowed" : "pointer",
              opacity: submitting || photos.length === 0 ? 0.6 : 1,
              transition: "all 0.2s",
            }}
          >
            {submitting ? "처리 중…" : "수령 완료"}
          </button>
        </div>
      </div>

      {/* Lightbox modal */}
      {canShowViewer && (
        <PhotoFocusOverlay
          open={focusOpen}
          /* 집중 보기는 항상 보정본에서 시작하고, 원본은 길게 누르는 동안에만 겹친다. */
          src={currentPhoto.versionUrl}
          originalSrc={currentPhoto.originalUrl}
          alt="보정본"
          onClose={() => setFocusOpen(false)}
          onPrev={photos.length > 1 ? goPrev : undefined}
          onNext={photos.length > 1 ? goNext : undefined}
        />
      )}

      {/* Confirm modal */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rcpt-confirm-title"
          onClick={() => { if (!submitting) setConfirmOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(0,0,0,0.78)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 380,
              background: "var(--surface)",
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              padding: 22,
            }}
          >
            <h3 id="rcpt-confirm-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>
              보정본 수령 완료
            </h3>
            <p style={{ margin: "10px 0 18px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              수령 완료 시 프로젝트가 납품 완료 상태로 바뀌고, 더 이상 변경할 수 없습니다.
            </p>
            {errorMsg && (
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#ef4444" }}>{errorMsg}</p>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                style={{
                  flex: 1, height: 44,
                  border: `1px solid ${BORDER}`,
                  background: "var(--background)",
                  color: "var(--muted-foreground)",
                  fontSize: 13, fontWeight: 600,
                  borderRadius: 10,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmReceipt}
                disabled={submitting}
                style={{
                  flex: 1, height: 44,
                  background: ACCENT,
                  border: "none",
                  color: "#000",
                  fontSize: 13, fontWeight: 700,
                  borderRadius: 10,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "처리 중…" : "수령 완료"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
