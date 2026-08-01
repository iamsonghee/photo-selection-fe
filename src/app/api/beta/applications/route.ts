import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { isValidKoreanPhone, normalizePhone } from "@/lib/phone";
import {
  BETA_GENRE_OPTIONS,
  BETA_MONTHLY_PROJECT_OPTIONS,
  BETA_AVG_PHOTOS_OPTIONS,
  BETA_WORKFLOW_OPTIONS,
  BETA_DESIRED_FEATURE_OPTIONS,
  BETA_PAIN_POINT_OPTIONS,
  genreLabel,
  workflowLabel,
  monthlyProjectRepValue,
  avgPhotosRepValue,
  type BetaAdditionalAnswers,
} from "@/lib/beta-application";

const DUPLICATE_MESSAGE = "이미 등록된 번호입니다. 검토 후 연락드리겠습니다.";

function isValidKeySet(values: unknown, options: readonly { key: string }[]): values is string[] {
  if (!Array.isArray(values) || values.length === 0) return false;
  const validKeys = new Set(options.map((o) => o.key));
  return values.every((v) => typeof v === "string" && validKeys.has(v));
}

function isValidKey(value: unknown, options: readonly { key: string }[]): value is string {
  return typeof value === "string" && options.some((o) => o.key === value);
}

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
 *
 * 모든 선택형 값은 key로 검증·저장한다(additional_answers). 기존 genre/monthly_shoot_count/
 * avg_photos_per_project/current_workflow 컬럼은 레거시 호환을 위해 대표값을 함께 채운다
 * (컬럼 타입은 그대로 — plan 문서 "문제 3" 참고).
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
      genres,
      genre_other: genreOther,
      monthly_project_range: monthlyProjectRange,
      avg_photos_range: avgPhotosRange,
      workflow_methods: workflowMethods,
      workflow_other: workflowOther,
      desired_features: desiredFeatures,
      desired_features_other: desiredFeaturesOther,
      pain_point: painPoint,
      expectation,
      privacy_consent: privacyConsent,
      contact_consent: contactConsent,
    } = body ?? {};

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    }
    if (typeof phone !== "string" || !isValidKoreanPhone(phone)) {
      return NextResponse.json({ error: "휴대폰번호 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (!isValidKeySet(genres, BETA_GENRE_OPTIONS)) {
      return NextResponse.json({ error: "주 촬영 분야를 선택해주세요." }, { status: 400 });
    }
    if (genres.includes("other") && (typeof genreOther !== "string" || !genreOther.trim())) {
      return NextResponse.json({ error: "기타 촬영 분야를 입력해주세요." }, { status: 400 });
    }
    if (!isValidKey(monthlyProjectRange, BETA_MONTHLY_PROJECT_OPTIONS)) {
      return NextResponse.json({ error: "월평균 촬영 수를 선택해주세요." }, { status: 400 });
    }
    if (!isValidKey(avgPhotosRange, BETA_AVG_PHOTOS_OPTIONS)) {
      return NextResponse.json({ error: "촬영당 평균 사진 수를 선택해주세요." }, { status: 400 });
    }
    if (!isValidKeySet(workflowMethods, BETA_WORKFLOW_OPTIONS)) {
      return NextResponse.json({ error: "현재 고객 셀렉 방식을 선택해주세요." }, { status: 400 });
    }
    if (workflowMethods.includes("other") && (typeof workflowOther !== "string" || !workflowOther.trim())) {
      return NextResponse.json({ error: "기타 셀렉 방식을 입력해주세요." }, { status: 400 });
    }
    if (!isValidKeySet(desiredFeatures, BETA_DESIRED_FEATURE_OPTIONS)) {
      return NextResponse.json({ error: "베타에서 사용해보고 싶은 기능을 선택해주세요." }, { status: 400 });
    }
    if (
      desiredFeatures.includes("other") &&
      (typeof desiredFeaturesOther !== "string" || !desiredFeaturesOther.trim())
    ) {
      return NextResponse.json({ error: "기타 희망 기능을 입력해주세요." }, { status: 400 });
    }
    if (painPoint !== undefined && !isValidKey(painPoint, BETA_PAIN_POINT_OPTIONS)) {
      return NextResponse.json({ error: "가장 불편한 단계 값이 올바르지 않습니다." }, { status: 400 });
    }
    if (expectation !== undefined && typeof expectation !== "string") {
      return NextResponse.json({ error: "A-CUT에 기대하는 점 값이 올바르지 않습니다." }, { status: 400 });
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

    // 레거시 컬럼 대표값: genre는 사용자가 첫 번째로 선택한 장르(기타만 선택했다면 "기타"),
    // current_workflow는 선택한 방식들의 라벨을 이어붙인 요약 텍스트.
    const genreRepresentative = genreLabel(genres[0]);
    const workflowSummary = workflowMethods.map((k: string) => workflowLabel(k)).join(", ");

    const additionalAnswers: BetaAdditionalAnswers = {
      genres,
      ...(genres.includes("other") && genreOther?.trim() ? { genre_other: genreOther.trim() } : {}),
      monthly_project_range: monthlyProjectRange,
      avg_photos_range: avgPhotosRange,
      workflow_methods: workflowMethods,
      ...(workflowMethods.includes("other") && workflowOther?.trim()
        ? { workflow_other: workflowOther.trim() }
        : {}),
      desired_features: desiredFeatures,
      ...(desiredFeatures.includes("other") && desiredFeaturesOther?.trim()
        ? { desired_features_other: desiredFeaturesOther.trim() }
        : {}),
      ...(painPoint ? { pain_point: painPoint } : {}),
      ...(expectation?.trim() ? { expectation: expectation.trim() } : {}),
    };

    const { error } = await admin.from("beta_applications").insert({
      name: name.trim(),
      phone: normalizedPhone,
      email: sessionPhotographer.email.toLowerCase(),
      genre: genreRepresentative,
      monthly_shoot_count: monthlyProjectRepValue(monthlyProjectRange),
      avg_photos_per_project: avgPhotosRepValue(avgPhotosRange),
      current_workflow: workflowSummary,
      reason: expectation?.trim() || null,
      additional_answers: additionalAnswers,
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
