import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { isValidKoreanPhone, normalizePhone } from "@/lib/phone";
import { BETA_APPLICATION_GENRES } from "@/lib/beta-application";

const DUPLICATE_MESSAGE = "이미 등록된 번호입니다. 검토 후 연락드리겠습니다.";

async function getSessionPhotographer(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const { data } = await supabase
    .from("photographers")
    .select("id, email")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  if (!data) return null;

  return { id: data.id, email: data.email ?? null };
}

/**
 * POST /api/beta/applications — 베타 신청서 제출.
 * 로그인(구글/카카오) 필수 — 이메일/matched_photographer_id는 항상 서버 세션에서 가져온다
 * (관리자가 이메일을 수동으로 입력/매칭할 필요를 없애기 위한 정책, plan/beta-system.md §3.1 참고).
 * 클라이언트는 이메일을 보내지 않으며, 보내더라도 무시한다.
 */
export async function POST(req: NextRequest) {
  try {
    const sessionPhotographer = await getSessionPhotographer();
    if (!sessionPhotographer) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!sessionPhotographer.email) {
      return NextResponse.json(
        { error: "계정에 이메일 정보가 없습니다. 관리자에게 문의해주세요." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      name,
      phone,
      genre,
      monthly_shoot_count: monthlyShootCount,
      avg_photos_per_project: avgPhotosPerProject,
      current_workflow: currentWorkflow,
      reason,
      privacy_consent: privacyConsent,
      contact_consent: contactConsent,
    } = body ?? {};

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    }
    if (typeof phone !== "string" || !isValidKoreanPhone(phone)) {
      return NextResponse.json({ error: "휴대폰번호 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (typeof genre !== "string" || !BETA_APPLICATION_GENRES.includes(genre as (typeof BETA_APPLICATION_GENRES)[number])) {
      return NextResponse.json({ error: "촬영 장르를 선택해주세요." }, { status: 400 });
    }
    const monthlyShootCountNum = Number(monthlyShootCount);
    if (!Number.isFinite(monthlyShootCountNum) || monthlyShootCountNum < 0) {
      return NextResponse.json({ error: "월평균 촬영 건수를 확인해주세요." }, { status: 400 });
    }
    const avgPhotosNum = Number(avgPhotosPerProject);
    if (!Number.isFinite(avgPhotosNum) || avgPhotosNum < 0) {
      return NextResponse.json({ error: "프로젝트당 평균 전달 사진 수를 확인해주세요." }, { status: 400 });
    }
    if (typeof currentWorkflow !== "string" || !currentWorkflow.trim()) {
      return NextResponse.json(
        { error: "현재 셀렉·보정 요청 전달 방식을 입력해주세요." },
        { status: 400 }
      );
    }
    if (typeof reason !== "string" || !reason.trim()) {
      return NextResponse.json(
        { error: "A-CUT을 사용해보고 싶은 이유를 입력해주세요." },
        { status: 400 }
      );
    }
    if (privacyConsent !== true) {
      return NextResponse.json({ error: "개인정보 수집·이용에 동의해주세요." }, { status: 400 });
    }
    if (contactConsent !== true) {
      return NextResponse.json({ error: "베타 운영 연락 수신에 동의해주세요." }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone);
    const admin = getAdminClient();

    // 휴대폰번호를 신청자 식별 키로 간주 — 같은 번호로는 신규 레코드를 만들지 않는다(plan/beta-system.md §3.4).
    const { data: existing, error: dupCheckError } = await admin
      .from("beta_applications")
      .select("id")
      .eq("phone", normalizedPhone)
      .maybeSingle();
    if (dupCheckError) {
      console.error("[POST beta/applications] duplicate check", dupCheckError);
      return NextResponse.json({ error: dupCheckError.message }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ error: DUPLICATE_MESSAGE }, { status: 409 });
    }

    const now = new Date().toISOString();

    const { error } = await admin.from("beta_applications").insert({
      name: name.trim(),
      phone: normalizedPhone,
      email: sessionPhotographer.email.toLowerCase(),
      genre,
      monthly_shoot_count: Math.round(monthlyShootCountNum),
      avg_photos_per_project: Math.round(avgPhotosNum),
      current_workflow: currentWorkflow.trim(),
      reason: reason.trim(),
      privacy_consent_at: now,
      contact_consent_at: now,
      matched_photographer_id: sessionPhotographer.id,
    });

    if (error) {
      if (error.code === "23505") {
        // UNIQUE(phone) 제약 위반 — 중복 확인과 insert 사이의 레이스 컨디션
        return NextResponse.json({ error: DUPLICATE_MESSAGE }, { status: 409 });
      }
      console.error("[POST beta/applications]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.error("[POST beta/applications]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
