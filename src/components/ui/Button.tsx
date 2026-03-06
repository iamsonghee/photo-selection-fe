import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost" | "google" | "kakao";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary/90",
  secondary: "bg-zinc-700 text-zinc-100 hover:bg-zinc-600",
  outline: "border border-zinc-600 text-zinc-200 hover:bg-zinc-800",
  danger: "bg-danger text-white hover:bg-danger/90",
  ghost: "text-zinc-300 hover:bg-zinc-800 hover:text-white",
  google: "bg-[#4285F4] text-white hover:bg-[#3367D6]",
  kakao: "bg-[#FEE500] text-[#3C1E1E] hover:bg-[#FDD835]",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg",
  md: "h-11 px-5 text-base rounded-lg",
  lg: "h-12 px-6 text-lg rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", fullWidth, className = "", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`
          inline-flex items-center justify-center font-medium transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${fullWidth ? "w-full" : ""}
          ${className}
        `}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
