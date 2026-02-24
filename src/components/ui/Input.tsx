import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">{label}</label>
        )}
        <input
          ref={ref}
          className={`
            w-full h-11 px-4 rounded-lg bg-zinc-800 border border-zinc-700
            text-zinc-100 placeholder:text-zinc-500
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? "border-danger focus:ring-danger" : ""}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
