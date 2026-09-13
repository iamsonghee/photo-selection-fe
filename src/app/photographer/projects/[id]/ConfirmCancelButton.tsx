"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { PhotographerConfirmDialog } from "@/components/ui/PhotographerConfirmDialog";

export function ConfirmCancelButton({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/photographer/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "selecting" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const responseError = data as { error?: string; currentStatus?: string };
        const msg = responseError.error ?? res.statusText;
        // 이미 selecting이면 UX 관점에서 성공으로 취급 (중복 클릭/화면 지연 대비)
        if (responseError.currentStatus === "selecting") {
          setOpen(false);
          onSuccess?.();
          router.refresh();
          return;
        }
        console.error("[확정 취소]", msg);
        return;
      }
      await fetch("/api/photographer/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, action: "selecting" }),
      }).catch(() => {});
      setOpen(false);
      onSuccess?.();
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="outline" className="flex items-center gap-2" onClick={() => setOpen(true)}>
        확정 취소
      </Button>
      <PhotographerConfirmDialog
        open={open}
        onClose={() => { if (!submitting) setOpen(false); }}
        onConfirm={handleConfirm}
        title="셀렉 확정을 취소할까요?"
        description="고객이 다시 선택 사진과 요청을 수정할 수 있습니다."
        detail="현재 확정 상태가 해제되고 프로젝트가 고객 셀렉 단계로 돌아갑니다."
        cancelLabel="유지하기"
        confirmLabel="확정 취소"
        pendingLabel="처리 중…"
        pending={submitting}
        tone="primary"
        compact
      />
    </>
  );
}
