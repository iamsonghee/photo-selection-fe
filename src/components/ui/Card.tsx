import { type HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: "div" | "section" | "article";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ as: Comp = "div", className = "", ...props }, ref) => {
    return (
      <Comp
        ref={ref}
        className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 ${className}`}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

export function CardHeader({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`mb-4 text-lg font-semibold text-zinc-100 ${className}`} {...props} />;
}

export function CardTitle({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`text-base font-medium text-zinc-200 ${className}`} {...props} />;
}

export function CardDescription({ className = "", ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-sm text-zinc-400 mt-1 ${className}`} {...props} />;
}
