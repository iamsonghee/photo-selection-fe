import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { getAppSettings } from "@/lib/app-settings";
import { recordBetaUsageEvent } from "@/lib/beta-usage-events";

/**
 * OAuth 콜백 Route Handler
 * Supabase가 구글 로그인 후 리다이렉트할 때 호출됩니다.
 * photographers 테이블에 auth_id = user.id 인 레코드 없으면 INSERT (auth_id, email).
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/photographer/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/", requestUrl.origin));
  }

  const supabase = await createClient();
  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[Auth Callback] exchangeCodeForSession error:", error);
    return NextResponse.redirect(new URL("/?error=" + encodeURIComponent(error.message), requestUrl.origin));
  }

  const user = sessionData?.user;
  if (user?.id) {
    try {
      const admin = getAdminClient();
      const { data: existing } = await admin
        .from("photographers")
        .select("id")
        .eq("auth_id", user.id)
        .limit(1)
        .single();
      const photographerId = existing?.id ?? crypto.randomUUID();

      if (!existing) {
        const newId = photographerId;
        const email = user.email ?? null;

        // 가입 전 사전 등록된 초대 이메일이면 자동으로 베타 부여
        let invitation: { id: string } | null = null;
        if (email) {
          const { data: inv } = await admin
            .from("beta_invitations")
            .select("id")
            .eq("email", email.toLowerCase())
            .is("consumed_at", null)
            .limit(1)
            .maybeSingle();
          invitation = inv ?? null;
        }

        if (invitation) {
          const settings = await getAppSettings();
          const today = new Date();
          const endDate = new Date(today);
          endDate.setDate(endDate.getDate() + settings.betaDefaultDurationDays);
          const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

          await admin.from("photographers").insert({
            id: newId,
            auth_id: user.id,
            email,
            beta_status: "active",
            beta_start_date: toIsoDate(today),
            beta_end_date: toIsoDate(endDate),
          });
          await admin
            .from("beta_invitations")
            .update({ consumed_at: new Date().toISOString() })
            .eq("id", invitation.id);
          await admin.from("admin_audit_logs").insert({
            photographer_id: newId,
            actor: "system",
            action: "beta_granted",
            detail: { via: "invitation", email },
          });
        } else {
          await admin.from("photographers").insert({
            id: newId,
            auth_id: user.id,
            email,
          });
        }

        // 가입 전 같은 이메일로 베타 신청서를 낸 적이 있으면, 아직 매칭되지 않은 신청 건을
        // 새로 생성된 계정과 연결한다(plan/beta-system.md §12-3 "가입 시점" 매칭 — 신청 시점
        // 매칭은 POST /api/beta/applications에서 이미 처리됨).
        if (email) {
          await admin
            .from("beta_applications")
            .update({ matched_photographer_id: newId, updated_at: new Date().toISOString() })
            .eq("email", email.toLowerCase())
            .is("matched_photographer_id", null);
        }

        await recordBetaUsageEvent(admin, { eventType: "signup_completed", photographerId: newId });
      }

      // 첫 로그인 — 신규/기존 계정 모두 여기서 시도한다. 유니크 인덱스가 작가당 1건만 허용해
      // 이미 기록됐으면 조용히 무시되므로(recordBetaUsageEvent 참고) 매 로그인마다 별도 조회 없이
      // 그냥 insert를 시도해도 안전하다.
      await recordBetaUsageEvent(admin, { eventType: "first_login", photographerId });
    } catch (e) {
      // photographer 행 생성 실패 시에도 로그인 리다이렉트는 계속 진행
      console.error("[Auth Callback] photographer upsert failed:", e);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
