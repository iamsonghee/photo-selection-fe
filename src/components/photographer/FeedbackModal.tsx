"use client";

import { useId, useState, type ButtonHTMLAttributes } from "react";
import { PhotographerLightButton } from "./PhotographerLightButton";
import { PhotographerModal } from "@/components/ui/PhotographerModal";
import { usePathname } from "next/navigation";
import { CheckCircle2, MessageCircle } from "lucide-react";

function FeedbackAction({ primary = false, fullWidth = false, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; fullWidth?: boolean }) {
  return <PhotographerLightButton {...props} variant={primary ? "primary" : "secondary"} className={`${fullWidth ? "w-full" : ""} ${className}`} />;
}

type Category = "bug" | "suggestion";

export function FeedbackButton({
  triggerClassName,
  iconClassName,
  textClassName,
  triggerRole,
}: {
  triggerClassName?: string;
  iconClassName?: string;
  textClassName?: string;
  triggerRole?: "menuitem";
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const messageId = useId();
  const errorId = useId();
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
    if (submitting) return;
    setOpen(false);
    reset();
  }

  async function submit() {
    if (submitting) return;
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
        role={triggerRole}
        aria-label="A-CUT에 의견 보내기"
        title="A-CUT에 의견 보내기"
      >
        <span className={iconClassName} aria-hidden>
          <MessageCircle size={20} strokeWidth={2} />
        </span>
        <span className={textClassName}>A-CUT에 의견 보내기</span>
      </button>

      <PhotographerModal
        open={open}
        onClose={close}
        closeDisabled={submitting}
        title="A-CUT에 의견 보내기"
        description="사용 중 불편했던 점이나 필요한 기능을 알려주세요."
        maxWidth={420}
        footer={done ? (
          <FeedbackAction primary fullWidth type="button" onClick={close}>닫기</FeedbackAction>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <FeedbackAction type="button" onClick={close} disabled={submitting}>취소</FeedbackAction>
            <FeedbackAction
              primary
              type="button"
              aria-busy={submitting}
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "보내는 중…" : "보내기"}
            </FeedbackAction>
          </div>
        )}
      >
        {done ? (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-success/10 text-success" aria-hidden>
              <CheckCircle2 size={24} strokeWidth={1.8} />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-foreground">의견이 전달되었습니다.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">보내주신 내용은 서비스 개선에 참고하겠습니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="문의 유형">
              {(["bug", "suggestion"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  disabled={submitting}
                  className={`min-h-10 rounded-lg border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                    category === c
                      ? "border-accent bg-accent/8 text-accent"
                      : "border-border-subtle bg-surface text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                  }`}
                >
                  {c === "bug" ? "오류 제보" : "기능 제안"}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor={messageId} className="mb-2 block text-[13px] font-semibold text-foreground">문의 내용</label>
              <textarea
                id={messageId}
                disabled={submitting}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={category === "bug" ? "어떤 문제가 있었는지 알려주세요." : "어떤 기능이 필요하신가요?"}
                rows={5}
                className="w-full resize-none rounded-xl border border-border-subtle bg-surface p-3.5 text-[14px] leading-6 text-foreground outline-none placeholder:text-placeholder-foreground focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
              />
              {error ? <p id={errorId} role="alert" className="mt-2 text-[12px] font-medium text-danger">{error}</p> : null}
            </div>
          </div>
        )}
      </PhotographerModal>
    </>
  );
}
