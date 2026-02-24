import { type TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">{label}</label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full min-h-[100px] px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700
            text-zinc-100 placeholder:text-zinc-500 resize-y
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
Textarea.displayName = "Textarea";
