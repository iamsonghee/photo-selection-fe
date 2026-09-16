"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "./PhotoSortSelect.module.css";

type PhotoSortOption<T extends string> = {
  value: T;
  label: string;
};

type PhotoSortSelectProps<T extends string> = {
  value: T;
  options: ReadonlyArray<PhotoSortOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
};

export function PhotoSortSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel = "사진 정렬",
  className = "",
}: PhotoSortSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} data-photo-sort-select className={`${styles.root} ${className}`}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`${ariaLabel}: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span>정렬</span><strong>{selected.label}</strong><ChevronDown size={16} aria-hidden />
      </button>
      {open ? (
        <div id={menuId} className={styles.menu} role="menu" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              onClick={() => { onChange(option.value); setOpen(false); }}
            >
              <span>{option.label}</span>{value === option.value ? <Check size={15} aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
