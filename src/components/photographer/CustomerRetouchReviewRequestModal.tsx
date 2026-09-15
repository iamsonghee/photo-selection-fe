"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, Link2 } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerModal } from "@/components/ui/PhotographerModal";

const QUICK_DEADLINE_DAYS = [3, 5, 7, 15, 30] as const;

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

function relativeDeadlineLabel(value: string): string {
  if (!value) return "선택사항";
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

export function CustomerRetouchReviewRequestModal({
  open,
  onClose,
  version,
  customerName,
  photoCount,
  initialDeadline,
  pending,
  error,
  onRequest,
}: {
  open: boolean;
  onClose: () => void;
  version: 1 | 2;
  customerName: string;
  photoCount: number;
  initialDeadline?: string | null;
  pending: boolean;
  /** 직전 요청 실패 사유. alert() 대신 이 모달 안에 남겨 재시도할 곳을 잃지 않게 한다. */
  error?: string;
  onRequest: (deadline?: string) => void | Promise<void>;
}) {
  const [deadline, setDeadline] = useState(initialDeadline ?? "");
  const assetLabel = version === 1 ? "보정본" : "재보정본";
  const reviewRoundLabel = version === 1 ? "1차 보정" : "재보정";

  const handleClose = () => {
    if (pending) return;
    onClose();
  };

  return (
    <PhotographerModal
      open={open}
      onClose={handleClose}
      closeDisabled={pending}
      variant="workflow"
      maxWidth={600}
      title={`고객에게 ${assetLabel} 검토 요청`}
      description={<span className="hidden sm:inline">검토할 사진과 기한을 확인한 뒤 요청을 보내세요</span>}
      footer={(
        <div className="flex min-w-0 gap-2">
          <div className="hidden sm:block sm:flex-[0.72]">
            <PhotographerLightButton
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={pending}
              className="h-14 w-full px-6 text-[16px] leading-6 tracking-[-0.32px]"
            >
              취소
            </PhotographerLightButton>
          </div>
          <PhotographerLightButton
            type="button"
            variant="primary"
            onClick={() => onRequest(deadline || undefined)}
            disabled={pending}
            className="h-12 min-w-0 flex-1 px-4 text-[15px] leading-6 tracking-[-0.32px] sm:h-14 sm:px-6 sm:text-[16px] sm:flex-[1.28]"
          >
            {pending ? "요청 시작 중…" : `${assetLabel} 검토 요청`}
          </PhotographerLightButton>
        </div>
      )}
    >
      <div data-retouch-review-request-content className="flex min-w-0 flex-col gap-5 sm:gap-6">
        {/* 요청 전에는 검토 대상만 요약하고, 접속 정보는 요청 성공 뒤 공유 화면에서 제공합니다. */}
        <section className="min-w-0 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--customer-soft)] text-[12px] font-bold text-cyan sm:h-10 sm:w-10 sm:text-[13px]">
                {customerName.trim().slice(0, 1) || "고"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold leading-5 tracking-[-0.28px] text-foreground sm:text-[16px] sm:font-medium sm:leading-6 sm:tracking-[-0.32px]">{customerName}</p>
                <p className="mt-0.5 truncate text-[12px] leading-[18px] tracking-[-0.24px] text-muted-foreground sm:text-[13px] sm:leading-5">
                  {reviewRoundLabel} · {photoCount.toLocaleString()}장
                </p>
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-2 text-[13px] font-medium leading-5 text-muted-foreground sm:flex">
              <span className="h-2 w-2 rounded-full bg-cyan" aria-hidden />
              고객 검토
            </div>
          </div>
        </section>

        {error ? (
          <section role="alert" className="flex items-start gap-3 rounded-lg border border-danger/25 bg-danger/8 px-4 py-3.5">
            <AlertTriangle size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <p className="min-w-0 text-[13px] leading-5 text-danger">{error}</p>
          </section>
        ) : null}

        <section>
          <div className="flex items-center justify-between gap-4">
            <span id="retouch-review-deadline-label" className="text-[14px] font-bold leading-5 tracking-[-0.28px] text-foreground">고객 검토 기한</span>
            <span aria-live="polite" className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-[18px] tracking-[-0.24px] text-muted-foreground sm:text-[12px]">
              {relativeDeadlineLabel(deadline)}
            </span>
          </div>
          <div className="relative mt-2.5 flex h-12 min-w-0 max-w-full items-center justify-between overflow-hidden rounded-lg border border-border-subtle bg-surface px-3 text-foreground focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10 sm:hidden">
            <span className="min-w-0 truncate text-[14px] font-medium leading-6 tracking-[-0.2px]">{formattedDeadline(deadline)}</span>
            <CalendarDays className="ml-3 shrink-0 text-subtle-foreground" size={18} strokeWidth={1.8} aria-hidden />
            <input
              id="retouch-review-deadline-mobile"
              type="date"
              value={deadline}
              min={toLocalDateInputValue(new Date())}
              onChange={(event) => setDeadline(event.target.value)}
              disabled={pending}
              aria-labelledby="retouch-review-deadline-label"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </div>
          <div className="relative mt-3 hidden sm:block">
            <CalendarDays className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-subtle-foreground" size={18} strokeWidth={1.8} aria-hidden />
            <input
              id="retouch-review-deadline-desktop"
              type="date"
              value={deadline}
              min={toLocalDateInputValue(new Date())}
              onChange={(event) => setDeadline(event.target.value)}
              disabled={pending}
              aria-labelledby="retouch-review-deadline-label"
              className="h-[54px] min-w-0 w-full rounded-lg border border-border-subtle bg-surface pl-12 pr-5 text-[16px] leading-6 tracking-[-0.32px] text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-50"
            />
          </div>
          <div className="mt-2.5 flex min-w-0 flex-wrap gap-2 sm:mt-3">
            {QUICK_DEADLINE_DAYS.map((days) => {
              const value = deadlineFromToday(days);
              const active = deadline === value;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDeadline(value)}
                  disabled={pending}
                  className={`${days === 5 || days === 30 ? "hidden sm:inline-flex" : "inline-flex"} min-h-8 items-center rounded-md px-3 py-1.5 text-[13px] leading-[18px] tracking-[-0.24px] transition-colors disabled:opacity-40 ${
                    active
                      ? "bg-accent/10 font-semibold text-accent"
                      : "bg-surface-raised text-muted-foreground hover:bg-border-subtle hover:text-foreground"
                  }`}
                >
                  +{days}일
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg bg-surface-raised px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-subtle-foreground">
              <Link2 size={16} strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0">
              <h4 className="text-[13px] font-semibold leading-5 tracking-[-0.26px] text-foreground">요청을 시작한 뒤 링크를 공유하세요</h4>
              <p className="mt-0.5 text-[12px] leading-[18px] tracking-[-0.24px] text-muted-foreground">
                완료 화면에서 고객 링크와 비밀번호를 바로 복사할 수 있어요.
              </p>
            </div>
          </div>
        </section>

      </div>
    </PhotographerModal>
  );
}
