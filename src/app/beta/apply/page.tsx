import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BetaApplyForm } from "@/components/beta/BetaApplyForm";
import { OG_MAIN_IMAGE, SITE_NAME } from "@/lib/site-metadata";

const title = "클로즈드 베타 신청 | A-CUT";
const description = "사진작가를 위한 A-CUT 클로즈드 베타 신청. 승인 후 더 많은 프로젝트와 사진, AI 유사컷 분석을 이용할 수 있습니다.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/beta/apply" },
  openGraph: { title, description, url: "/beta/apply", siteName: SITE_NAME, images: [OG_MAIN_IMAGE], type: "website", locale: "ko_KR" },
};

export default async function BetaApplyPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <div>
      <BetaApplyForm prefillEmail={session?.user?.email ?? null} />
    </div>
  );
}
