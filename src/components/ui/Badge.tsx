import { type HTMLAttributes } from "react";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "in_progress" | "waiting" | "completed";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  default: "bg-zinc-700 text-zinc-200",
  success: "bg-success/20 text-success",
  warning: "bg-warning/20 text-warning",
  danger: "bg-danger/20 text-danger",
  info: "bg-primary/20 text-primary",
  in_progress: "bg-warning/20 text-warning",
  waiting: "bg-zinc-600 text-zinc-300",
  completed: "bg-success/20 text-success",
};

export function Badge({ variant = "default", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
        ${variantClasses[variant]}
        ${className}
      `}
      {...props}
    />
  );
}
