import { type HTMLAttributes } from "react";

interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max: number;
  variant?: "default" | "success" | "warning" | "danger";
  showLabel?: boolean;
}

const variantBg: Record<string, string> = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function ProgressBar({
  value,
  max,
  variant = "default",
  showLabel = false,
  className = "",
  ...props
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`w-full ${className}`} {...props}>
      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${variantBg[variant]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="mt-1 text-xs text-zinc-400 font-mono">
          {value}/{max} ({pct}%)
        </span>
      )}
    </div>
  );
}
