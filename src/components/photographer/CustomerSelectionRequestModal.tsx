"use client";

import { useState } from "react";
import { CalendarDays, KeyRound, Link2, Pencil, RefreshCw } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerModal } from "@/components/ui/PhotographerModal";

const QUICK_DEADLINE_DAYS = [3, 7, 15] as const;

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function deadlineFromToday(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return toLocalDateInputValue(date);
}

function initialDeadlineValue(value: string): string {
  const normalized = value.slice(0, 10);
  return normalized && normalized >= toLocalDateInputValue(new Date()) ? normalized : deadlineFromToday(7);
}

function customerInitial(name: string): string {
  return name.trim().slice(0, 1) || "고";
}

function relativeDeadlineLabel(value: string): string {
  if (!value) return "";
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const target = new Date(`${value}T12:00:00`);
  if (Number.isNaN(target.getTime())) return "";
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "오늘";
  if (days > 0) return `오늘부터 ${days}일 후`;
  return `${Math.abs(days)}일 전`;
}

function formattedDeadline(value: string): string {
  if (!value) return "날짜를 선택하세요";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${year}.${month}.${day}`;
}

function compactInviteUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return value;
  }
}

export function CustomerSelectionRequestModal({
  open,
  onClose,
  customerName,
  customerPhone,
  photoCount,
  requiredCount,
  recommendedCount,
  recommendedPhotos,
  includeOriginal,
  initialDeadline,
  inviteUrl,
  accessPin,
  pending,
  onRequest,
  onSavePin,
  onReviewRecommendations,
}: {
  open: boolean;
  onClose: () => void;
  customerName: string;
  customerPhone?: string | null;
  photoCount: number;
  requiredCount: number;
  recommendedCount?: number;
  recommendedPhotos?: ReadonlyArray<{ id: string; url: string; originalFilename?: string | null }>;
  includeOriginal: boolean;
  initialDeadline: string;
  inviteUrl: string;
  accessPin?: string | null;
  pending: boolean;
  onRequest: (deadline: string) => void | Promise<void>;
  /** 지정하면 "고객 접속 정보" PIN 칸에 연필 아이콘이 붙고, 이 모달 안에서 바로
   * 입력 칸으로 바뀐다 — CustomerInviteShareModal의 인라인 PIN 편집과 같은 계약. */
  onSavePin?: (pin: string | null) => Promise<void>;
  onReviewRecommendations?: () => void;
}) {
  const [deadline, setDeadline] = useState(() => initialDeadlineValue(initialDeadline));
  const [photoLockAcknowledged, setPhotoLockAcknowledged] = useState(false);
  const deadlineLabel = relativeDeadlineLabel(deadline);
  const inviteUrlLabel = compactInviteUrl(inviteUrl);
  const [editingPin, setEditingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSaveError, setPinSaveError] = useState("");
  const recommendationOverflow = Math.max(0, (recommendedCount ?? 0) - requiredCount);

  const handleClose = () => {
    if (pending || pinSaving) return;
    setPhotoLockAcknowledged(false);
    setEditingPin(false);
    setPinSaveError("");
    onClose();
  };

  function startEditPin() {
    setPinDraft(accessPin ?? "");
    setPinSaveError("");
    setEditingPin(true);
  }

  function cancelEditPin() {
    setEditingPin(false);
    setPinSaveError("");
  }

  async function saveEditPin() {
    if (!onSavePin) return;
    const normalized = pinDraft.trim();
    if (normalized && normalized.length !== 4) {
      setPinSaveError("4자리 숫자로 입력해 주세요");
      return;
    }
    setPinSaving(true);
    setPinSaveError("");
    try {
      await onSavePin(normalized || null);
      setEditingPin(false);
    } catch (e) {
      setPinSaveError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setPinSaving(false);
    }
  }

  return (
    <PhotographerModal
      open={open}
      onClose={handleClose}
      closeDisabled={pending || pinSaving}
      variant="workflow"
      maxWidth={650}
      title={(
        <>
          <span className="sm:hidden">셀렉 요청</span>
          <span className="hidden sm:inline">고객에게 셀렉 요청하기</span>
        </>
      )}
      description={<span className="hidden sm:inline">마감일을 정한 뒤 고객에게 접속 정보를 전달하세요</span>}
      footer={(
        <div className="flex min-w-0 gap-2">
          <div className="hidden sm:block sm:flex-[0.72]">
            <PhotographerLightButton
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={pending || pinSaving}
              className="h-12 w-full px-3 text-[14px] leading-5 tracking-[-0.28px] sm:h-14 sm:px-5 sm:text-[15px]"
            >
              취소
            </PhotographerLightButton>
          </div>
          <PhotographerLightButton
            type="button"
            variant="primary"
            onClick={() => onRequest(deadline)}
            disabled={!deadline || !photoLockAcknowledged || pending || pinSaving}
            className="h-12 min-w-0 flex-1 px-4 text-[15px] leading-6 tracking-[-0.32px] sm:h-14 sm:px-6 sm:text-[16px] sm:flex-[1.28]"
          >
            {pending ? "요청 시작 중…" : `${requiredCount.toLocaleString()}장 셀렉 요청하기`}
          </PhotographerLightButton>
        </div>
      )}
    >
      <div data-selection-request-content className="flex min-w-0 flex-col gap-4 sm:gap-6">
        <section className="min-w-0 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 sm:px-5 sm:py-4">
          <div data-mobile-selection-summary className="flex min-w-0 items-center gap-3 sm:hidden">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--customer-soft)] text-[12px] font-bold text-cyan">
              {customerInitial(customerName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-5 text-foreground">{customerName}</p>
              <p className="mt-0.5 truncate text-[12px] leading-[18px] tracking-[-0.24px] text-muted-foreground">
                원본 {photoCount.toLocaleString()}장 · 셀렉 {requiredCount.toLocaleString()}장 · 원본 다운로드 {includeOriginal ? "포함" : "미포함"}
              </p>
            </div>
          </div>
          <div className="hidden flex-col gap-4 sm:flex sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--customer-soft)] text-[13px] font-bold text-cyan">
                {customerInitial(customerName)}
              </span>
              <div className="min-w-0 text-[16px] leading-6 tracking-[-0.32px]">
                <p className="truncate font-medium text-foreground">{customerName}</p>
                <p className="truncate text-[13px] font-normal leading-5 text-muted-foreground">
                  {customerPhone || "연락처 없이 링크 직접 공유"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-border-subtle pt-4 sm:min-w-[330px] sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
              <div className="pr-4 text-left sm:text-center">
                <p className="text-[12px] font-medium leading-[18px] tracking-[-0.24px] text-muted-foreground">원본</p>
                <p className="text-[14px] font-semibold leading-5 tracking-[-0.28px] text-foreground">{photoCount.toLocaleString()}장</p>
              </div>
              <div className="border-l border-border-subtle px-4 text-left sm:text-center">
                <p className="text-[12px] font-medium leading-[18px] tracking-[-0.24px] text-muted-foreground">셀렉</p>
                <p className="text-[14px] font-semibold leading-5 tracking-[-0.28px] text-foreground">{requiredCount.toLocaleString()}장</p>
              </div>
              <div className="border-l border-border-subtle pl-4 text-left sm:text-center">
                <p className="text-[12px] font-medium leading-[18px] tracking-[-0.24px] text-muted-foreground">원본 다운로드</p>
                <p className="text-[14px] font-semibold leading-5 tracking-[-0.28px] text-foreground">
                  {includeOriginal ? "허용" : "미포함"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {recommendedCount !== undefined && (
          <section className="rounded-lg border border-border-subtle bg-surface px-3.5 py-3 sm:px-4" data-recommendation-delivery-summary>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-[13px] font-bold leading-5 text-foreground">
                  작가 추천 사진 · {recommendedCount > 0 ? `${recommendedCount.toLocaleString()}장` : "없음"}
                </h4>
                <p className="mt-0.5 text-[12px] leading-[18px] text-muted-foreground">
                  {recommendedCount === 0
                    ? `고객이 전체 사진에서 직접 ${requiredCount.toLocaleString()}장을 선택합니다.`
                    : recommendationOverflow > 0
                      ? `셀렉 요청 수보다 ${recommendationOverflow.toLocaleString()}장 많아요.`
                    : recommendedCount === requiredCount
                      ? "고객은 추천 그대로 확정하거나 다른 사진을 고를 수 있어요."
                      : `고객이 최종 ${requiredCount.toLocaleString()}장을 고를 때 참고합니다.`}
                </p>
              </div>
              {onReviewRecommendations ? (
                <button
                  type="button"
                  onClick={() => { handleClose(); onReviewRecommendations(); }}
                  disabled={pending || pinSaving}
                  className="shrink-0 border-0 bg-transparent px-0 py-0.5 text-[12px] font-bold leading-5 text-accent disabled:opacity-40"
                >
                  {recommendedCount > 0 ? "확인·수정" : "추천 사진 추가"}
                </button>
              ) : null}
            </div>
            {recommendedCount > 0 && recommendedPhotos?.length ? (
              <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2" data-recommendation-preview>
                {recommendedPhotos.slice(0, 5).map((photo, index) => (
                  <div key={photo.id} className={`relative min-w-0 ${index >= 3 ? "hidden sm:block" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" title={photo.originalFilename ?? undefined} loading="lazy" className="aspect-square min-w-0 w-full rounded-md bg-surface-raised object-cover" />
                    {index === 2 && recommendedCount > 3 ? (
                      <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/55 text-[13px] font-bold text-white sm:hidden">+{(recommendedCount - 3).toLocaleString()}</span>
                    ) : null}
                    {index === 4 && recommendedCount > 5 ? (
                      <span className="absolute inset-0 hidden items-center justify-center rounded-md bg-black/55 text-[13px] font-bold text-white sm:flex">+{(recommendedCount - 5).toLocaleString()}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        )}
        <section data-selection-deadline-controls>
          <div className="flex items-center justify-between gap-4">
            <span id="selection-deadline-label" className="text-[14px] font-bold leading-5 tracking-[-0.28px] text-foreground">
              셀렉 마감일
            </span>
            <span className="shrink-0 whitespace-nowrap text-right text-[11px] font-medium leading-[18px] tracking-[-0.24px] text-muted-foreground sm:text-[12px]">
              {deadlineLabel}
            </span>
          </div>
          <div data-selection-deadline-input-row className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2">
            <div
              data-mobile-deadline-field
              className="relative flex h-12 w-full min-w-0 items-center justify-between overflow-hidden rounded-lg border border-border-subtle bg-surface px-3 text-foreground focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10 sm:hidden"
            >
              <span className="min-w-0 truncate text-[14px] font-medium leading-6 tracking-[-0.2px]">
                {formattedDeadline(deadline)}
              </span>
              <CalendarDays className="ml-3 shrink-0 text-subtle-foreground" size={18} strokeWidth={1.8} aria-hidden />
              <input
                id="selection-deadline-mobile"
                type="date"
                value={deadline}
                min={toLocalDateInputValue(new Date())}
                onChange={(event) => setDeadline(event.target.value)}
                disabled={pending}
                aria-labelledby="selection-deadline-label"
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
            </div>
            <div className="relative hidden min-w-0 sm:block sm:flex-1">
              <input
                id="selection-deadline-desktop"
                type="date"
                value={deadline}
                min={toLocalDateInputValue(new Date())}
                onChange={(event) => setDeadline(event.target.value)}
                disabled={pending}
                aria-labelledby="selection-deadline-label"
                className="h-11 min-w-0 w-full rounded-lg border border-border-subtle bg-surface px-3 text-[14px] font-normal leading-5 tracking-[-0.28px] text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-50"
              />
            </div>
            {QUICK_DEADLINE_DAYS.map((days) => {
              const quickDate = deadlineFromToday(days);
              const active = deadline === quickDate;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDeadline(quickDate)}
                  disabled={pending}
                  className={`hidden min-h-8 items-center rounded-md px-3 py-1.5 text-[13px] leading-[18px] tracking-[-0.24px] transition-colors disabled:opacity-40 sm:inline-flex ${
                    active
                      ? "bg-accent/10 font-semibold text-accent"
                      : "bg-surface-raised font-normal text-muted-foreground hover:bg-border-subtle hover:text-foreground"
                  }`}
                >
                  {days}일 후
                </button>
              );
            })}
          </div>
        </section>

        <section className="hidden sm:block">
          <div className="flex items-center justify-between gap-4">
            <h4 className="text-[14px] font-bold leading-5 tracking-[-0.28px] text-foreground">고객 접속 정보</h4>
            <span className="text-[12px] font-normal leading-[18px] text-muted-foreground">요청 후 공유할 정보</span>
          </div>
          <div className="mt-3 grid overflow-hidden rounded-lg border border-border-subtle bg-surface sm:grid-cols-[minmax(0,1fr)_180px]">
            <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
              <Link2 size={18} strokeWidth={1.8} className="shrink-0 text-subtle-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium leading-[18px] tracking-[-0.24px] text-muted-foreground">접속 링크</p>
                <p title={inviteUrl} className="truncate text-[14px] font-medium leading-5 tracking-[-0.28px] text-foreground">
                  {inviteUrlLabel}
                </p>
              </div>
            </div>
            <div className="flex min-h-[60px] flex-col justify-center gap-2 border-t border-border-subtle px-4 py-3 sm:border-l sm:border-t-0">
              {editingPin ? (
                // 이 미리보기 자리에서 바로 입력 칸으로 바꾼다 — 요청 전 단계에도
                // 공유 모달의 인라인 편집과 같은 방식을 쓴다.
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      autoFocus
                      value={pinDraft}
                      onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveEditPin(); if (e.key === "Escape") cancelEditPin(); }}
                      disabled={pinSaving}
                      aria-invalid={Boolean(pinSaveError)}
                      aria-label="새 접속 PIN"
                      placeholder="0000"
                      className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface px-2 py-1 text-center font-mono text-[13px] font-semibold tracking-[0.14em] text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setPinDraft(Math.floor(1000 + Math.random() * 9000).toString())}
                      disabled={pinSaving}
                      title="랜덤으로 채우기"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-raised disabled:opacity-50"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                  {pinSaveError ? <p role="alert" className="text-[11px] text-danger">{pinSaveError}</p> : null}
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={cancelEditPin} disabled={pinSaving} className="h-7 flex-1 rounded-md text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-surface-raised disabled:opacity-50">
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEditPin()}
                      disabled={pinSaving || (!!pinDraft && pinDraft.length !== 4)}
                      className="h-7 flex-1 rounded-md bg-accent text-[11px] font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-accent/90 disabled:opacity-40"
                    >
                      {pinSaving ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <KeyRound size={18} strokeWidth={1.8} className="shrink-0 text-subtle-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium leading-[18px] tracking-[-0.24px] text-muted-foreground">접속 비밀번호</p>
                    <p className={`text-[14px] font-medium leading-5 text-foreground ${accessPin ? "tracking-[3px]" : "tracking-[-0.28px]"}`}>
                      {accessPin || "PIN 없이 접속"}
                    </p>
                  </div>
                  {onSavePin ? (
                    <button
                      type="button"
                      onClick={startEditPin}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
                      title={accessPin ? "PIN 수정" : "PIN 설정"}
                      aria-label={accessPin ? "PIN 수정" : "PIN 설정"}
                    >
                      <Pencil size={13} />
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="sm:hidden">
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-accent/25 bg-accent/5 px-3.5 py-3">
            <input
              type="checkbox"
              checked={photoLockAcknowledged}
              onChange={(event) => setPhotoLockAcknowledged(event.target.checked)}
              disabled={pending}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0 text-[13px] font-medium leading-5 tracking-[-0.3px] text-foreground">
              요청 후 사진 구성을 변경할 수 없음을 확인했어요
            </span>
          </label>
        </section>

        <section className="hidden rounded-lg border border-accent/25 bg-accent/5 px-4 py-3.5 sm:block">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={photoLockAcknowledged}
              onChange={(event) => setPhotoLockAcknowledged(event.target.checked)}
              disabled={pending}
              aria-labelledby="selection-photo-lock-title"
              aria-describedby="selection-photo-lock-description"
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span
                id="selection-photo-lock-title"
                className="block text-[14px] font-semibold leading-5 tracking-[-0.28px] text-foreground"
              >
                요청 후에는 사진을 변경할 수 없어요
              </span>
              <span
                id="selection-photo-lock-description"
                className="mt-1 block text-[13px] font-normal leading-5 tracking-[-0.3px] text-muted-foreground"
              >
                사진 {photoCount.toLocaleString()}장을 확인해 주세요.
              </span>
            </span>
          </label>
        </section>
      </div>
    </PhotographerModal>
  );
}
