"use client";

import { createContext, forwardRef, useContext, useId, type ComponentProps, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { CalendarDays, ChevronLeft, RefreshCw } from "lucide-react";
import { PhotographerLightPageHeader } from "@/components/layout/PhotographerLightPageHeader";
import { FieldInfoTip } from "@/components/ui/FieldInfoTip";
import { SHOOT_TYPES } from "@/lib/project-shoot-types";

export const PROJECT_FORM_INPUT_CLASS =
  "block box-border w-full min-w-0 max-w-full min-h-12 rounded-lg border border-border-subtle bg-surface px-4 py-[11px] " +
  "md:min-h-0 md:rounded-xl md:px-5 md:py-[14px] " +
  "text-[16px] font-normal text-foreground outline-none transition-colors " +
  "placeholder:text-placeholder-foreground focus:border-accent/50 " +
  "disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-disabled-foreground";

export function projectFormInputStateClass({
  hasValue,
  error,
}: {
  hasValue?: boolean;
  error?: boolean;
}) {
  if (error) return "!border-danger/70";
  if (hasValue) return "border-accent/30";
  return "";
}

export function ProjectFormPageHeading({
  title,
  description,
  onBack,
  backLabel = "뒤로가기",
  mobileHidden = false,
}: {
  title: string;
  description: ReactNode;
  onBack: () => void;
  backLabel?: string;
  mobileHidden?: boolean;
}) {
  return (
    <>
      {mobileHidden ? <h1 className="sr-only md:hidden">{title}</h1> : null}
      <div
        data-project-form-page-heading
        className={`mb-5 items-start gap-1 md:mb-6 md:flex md:gap-3 ${mobileHidden ? "hidden" : "flex"}`}
      >
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-subtle-foreground transition-colors active:bg-surface-raised hover:text-foreground md:ml-0 md:mt-1 md:h-7 md:w-7 md:rounded-lg md:hover:bg-surface-raised"
          aria-label={backLabel}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <PhotographerLightPageHeader title={title} description={description} mobileMinimal />
        </div>
      </div>
    </>
  );
}

export function ProjectFormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section data-project-form-section className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-surface-raised bg-surface px-4 py-4 md:gap-6 md:px-8 md:py-6">
      <div className="-mx-4 -mt-4 flex items-start justify-between gap-3 rounded-t-2xl border-b border-border-subtle bg-surface-raised px-4 py-3 md:-mx-8 md:-mt-6 md:mb-2 md:gap-4 md:px-8 md:py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-foreground text-[12px] font-bold text-background">
            {number}
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-[16px] font-bold leading-6 text-foreground md:text-[18px]">{title}</h2>
            <p className="hidden text-[14px] text-muted-foreground md:block">{description}</p>
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-subtle-foreground md:text-[14px]">
          <span className="text-accent">*</span> <span className="md:hidden">필수</span><span className="hidden md:inline">필수입력</span>
        </span>
      </div>
      {children}
    </section>
  );
}

type FieldControl = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};
const FieldContext = createContext<FieldControl | null>(null);

/** Field owns identity and feedback; controls can live inside layout wrappers. */
export function ProjectFormField({
  label, info, required, children, className = "", group = false, error, hint, hintClassName,
}: {
  label: string;
  info?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  group?: boolean;
  error?: ReactNode;
  hint?: ReactNode;
  hintClassName?: string;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint || info ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext.Provider value={{ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": required ? true : undefined }}>
      <div
        className={`flex min-w-0 flex-col gap-2 ${className}`}
        role={group ? "group" : undefined}
        aria-labelledby={group ? labelId : undefined}
        aria-describedby={group ? describedBy : undefined}
      >
        <div className="flex items-center gap-1.5">
          {group ? (
            <span id={labelId} className="text-[13px] font-semibold text-muted-foreground md:text-[14px]">
              {label}{required ? <span className="text-accent"> *</span> : null}
            </span>
          ) : (
            <label id={labelId} htmlFor={id} className="text-[13px] font-semibold text-muted-foreground md:text-[14px]">
              {label}{required ? <span className="text-accent"> *</span> : null}
            </label>
          )}
          {info ? <FieldInfoTip text={info} /> : null}
        </div>
        {children}
        {hint ? <p id={hintId} className={hintClassName ?? "text-[11px] text-disabled-foreground mt-1.5"}>{hint}</p> : info ? <span id={hintId} className="sr-only">{info}</span> : null}
      </div>
      {error ? <ProjectFormError id={errorId}>{error}</ProjectFormError> : null}
    </FieldContext.Provider>
  );
}

function useFieldControl(describedBy?: string) {
  const field = useContext(FieldContext);
  return {
    ...field,
    "aria-describedby": [field?.["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
  };
}

export const ProjectFormInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((props, ref) => {
  const field = useFieldControl(props["aria-describedby"]);
  return <input {...props} {...field} ref={ref} />;
});
ProjectFormInput.displayName = "ProjectFormInput";

type ProjectFormDateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Native date picker는 유지하고 브라우저별 date text 폭은 공통 visual field로 고정한다. */
export const ProjectFormDateInput = forwardRef<HTMLInputElement, ProjectFormDateInputProps>(({
  className = "",
  value,
  disabled,
  ...props
}, ref) => {
  const field = useFieldControl(props["aria-describedby"]);
  const displayValue = typeof value === "string" && value
    ? value.replaceAll("-", ".")
    : "날짜 선택";

  return (
    <div
      data-project-form-date-control
      className={`relative flex min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/15 ${className}`}
    >
      <span
        data-project-form-date-display
        aria-hidden="true"
        className={`min-w-0 flex-1 truncate text-left ${value ? "text-foreground" : "text-placeholder-foreground"}`}
      >
        {displayValue}
      </span>
      <CalendarDays size={17} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        {...props}
        {...field}
        ref={ref}
        type="date"
        value={value}
        disabled={disabled}
        className="absolute inset-0 z-10 h-full w-full min-w-0 max-w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
});
ProjectFormDateInput.displayName = "ProjectFormDateInput";

export const ProjectFormTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) => {
  const field = useFieldControl(props["aria-describedby"]);
  return <textarea {...props} {...field} ref={ref} />;
});
ProjectFormTextarea.displayName = "ProjectFormTextarea";

export const ProjectFormPhoneInput = forwardRef<HTMLInputElement, ComponentProps<typeof PhoneInput>>((props, ref) => {
  const field = useFieldControl(props["aria-describedby"]);
  return <PhoneInput {...props} {...field} ref={ref} />;
});
ProjectFormPhoneInput.displayName = "ProjectFormPhoneInput";

export function ProjectFormError({ children, id }: { children: ReactNode; id?: string }) {
  return <p id={id} role="alert" className="ml-0.5 mt-1 text-[12px] text-danger">{children}</p>;
}

export function ProjectShootTypeSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:gap-2.5">
      {SHOOT_TYPES.map(({ value: optionValue, label, icon: Icon }) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : optionValue)}
            className={`flex min-h-11 min-w-[30%] flex-1 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border px-1 py-2.5 text-[12px] font-medium transition-colors sm:min-h-0 sm:min-w-0 sm:py-3.5 ${
              active
                ? "border-accent/50 bg-accent/8 text-accent"
                : "border-border-subtle bg-transparent text-subtle-foreground hover:border-border-strong hover:text-foreground"
            }`}
          >
            <Icon size={12} className="shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ProjectRevisionSelector({
  value,
  onChange,
}: {
  value: 0 | 1 | 2;
  onChange: (value: 0 | 1 | 2) => void;
}) {
  return (
    <div className="flex gap-2.5">
      {([0, 1, 2] as const).map((optionValue) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(optionValue)}
            className={`min-h-11 flex-1 rounded-lg border py-2.5 text-[14px] font-semibold transition-colors sm:min-h-0 sm:py-3.5 sm:text-[15px] ${
              active
                ? "border-accent/50 bg-accent/8 text-accent"
                : "border-border-subtle bg-transparent text-subtle-foreground hover:border-border-strong hover:text-foreground"
            }`}
          >
            {optionValue === 0 ? "없음" : `${optionValue}회`}
          </button>
        );
      })}
    </div>
  );
}

export function PhotographerLightSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="relative grid h-11 w-11 md:h-5 md:w-9 shrink-0 place-items-center disabled:cursor-not-allowed"
    >
      <span className={`relative block h-5 w-9 rounded-full border transition-colors ${
        checked ? "border-accent bg-accent" : "border-border-strong bg-surface-raised"
      } disabled:cursor-not-allowed`}
    >
      <span
        className={`absolute top-1 h-3 w-3 rounded-full transition-all ${
          checked
            ? "left-[20px] bg-[var(--accent-foreground)]"
            : "left-1 bg-disabled-foreground"
        }`}
      />
      </span>
    </button>
  );
}

export function ProjectFormToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  disabledMessage,
  ariaLabel,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  disabledMessage?: string;
  ariaLabel: string;
}) {
  return (
    <div>
      <div className={`flex items-center justify-between gap-4 ${disabled ? "opacity-50" : ""}`}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-0.5">
            <span className="text-[14px] font-semibold text-muted-foreground">
              {label}<span className="text-accent"> *</span>
            </span>
            <span className="md:hidden">
              <FieldInfoTip
                text={description}
                ariaLabel={`${label} 안내`}
                touchFriendly
              />
            </span>
          </div>
          <span className="hidden text-[12px] text-disabled-foreground md:inline">{description}</span>
        </div>
        <PhotographerLightSwitch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          ariaLabel={ariaLabel}
        />
      </div>
      {disabled && disabledMessage ? (
        <p className="mt-2 text-[12px] text-muted-foreground">{disabledMessage}</p>
      ) : null}
    </div>
  );
}

export function ProjectPinControl({
  value,
  onChange,
  disabled = false,
  disabledMessage,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  const enabled = Boolean(value);
  const generatePin = () => onChange(Math.floor(1000 + Math.random() * 9000).toString());

  return (
    <div>
      <div className={`flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-6 ${disabled ? "opacity-50" : ""}`}>
        <div className="flex min-w-0 basis-full flex-col gap-0.5 md:flex-1 md:basis-auto">
        <span
          data-project-pin-label
          className="whitespace-nowrap text-[13px] font-semibold text-muted-foreground md:text-[14px]"
        >
          <span className="md:hidden">고객 비밀번호</span>
          <span className="hidden md:inline">고객 비밀번호 (PIN)</span>
          <span className="text-accent"> *</span>
        </span>
        <span className="hidden text-[12px] text-disabled-foreground md:inline">
          고객이 갤러리 링크를 열 때 입력할 4자리 숫자를 설정해 주세요
        </span>
        </div>
        <div
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-2.5 py-2.5 transition-opacity md:gap-2 md:px-4 ${
          enabled ? "opacity-100" : "opacity-50"
        }`}
      >
        <input
          className="w-[64px] min-w-0 bg-transparent text-center text-[16px] font-bold tabular-nums tracking-[4px] text-foreground outline-none placeholder:text-placeholder-foreground"
          type="text"
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]*"
          aria-label="고객 비밀번호"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="0000"
        />
        <button
          type="button"
          onClick={generatePin}
          disabled={disabled}
          className="grid min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 place-items-center text-disabled-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed"
          aria-label="PIN 랜덤 생성"
        >
          <RefreshCw size={14} />
        </button>
        </div>
        <PhotographerLightSwitch
          checked={enabled}
          onCheckedChange={(checked) => checked ? generatePin() : onChange("")}
          disabled={disabled}
          ariaLabel="고객 비밀번호 사용"
        />
      </div>
      {disabled && disabledMessage ? (
        <p className="mt-2 text-[12px] text-muted-foreground">{disabledMessage}</p>
      ) : null}
    </div>
  );
}
