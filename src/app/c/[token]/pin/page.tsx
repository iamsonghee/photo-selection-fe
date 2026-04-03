import { redirect } from "next/navigation";
import { getAdminClient } from "@/lib/supabase-admin";
import PinForm from "./PinForm";

/**
 * PIN 게이트 페이지.
 * - access_pin === null → /api/c/auto-verify 로 redirect (쿠키 자동 발급 후 원래 페이지 복귀)
 * - access_pin 있음   → PinForm 렌더링 (4자리 입력)
 */
export default async function PinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const fromUrl = sp.from ?? `/c/${token}`;

  const admin = getAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("access_pin")
    .eq("access_token", token)
    .single();

  const accessPin = (project as { access_pin: string | null } | null)?.access_pin ?? null;

  if (!project || accessPin === null) {
    // PIN 없는 프로젝트 → 자동 인증 (쿠키 발급) 후 원래 페이지로
    redirect(
      `/api/c/auto-verify?token=${encodeURIComponent(token)}&to=${encodeURIComponent(fromUrl)}`
    );
  }

  return <PinForm token={token} from={fromUrl} />;
}
