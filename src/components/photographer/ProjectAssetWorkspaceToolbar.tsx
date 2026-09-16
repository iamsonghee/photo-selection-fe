"use client";

import { useDialogAccessibility } from "@/hooks/useDialogAccessibility";
import workspaceStyles from "./AssetWorkspace.module.css";
import { useDesktopViewport } from "@/hooks/useDesktopViewport";
import { PhotographerPortal } from "./PhotographerPortal";
import { PhotographerLightButton } from "./PhotographerLightButton";
import { CheckSquare, ChevronDown, Download, LayoutGrid, List, SlidersHorizontal, Upload, X } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ProjectAssetToolbarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "secondary" | "primary";
};

export function ProjectAssetToolbarButton({
  variant = "secondary",
  className = "",
  type = "button",
  children,
  ...props
}: ProjectAssetToolbarButtonProps) {
  return (
    <PhotographerLightButton
      {...props}
      type={type}
      size="toolbar"
      variant={variant === "primary" ? "primary" : "outline"}
      className={className}
    >
      {children}
    </PhotographerLightButton>
  );
}

type ProjectAssetMobileContextActionProps = Omit<ProjectAssetToolbarButtonProps, "variant"> & {
  active?: boolean;
  faceKind?: "similarity" | "upload";
};

/** Mobile asset toolbar의 대표 작업이 공유하는 44px hit area와 compact tonal face. */
export function ProjectAssetMobileContextAction({
  active = false,
  faceKind,
  disabled,
  className = "",
  children,
  ...props
}: ProjectAssetMobileContextActionProps) {
  return (
    <ProjectAssetToolbarButton
      {...props}
      disabled={disabled}
      className={`group !border-0 !bg-transparent !px-0 md:hidden ${className}`}
    >
      <span
        data-mobile-context-action-face
        data-mobile-upload-button-face={faceKind === "upload" ? true : undefined}
        className={`pointer-events-none inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
          disabled
            ? "border-border-subtle bg-surface-raised text-subtle-foreground"
            : active
              ? "border-accent/30 bg-accent/[0.14] text-foreground group-hover:bg-accent/20"
              : "border-accent/20 bg-accent/[0.08] text-foreground group-hover:bg-accent/[0.14]"
        }`}
      >
        {children}
      </span>
    </ProjectAssetToolbarButton>
  );
}

type ProjectAssetMobileIconButtonProps = ProjectAssetToolbarButtonProps;

/** Mobile asset toolbar의 icon-only utility가 공유하는 시각·상호작용 규격. */
export function ProjectAssetMobileIconButton({
  className = "",
  children,
  ...props
}: ProjectAssetMobileIconButtonProps) {
  return (
    <ProjectAssetToolbarButton
      {...props}
      data-mobile-toolbar-icon
      className={`relative w-11 border-0 bg-transparent px-0 text-muted-foreground hover:bg-surface-raised hover:text-foreground ${className}`}
    >
      {children}
    </ProjectAssetToolbarButton>
  );
}

type ProjectAssetToolbarSummaryProps = {
  label: ReactNode;
  count?: ReactNode;
  meta?: ReactNode;
  metaClassName?: string;
  customerState?: boolean;
};

export function ProjectAssetToolbarSummary({
  label,
  count,
  meta,
  metaClassName = "",
  customerState = false,
}: ProjectAssetToolbarSummaryProps) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap tracking-[-0.45px]">
      <span className={`inline-flex items-center gap-2 text-[16px] font-bold leading-7 ${customerState ? "text-[var(--customer-foreground)]" : "text-foreground"}`}>
        {customerState ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--customer-foreground)]" aria-hidden /> : null}
        {label}
      </span>
      {count ? <span className="text-[15px] font-semibold tabular-nums text-muted-foreground">{count}</span> : null}
      {meta ? <span className={`ml-1 border-l border-border-subtle pl-3 text-[13px] font-medium text-muted-foreground ${metaClassName}`}>{meta}</span> : null}
    </div>
  );
}

type ProjectAssetToolbarViewToggleProps = {
  value: "gallery" | "list";
  onChange: (value: "gallery" | "list") => void;
};

export function ProjectAssetToolbarViewToggle({ value, onChange }: ProjectAssetToolbarViewToggleProps) {
  const target = value === "gallery" ? "list" : "gallery";
  const label = target === "list" ? "목록으로 보기" : "갤러리로 보기";

  return (
    <ProjectAssetMobileIconButton
      data-project-asset-view-toggle
      onClick={() => onChange(target)}
      aria-label={label}
      title={label}
    >
      {target === "list" ? <List size={18} aria-hidden /> : <LayoutGrid size={18} aria-hidden />}
    </ProjectAssetMobileIconButton>
  );
}

type ProjectAssetExportTriggerProps = {
  as?: "button" | "summary";
  label?: string;
  ariaLabel: string;
  open?: boolean;
  onClick?: () => void;
};

/** Desktop 자산 화면의 내보내기 진입점. summary와 button의 시각 규격을 함께 관리한다. */
export function ProjectAssetExportTrigger({
  as = "button",
  label = "내보내기",
  ariaLabel,
  open = false,
  onClick,
}: ProjectAssetExportTriggerProps) {
  const content = <><Download size={16} aria-hidden /><span>{label}</span><ChevronDown size={15} className={open ? workspaceStyles.exportChevronOpen : ""} aria-hidden /></>;
  if (as === "summary") {
    return <summary data-project-asset-export-trigger className={workspaceStyles.exportTrigger} aria-label={ariaLabel}>{content}</summary>;
  }
  return <button type="button" data-project-asset-export-trigger className={workspaceStyles.exportTrigger} aria-label={ariaLabel} aria-expanded={open} onClick={onClick}>{content}</button>;
}

type ProjectAssetMobileToolbarActionsProps = {
  viewMode: "gallery" | "list";
  onViewModeChange: (value: "gallery" | "list") => void;
  onOpenTools: () => void;
  toolsOpen?: boolean;
  toolCount?: number;
  toolsLabel?: string;
  onOpenExport?: () => void;
  onCloseExport?: () => void;
  exportOpen?: boolean;
  exportLabel?: string;
  exportContent?: ReactNode;
  onOpenUpload?: () => void;
  uploadDisabled?: boolean;
  uploadLabel?: string;
  onEnterSelection?: () => void;
};

/** Asset 탭들이 공유하는 Mobile 44px toolbar action cluster. */
export function ProjectAssetMobileToolbarActions({
  viewMode,
  onViewModeChange,
  onOpenTools,
  toolsOpen = false,
  toolCount = 0,
  toolsLabel = "필터 및 정렬 설정",
  onOpenExport,
  onCloseExport,
  exportOpen = false,
  exportLabel = "내보내기",
  exportContent,
  onOpenUpload,
  uploadDisabled = false,
  uploadLabel = "일괄 업로드",
  onEnterSelection,
}: ProjectAssetMobileToolbarActionsProps) {
  useEffect(() => {
    if (!exportOpen || !onCloseExport) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseExport();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exportOpen, onCloseExport]);

  return (
    <div data-mobile-asset-toolbar-actions className="flex items-center gap-0 md:hidden">
      {onOpenUpload ? (
        <ProjectAssetMobileContextAction faceKind="upload" onClick={onOpenUpload} disabled={uploadDisabled} aria-haspopup="dialog">
          <Upload size={14} className="text-accent" aria-hidden />
          {uploadLabel}
        </ProjectAssetMobileContextAction>
      ) : null}
      {onOpenExport ? (
        <div className="relative">
          <ProjectAssetMobileIconButton
            data-mobile-toolbar-utility
            onClick={onOpenExport}
            aria-label={exportLabel}
            aria-haspopup={exportContent ? "dialog" : undefined}
            aria-expanded={exportContent ? exportOpen : undefined}
          >
            <Download size={18} aria-hidden />
          </ProjectAssetMobileIconButton>
          {exportOpen && exportContent ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[200] border-0 bg-transparent md:hidden"
                aria-label={`${exportLabel} 메뉴 닫기`}
                onClick={onCloseExport}
              />
              <div
                data-mobile-export-popover
                role="dialog"
                aria-label={exportLabel}
                className="absolute right-0 top-[calc(100%+4px)] z-[201] w-[min(280px,calc(100vw-24px))] overflow-hidden rounded-xl border border-border-subtle bg-surface p-2 shadow-[0_12px_32px_rgba(2,56,82,0.18)] md:hidden"
              >
                {exportContent}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {onEnterSelection ? (
        <ProjectAssetMobileIconButton
          data-mobile-selection-action
          aria-label="보정본 선택"
          title="보정본 선택"
          onClick={onEnterSelection}
        >
          <CheckSquare size={18} aria-hidden />
        </ProjectAssetMobileIconButton>
      ) : null}
      <ProjectAssetMobileIconButton
        data-mobile-tools-action
        aria-label={toolsLabel}
        title={toolsLabel}
        aria-haspopup="dialog"
        aria-expanded={toolsOpen}
        onClick={onOpenTools}
      >
        <SlidersHorizontal size={18} aria-hidden />
        {toolCount > 0 ? <span data-mobile-tool-count className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-4 text-white">{toolCount}</span> : null}
      </ProjectAssetMobileIconButton>
      <ProjectAssetToolbarViewToggle value={viewMode} onChange={onViewModeChange} />
    </div>
  );
}

type ProjectAssetMobileSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId: string;
  closeLabel: string;
  subtitle?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Asset 탭들이 공유하는 Mobile bottom-sheet surface와 접근성 구조. */
export function ProjectAssetMobileSheet({
  open,
  onClose,
  title,
  titleId,
  closeLabel,
  subtitle,
  headerAction,
  children,
  className = "",
}: ProjectAssetMobileSheetProps) {
  const rootRef = useRef<HTMLElement>(null);
  const desktop = useDesktopViewport();
  useDialogAccessibility({ open: open && !desktop, rootRef, onClose });
  if (!open || desktop) return null;
  return (
    <PhotographerPortal>
      <button
        type="button"
        className="fixed inset-0 z-[200] touch-none border-0 bg-black/45 md:hidden"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <section
        ref={rootRef}
        tabIndex={-1}
        data-mobile-asset-sheet
        className={`fixed inset-x-0 bottom-0 z-[201] mx-auto max-h-[calc(100dvh-48px)] w-full max-w-[430px] overflow-y-auto rounded-t-2xl border border-b-0 border-border-subtle bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-12px_36px_rgba(2,56,82,0.14)] md:hidden ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border-subtle py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[18px] font-bold tracking-[-0.55px] text-foreground">{title}</h2>
            {subtitle ? <div className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerAction}
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              aria-label="닫기"
            >
              <X size={20} aria-hidden />
            </button>
          </div>
        </header>
        {children}
      </section>
    </PhotographerPortal>
  );
}

type ProjectAssetWorkspaceToolbarProps = {
  leading: ReactNode;
  actions: ReactNode;
  className?: string;
  ariaLabel?: string;
  compactMobile?: boolean;
  mobileHidden?: boolean;
};

/**
 * Asset Workspace 탭 바로 아래의 공통 operation bar.
 * 탭별 기능은 slot으로 받고 surface, inset, 높이와 양쪽 정렬은 공통 관리한다.
 */
export function ProjectAssetWorkspaceToolbar({
  leading,
  actions,
  className = "",
  ariaLabel = "사진 작업 도구",
  compactMobile = false,
  mobileHidden = false,
}: ProjectAssetWorkspaceToolbarProps) {
  return (
    <section
      data-project-asset-toolbar
      aria-label={ariaLabel}
      aria-hidden={mobileHidden}
      inert={mobileHidden ? true : undefined}
      data-mobile-hidden={mobileHidden ? "true" : "false"}
      className={`mx-0 flex shrink-0 overflow-visible border-border-subtle bg-surface px-3 transition-[min-height,height,padding,opacity,border-width] duration-200 ease-out motion-reduce:transition-none md:mx-8 md:min-h-[72px] md:border-x md:border-b md:px-6 md:py-3.5 md:opacity-100 ${
        mobileHidden
          ? "max-md:!h-0 max-md:!min-h-0 max-md:overflow-hidden max-md:!border-0 max-md:!px-0 max-md:!py-0 max-md:opacity-0"
          : compactMobile
          ? "h-11 min-h-11 max-h-11 flex-row items-center justify-between gap-2 border-x-0 border-t-0 border-b py-0"
          : "min-h-[72px] flex-col items-stretch gap-3 border-x border-b py-3"
      } ${workspaceStyles.toolbar} ${className}`}
    >
      {leading ? <div className={`flex min-w-0 items-center gap-3 md:w-auto md:shrink-0 ${compactMobile ? "w-auto" : "w-full"}`}>{leading}</div> : null}
      <div className="ml-auto flex min-w-0 items-center justify-end gap-3">{actions}</div>
    </section>
  );
}
