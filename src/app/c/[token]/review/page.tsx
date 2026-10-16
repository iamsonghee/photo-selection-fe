"use client";

import { CustomerPageSkeleton } from "../CustomerPageSkeleton";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";
import type { Project } from "@/types";

/** 검토 목록 격자를 좁히는 상태 필터 — `all`은 필터 해제 */
type ReviewStatusFilter = "all" | "approved" | "revision_requested" | "pending";

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

  /* 검토할 수 없는 상태로 들어오면 고객 홈으로 돌린다.
   * 예전에는 여기서 데스크탑만 첫 사진으로 자동 이동시켰는데, 상세의 닫기/Esc가 이 경로로
   * 돌아오는 탓에 PC에서는 뷰어를 닫을 수 없고 항상 0번 사진으로 튕겼다. 목록을 두 플랫폼
   * 모두에 두고(ReviewGalleryView) 진입은 썸네일 탭이 대신한다.
   * 재보정 0회 상품(수령 확인)도 같은 목록을 쓴다 — 목록은 라이트, 사진 상세만 암실(DESIGN.md). */
  useEffect(() => {
    if (selectionLoading || reviewPhotosLoading) return;
    if (!project) return;
    const canReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
    if (!canReview) router.replace(`/c/${token}`);
  }, [selectionLoading, reviewPhotosLoading, project, token, router]);

  if (selectionLoading || reviewPhotosLoading || !project) {
    return <CustomerPageSkeleton variant="gallery" />;
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
  const { reloadProject } = useSelection();
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
   * (`재보정 0회 상품`도 같은 상황이라 이 화면이 맡는다.) */
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
           */
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
      // 제출로 바뀐 status를 컨텍스트에 먼저 반영해야 도착 화면이 옛 상태를 보고 되돌리지 않는다.
      await reloadProject();
      if (finalStatus === "delivered") {
        router.replace(`/c/${token}/delivered`);
        return;
      }
      if (finalStatus === "editing_v2" || finalStatus === "editing") {
        router.replace(`/c/${token}/locked`);
        return;
      }
      router.replace(`/c/${token}/confirmed`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "제출에 실패했습니다.");
      setSubmitting(false);
    }
  }, [allReviewed, submitting, photos, token, getReview, revisionCount, onSubmitted, receiptMode, reloadProject, router]);

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
        fontFamily: "var(--font-sans)",
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
          background: var(--surface); border-bottom: 1px solid #eef0f2;
        }
        .rgv-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .rgv-brand-mark {
          width: 26px; height: 26px; flex: 0 0 26px;
          display: grid; place-items: center; border-radius: 7px;
          background: var(--accent); color: #fff; text-decoration: none;
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

        /* 안쪽 스크롤러의 러버밴드가 문서로 번지지 않게 한다. */
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
          border-radius: 8px; background: rgba(var(--accent-rgb), .06);
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
          background-color: var(--surface);
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
        .rgv-comment { position:absolute; left:8px; bottom:8px; padding:6px; border-radius:6px; background:var(--surface); color:var(--customer-ink); }
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
          confirmLabel={receiptMode ? "수령 완료" : "검토 결과 전달하기"}
          busyLabel={receiptMode ? "처리 중…" : "전달 중…"}
          confirming={submitting}
          error={submitError}
          onCancel={() => { if (!submitting) { setShowSubmitModal(false); setSubmitError(null); } }}
          onConfirm={() => { void handleSubmit(); }}
        />
      )}
    </div>
  );
}
