"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { updateProject } from "@/lib/db";

export function ConfirmCancelButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await updateProject(projectId, { status: "selecting" });
      await fetch("/api/photographer/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, action: "selecting" }),
      }).catch(() => {});
      setOpen(false);
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
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
            <p className="text-center text-zinc-200">
              고객이 다시 사진을 수정할 수 있게 됩니다. 취소하시겠습니까?
            </p>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                아니오
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting ? "처리 중..." : "예, 취소합니다"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
