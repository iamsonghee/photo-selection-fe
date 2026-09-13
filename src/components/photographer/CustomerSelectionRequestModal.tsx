"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, KeyRound, Link2 } from "lucide-react";
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
  includeOriginal,
  initialDeadline,
  inviteUrl,
  accessPin,
  pending,
  onRequest,
}: {
  open: boolean;
  onClose: () => void;
  customerName: string;
  customerPhone?: string | null;
  photoCount: number;
  requiredCount: number;
  includeOriginal: boolean;
  initialDeadline: string;
  inviteUrl: string;
  accessPin?: string | null;
  pending: boolean;
  onRequest: (deadline: string) => void | Promise<void>;
}) {
  const [deadline, setDeadline] = useState(() => initialDeadline || deadlineFromToday(7));
  const [photoLockAcknowledged, setPhotoLockAcknowledged] = useState(false);
  const deadlineLabel = relativeDeadlineLabel(deadline);
  const inviteUrlLabel = compactInviteUrl(inviteUrl);

  const handleClose = () => {
    if (pending) return;
    setPhotoLockAcknowledged(false);
    onClose();
  };

  return (
    <PhotographerModal
      open={open}
      onClose={handleClose}
      closeDisabled={pending}
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
              disabled={pending}
              className="h-14 w-full px-6 text-[16px] leading-6 tracking-[-0.32px]"
            >
              취소
            </PhotographerLightButton>
          </div>
          <PhotographerLightButton
            type="button"
            variant="primary"
            onClick={() => onRequest(deadline)}
            disabled={!deadline || !photoLockAcknowledged || pending}
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
                셀렉 {requiredCount.toLocaleString()}장 · 원본 {photoCount.toLocaleString()}장 · 다운로드 {includeOriginal ? "허용" : "미포함"}
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
            <div className="grid grid-cols-2 border-t border-border-subtle pt-4 sm:min-w-[250px] sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
              <div className="pr-4 text-left sm:text-center">
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

        <section>
          <div className="flex items-center justify-between gap-4">
            <span id="selection-deadline-label" className="text-[14px] font-bold leading-5 tracking-[-0.28px] text-foreground">
              셀렉 마감일
            </span>
            <span className="shrink-0 whitespace-nowrap text-right text-[11px] font-medium leading-[18px] tracking-[-0.24px] text-muted-foreground sm:text-[12px]">
              {deadlineLabel}
            </span>
          </div>
          <div
            data-mobile-deadline-field
            className="relative mt-2.5 flex h-12 min-w-0 max-w-full items-center justify-between overflow-hidden rounded-lg border border-border-subtle bg-surface px-3 text-foreground focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10 sm:hidden"
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
          <div className="relative mt-3 hidden sm:block">
            <CalendarDays className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-subtle-foreground" size={18} strokeWidth={1.8} aria-hidden />
            <input
              id="selection-deadline-desktop"
              type="date"
              value={deadline}
              min={toLocalDateInputValue(new Date())}
              onChange={(event) => setDeadline(event.target.value)}
              disabled={pending}
              aria-labelledby="selection-deadline-label"
              className="h-[54px] min-w-0 max-w-full w-full rounded-lg border border-border-subtle bg-surface pl-12 pr-5 text-[16px] font-normal leading-6 tracking-[-0.32px] text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-50"
            />
          </div>
          <div className="mt-2.5 flex min-w-0 flex-wrap gap-2 sm:mt-3">
            {QUICK_DEADLINE_DAYS.map((days) => {
              const quickDate = deadlineFromToday(days);
              const active = deadline === quickDate;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDeadline(quickDate)}
                  disabled={pending}
                  className={`${days === 5 || days === 30 ? "hidden sm:inline-flex" : "inline-flex"} min-h-8 items-center rounded-md px-3 py-1.5 text-[13px] leading-[18px] tracking-[-0.24px] transition-colors disabled:opacity-40 ${
                    active
                      ? "bg-accent/10 font-semibold text-accent"
                      : "bg-surface-raised font-normal text-muted-foreground hover:bg-border-subtle hover:text-foreground"
                  }`}
                >
                  +{days}일
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
            <div className="flex min-h-[60px] items-center gap-3 border-t border-border-subtle px-4 py-3 sm:border-l sm:border-t-0">
              <KeyRound size={18} strokeWidth={1.8} className="shrink-0 text-subtle-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium leading-[18px] tracking-[-0.24px] text-muted-foreground">접속 비밀번호</p>
                <p className={`text-[14px] font-medium leading-5 text-foreground ${accessPin ? "tracking-[3px]" : "tracking-[-0.28px]"}`}>
                  {accessPin || "PIN 없이 접속"}
                </p>
              </div>
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
              요청 후 원본 사진을 변경할 수 없음을 확인했어요
            </span>
          </label>
        </section>

        <section className="hidden rounded-lg border border-accent/25 bg-accent/5 px-4 py-3.5 sm:block">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <div>
              <h4
                id="selection-photo-lock-title"
                className="text-[14px] font-semibold leading-5 tracking-[-0.28px] text-foreground"
              >
                셀렉 요청 후에는 원본 사진을 수정할 수 없습니다
              </h4>
              <p
                id="selection-photo-lock-description"
                className="mt-1 text-[13px] font-normal leading-5 tracking-[-0.3px] text-muted-foreground"
              >
                사진의 추가·삭제·교체가 제한됩니다. 현재 구성을 최종 확인해주세요.
              </p>
            </div>
          </div>
          <label className="mt-3 flex min-h-10 cursor-pointer items-center gap-3 border-t border-accent/15 pt-3">
            <input
              type="checkbox"
              checked={photoLockAcknowledged}
              onChange={(event) => setPhotoLockAcknowledged(event.target.checked)}
              disabled={pending}
              aria-labelledby="selection-photo-lock-title"
              aria-describedby="selection-photo-lock-description"
              className="h-[18px] w-[18px] shrink-0 accent-[var(--accent)]"
            />
            <span className="text-[13px] font-medium leading-5 tracking-[-0.3px] text-foreground">
              현재 원본 {photoCount.toLocaleString()}장으로 요청하는 것에 동의합니다
            </span>
          </label>
        </section>
      </div>
    </PhotographerModal>
  );
}
