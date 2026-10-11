"use client";

import { useState } from "react";
import { AuthModal } from "@/components/AuthModal";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { clearPostLoginRedirect } from "@/lib/post-login-redirect";
import "@/app/customer-select/_lib/customer-select-auth.css";

export function LoginPanel({ next, failed }: { next: string; failed: boolean }) {
  const [open, setOpen] = useState(!failed);
  return <div className="cs-auth mt-8">
    {failed && <p role="alert" className="mb-4 text-sm text-danger">로그인을 완료하지 못했어요. 다시 시도해 주세요.</p>}
    <PhotographerLightButton onClick={() => setOpen(true)} size="confirmation">로그인하고 계속하기</PhotographerLightButton>
    <AuthModal isOpen={open} redirectPath={next} onClose={() => { clearPostLoginRedirect(); setOpen(false); }} notice="같은 계정으로 스튜디오와 내 사진 셀렉을 이용할 수 있어요." />
  </div>;
}
