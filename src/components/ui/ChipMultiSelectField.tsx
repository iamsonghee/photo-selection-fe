import { Input } from "./Input";

/**
 * 짧은 라벨 복수선택용 칩 리스트. "기타" 옵션(otherOptionValue)이 선택됐을 때만
 * 보조 텍스트 입력을 노출하며, grid-rows 트랜지션으로 레이아웃이 갑자기 튀지 않게 한다.
 */
export function ChipMultiSelectField<T extends string>({
  options,
  values,
  onChange,
  max,
  otherOptionValue,
  otherValue,
  onOtherChange,
  otherPlaceholder = "어떤 내용이었나요?",
}: {
  options: readonly { value: T; label: string }[];
  values: T[];
  onChange: (values: T[]) => void;
  max?: number;
  otherOptionValue?: T;
  otherValue?: string;
  onOtherChange?: (v: string) => void;
  otherPlaceholder?: string;
}) {
  const limitReached = max !== undefined && values.length >= max;
  const showOther = otherOptionValue !== undefined && values.includes(otherOptionValue);

  function toggle(v: T) {
    const selected = values.includes(v);
    if (!selected && limitReached) return;
    onChange(selected ? values.filter((f) => f !== v) : [...values, v]);
  }

  return (
    <div>
      {max !== undefined && (
        <p className="mb-1.5 text-[11px] text-subtle-foreground">최대 {max}개까지 선택 가능</p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = values.includes(opt.value);
          const disabled = !selected && limitReached;
          return (
            <label
              key={opt.value}
              className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/15 has-[:checked]:text-foreground ${
                disabled
                  ? "cursor-not-allowed border-border-subtle text-disabled-foreground opacity-60"
                  : "cursor-pointer border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={disabled}
                onChange={() => toggle(opt.value)}
                className="sr-only"
              />
              {opt.label}
            </label>
          );
        })}
      </div>
      {otherOptionValue !== undefined && (
        <div
          aria-hidden={!showOther}
          className={`grid transition-all duration-200 ${showOther ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0"}`}
        >
          <div className="overflow-hidden">
            <Input
              type="text"
              value={otherValue ?? ""}
              onChange={(e) => onOtherChange?.(e.target.value)}
              placeholder={otherPlaceholder}
              className="h-10"
              tabIndex={showOther ? undefined : -1}
            />
          </div>
        </div>
      )}
    </div>
  );
}
