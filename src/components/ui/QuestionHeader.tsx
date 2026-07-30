export function QuestionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <p className="text-sm font-medium text-foreground [word-break:keep-all] [overflow-wrap:anywhere] leading-relaxed">
        {title}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-subtle-foreground [word-break:keep-all] [overflow-wrap:anywhere] leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}
