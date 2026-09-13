"use client";

import type { ReactNode } from "react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerModal } from "@/components/ui/PhotographerModal";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description: ReactNode;
  detail?: ReactNode;
  error?: ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  tone?: "primary" | "danger";
  compact?: boolean;
};

/**
 * Figma #56052, #55798에서 검증한 compact confirmation pattern.
 * Portal/theme/scroll-lock/Escape는 PhotographerModal이 담당하고,
 * 이 컴포넌트는 confirmation geometry와 동일 폭 action pair를 공통 관리한다.
 */
export function PhotographerConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  detail,
  error,
  cancelLabel = "취소",
  confirmLabel,
  pendingLabel,
  pending = false,
  tone = "danger",
  compact = false,
}: Props) {
  return (
    <PhotographerModal
      open={open}
      onClose={onClose}
      closeDisabled={pending}
      title={title}
      description={description}
      variant="confirmation"
      confirmationDensity={compact ? "compact" : "default"}
      titleAccent={tone === "danger" ? "danger" : undefined}
      maxWidth={compact ? 360 : 412}
      footer={(
        <div className="flex gap-2">
          <PhotographerLightButton
            type="button"
            variant="secondary"
            data-dialog-autofocus
            onClick={onClose}
            pending={pending}
            size="confirmation"
            className="flex-1"
          >
            {cancelLabel}
          </PhotographerLightButton>
          <PhotographerLightButton
            type="button"
            variant={tone}
            onClick={onConfirm}
            pending={pending}
            aria-busy={pending}
            size="confirmation"
            className="flex-1"
          >
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </PhotographerLightButton>
        </div>
      )}
    >
      {detail ? (
        <div data-confirm-detail className="rounded-xl bg-surface-raised p-5">
          <ul className="list-disc pl-[21px] text-[14px] font-normal leading-[22.4px] tracking-[-0.35px] text-foreground">
            <li>{detail}</li>
          </ul>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-danger/25 bg-danger/8 px-3 py-2 text-[12px] font-medium leading-[18px] tracking-[-0.25px] text-danger">
          {error}
        </div>
      ) : null}
    </PhotographerModal>
  );
}
