"use client";

import { useEffect } from "react";
import { StatusPage } from "@/components/StatusPage";
import { PhotographerLightButton, PhotographerLightLinkButton } from "@/components/photographer/PhotographerLightButton";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      title="화면을 불러오지 못함"
      description="잠시 후 다시 시도해 주세요. 계속 같은 화면이 보이면 주소를 다시 열어 주세요."
      actions={(
        <>
          <PhotographerLightButton onClick={reset}>다시 시도</PhotographerLightButton>
          <PhotographerLightLinkButton href="/" variant="secondary">처음으로</PhotographerLightLinkButton>
        </>
      )}
    />
  );
}
