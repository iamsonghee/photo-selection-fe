import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import {
  IMPLEMENTED_SURVEY_TYPES,
  SURVEY_LATER_COOLDOWN_HOURS,
  type FirstDeliverySurveyAnswers,
  type SecondDeliverySurveyAnswers,
  type ProjectCreatedSurveyAnswers,
  type OriginalUploadedSurveyAnswers,
  type SelectionReceivedSurveyAnswers,
  type HelpfulFeature,
  type FivePointScale,
  type SurveyType,
} from "@/lib/beta-survey";

async function getPhotographerIdFromSession(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data } = await supabase
    .from("photographers")
    .select("id")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  return data?.id ?? null;
}

const HELPFUL_FEATURE_VALUES: HelpfulFeature[] = [
  "select_link",
  "compare_original_edited",
  "retouch_request",
  "customer_convenience",
  "other",
];
const PRICE_RANGE_VALUES = ["under_5k", "5k_10k", "10k_30k", "30k_50k", "over_50k", "no_paid_intent"];

function isFivePointScale(v: unknown): v is FivePointScale {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

/** ② 설문 응답 형식 검증(§7.1). 유효하지 않으면 에러 메시지를 반환한다. */
function validateFirstDeliveryAnswers(answers: unknown): string | null {
  if (typeof answers !== "object" || answers === null) return "answers required";
  const a = answers as Partial<FirstDeliverySurveyAnswers>;
  if (typeof a.usedWithRealCustomer !== "boolean") return "invalid usedWithRealCustomer";
  if (!isFivePointScale(a.timeSavedScale)) return "invalid timeSavedScale";
  if (
    !Array.isArray(a.helpfulFeatures) ||
    a.helpfulFeatures.length === 0 ||
    !a.helpfulFeatures.every((f) => HELPFUL_FEATURE_VALUES.includes(f))
  ) {
    return "invalid helpfulFeatures";
  }
  if (a.helpfulFeatures.includes("other") && !a.helpfulFeaturesOther?.trim()) {
    return "helpfulFeaturesOther required";
  }
  if (!isFivePointScale(a.willUseNextProject)) return "invalid willUseNextProject";
  return null;
}

/** ③ 설문 응답 형식 검증(§7.1). 유효하지 않으면 에러 메시지를 반환한다. */
function validateSecondDeliveryAnswers(answers: unknown): string | null {
  if (typeof answers !== "object" || answers === null) return "answers required";
  const a = answers as Partial<SecondDeliverySurveyAnswers>;
  if (!isFivePointScale(a.continueUsingIntent)) return "invalid continueUsingIntent";
  if (typeof a.npsScore !== "number" || !Number.isInteger(a.npsScore) || a.npsScore < 0 || a.npsScore > 10) {
    return "invalid npsScore";
  }
  if (!isFivePointScale(a.painIfGone)) return "invalid painIfGone";
  if (!PRICE_RANGE_VALUES.includes(a.priceRange as string)) return "invalid priceRange";
  if (!isFivePointScale(a.subscribeIntentIfPaid)) return "invalid subscribeIntentIfPaid";
  if (typeof a.wantsLaunchNotice !== "boolean") return "invalid wantsLaunchNotice";
  return null;
}

/** 생성 후 마이크로 설문 검증(1문항) */
function validateProjectCreatedAnswers(answers: unknown): string | null {
  if (typeof answers !== "object" || answers === null) return "answers required";
  const a = answers as Partial<ProjectCreatedSurveyAnswers>;
  if (!isFivePointScale(a.easeScale)) return "invalid easeScale";
  return null;
}

/** 원본 업로드 후 마이크로 설문 검증(2문항) */
function validateOriginalUploadedAnswers(answers: unknown): string | null {
  if (typeof answers !== "object" || answers === null) return "answers required";
  const a = answers as Partial<OriginalUploadedSurveyAnswers>;
  if (!isFivePointScale(a.uploadEaseScale)) return "invalid uploadEaseScale";
  return null;
}

/** 셀렉 회신받았을 때 마이크로 설문 검증(2문항) */
function validateSelectionReceivedAnswers(answers: unknown): string | null {
  if (typeof answers !== "object" || answers === null) return "answers required";
  const a = answers as Partial<SelectionReceivedSurveyAnswers>;
  if (!isFivePointScale(a.reviewEaseScale)) return "invalid reviewEaseScale";
  return null;
}

/** 첫 생성 프로젝트 id 조회(응답의 project_id 컨텍스트로 저장, §8.3) */
async function getFirstProjectId(photographerId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id")
    .eq("photographer_id", photographerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** 생성 순서 기준 두 번째 프로젝트 id 조회(③ 설문의 project_id 컨텍스트, §6.1) */
async function getSecondProjectId(photographerId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id")
    .eq("photographer_id", photographerId)
    .order("created_at", { ascending: true })
    .range(1, 1);
  return data?.[0]?.id ?? null;
}

/** POST: 설문 제출 또는 "나중에" 기록(§7.2) */
export async function POST(req: NextRequest) {
  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { surveyType, action, answers } = body as {
      surveyType?: SurveyType;
      action?: "submit" | "later";
      answers?: unknown;
    };

    if (!surveyType || !IMPLEMENTED_SURVEY_TYPES.includes(surveyType)) {
      return NextResponse.json({ error: "invalid surveyType" }, { status: 400 });
    }
    if (action !== "submit" && action !== "later") {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("beta_survey_responses")
      .select("submitted_at")
      .eq("photographer_id", photographerId)
      .eq("survey_type", surveyType)
      .maybeSingle();

    // 이미 제출된 설문은 재기록하지 않는다(멱등, §11)
    if (existing?.submitted_at) {
      return NextResponse.json({ ok: true, alreadySubmitted: true });
    }

    if (action === "later") {
      const laterUntil = new Date(Date.now() + SURVEY_LATER_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const { error } = await admin
        .from("beta_survey_responses")
        .upsert(
          { photographer_id: photographerId, survey_type: surveyType, later_until: laterUntil, updated_at: new Date().toISOString() },
          { onConflict: "photographer_id,survey_type" }
        );
      if (error) {
        console.error("[POST photographer/beta-survey later]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, laterUntil });
    }

    // action === "submit"
    const validators: Record<SurveyType, ((a: unknown) => string | null) | undefined> = {
      link_sent: undefined,
      project_created: validateProjectCreatedAnswers,
      original_uploaded: validateOriginalUploadedAnswers,
      selection_received: validateSelectionReceivedAnswers,
      first_delivery: validateFirstDeliveryAnswers,
      second_delivery: validateSecondDeliveryAnswers,
    };
    const validator = validators[surveyType];
    const validationError = validator ? validator(answers) : "unsupported surveyType";
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const projectId =
      surveyType === "second_delivery"
        ? await getSecondProjectId(photographerId)
        : await getFirstProjectId(photographerId);
    const { error } = await admin.from("beta_survey_responses").upsert(
      {
        photographer_id: photographerId,
        survey_type: surveyType,
        project_id: projectId,
        answers,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "photographer_id,survey_type" }
    );
    if (error) {
      console.error("[POST photographer/beta-survey submit]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST photographer/beta-survey]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
