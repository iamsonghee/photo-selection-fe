"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";

type Category = "bug" | "suggestion";

export function FeedbackButton({
  triggerClassName,
  iconClassName,
  textClassName,
}: {
  triggerClassName?: string;
  iconClassName?: string;
  textClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const projectIdMatch = pathname.match(/^\/photographer\/projects\/([^/]+)(?:\/|$)/);
  const projectId = projectIdMatch && projectIdMatch[1] !== "new" ? projectIdMatch[1] : null;

  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function reset() {
    setCategory("bug");
    setMessage("");
    setError("");
    setDone(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function submit() {
    if (!message.trim()) {
      setError("내용을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message: message.trim(), page_url: pathname, project_id: projectId }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
    } catch {
      setError("전송에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName}
        aria-label="문의하기"
        title="문의하기"
      >
        <span className={iconClassName} aria-hidden>
          <MessageCircle size={20} strokeWidth={2} />
        </span>
        <span className={textClassName}>문의하기</span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4" onClick={close}>
            <div
              className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">문의하기</h2>
                <button type="button" onClick={close} className="text-muted-foreground hover:text-foreground">
                  <X size={18} />
                </button>
              </div>

              {done ? (
                <div className="mt-4">
                  <p className="text-sm text-foreground">전달되었습니다. 감사합니다!</p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-4 w-full rounded-lg bg-accent py-2 text-sm font-semibold text-black"
                  >
                    닫기
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex gap-2">
                    {(["bug", "suggestion"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        className={`flex-1 rounded-lg border px-3 py-1.5 text-sm ${
                          category === c
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {c === "bug" ? "버그" : "제안"}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={category === "bug" ? "어떤 문제가 있었나요?" : "어떤 기능이 있으면 좋을까요?"}
                    rows={5}
                    className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-placeholder-foreground"
                  />
                  {error && <p className="text-xs text-danger">{error}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={submit}
                      disabled={submitting}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                    >
                      {submitting ? "보내는 중…" : "보내기"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
