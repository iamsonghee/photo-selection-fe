import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { IMPLEMENTED_SURVEY_TYPES, type SurveyType } from "@/lib/beta-survey";
import { getEffectiveTier } from "@/lib/beta-policy";

/** 베타 설문은 tier==='beta'인 사용자에게만 노출한다(general/admin 제외). */
async function getBetaPhotographerId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data } = await supabase
    .from("photographers")
    .select("id, email, beta_status, beta_end_date")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  if (!data) return null;
  const tier = getEffectiveTier({
    email: data.email,
    betaStatus: data.beta_status,
    betaEndDate: data.beta_end_date,
  });
  return tier === "beta" ? data.id : null;
}

/** 첫 프로젝트 id 조회(마이크로 설문 3종의 공통 컨텍스트) */
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

/** 첫 프로젝트가 존재하는지 확인(생성 후 마이크로 설문 트리거) */
async function isProjectCreatedTriggered(photographerId: string): Promise<boolean> {
  return (await getFirstProjectId(photographerId)) !== null;
}

/** 첫 프로젝트에 원본 업로드 이벤트가 최소 1건 기록됐는지 확인(원본 업로드 후 마이크로 설문 트리거) */
async function isOriginalUploadedTriggered(photographerId: string): Promise<boolean> {
  const firstProjectId = await getFirstProjectId(photographerId);
  if (!firstProjectId) return false;
  const admin = getAdminClient();
  const { data } = await admin
    .from("project_logs")
    .select("id")
    .eq("project_id", firstProjectId)
    .eq("action", "uploaded")
    .limit(1)
    .maybeSingle();
  return data !== null;
}

/**
 * 첫 프로젝트에 고객 셀렉 확정(confirmed) 이벤트가 있었는지 확인(셀렉 회신받았을 때 마이크로 설문 트리거).
 * projects.status가 아니라 project_logs 존재 여부로 판단한다 — 고객이 이후 cancel-confirm으로
 * 확정을 취소하면 status는 selecting으로 되돌아가지만, "회신받은 사실" 자체는 이미 일어난
 * 이벤트이므로 남아있는 로그로 판별하는 게 맞다(②③의 상태 기반 판단과 의도적으로 다름).
 */
async function isSelectionReceivedTriggered(photographerId: string): Promise<boolean> {
  const firstProjectId = await getFirstProjectId(photographerId);
  if (!firstProjectId) return false;
  const admin = getAdminClient();
  const { data } = await admin
    .from("project_logs")
    .select("id")
    .eq("project_id", firstProjectId)
    .eq("action", "confirmed")
    .limit(1)
    .maybeSingle();
  return data !== null;
}

/** 첫 생성 프로젝트가 delivered 상태인지 확인(② 설문 트리거, §7.1) */
async function isFirstDeliveryTriggered(photographerId: string): Promise<boolean> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id, status")
    .eq("photographer_id", photographerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.status === "delivered";
}

/**
 * 생성 순서 기준 두 번째 프로젝트가 delivered 상태인지 확인(③ 설문 트리거, §6.1).
 * "완료 순서"가 아니라 "생성 순서" 기준 — created_at ASC 정렬에서 두 번째(index 1) 행을
 * 특정한 뒤 그 프로젝트의 status만 본다(project_logs.action='delivered'는 review-submit
 * 라우트에서 best-effort로 기록돼 누락 가능성이 있어, ②와 동일하게 신뢰할 수 있는
 * projects.status를 직접 사용한다).
 */
async function isSecondDeliveryTriggered(photographerId: string): Promise<boolean> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id, status")
    .eq("photographer_id", photographerId)
    .order("created_at", { ascending: true })
    .range(1, 1);
  return data?.[0]?.status === "delivered";
}

/** 납품 완료 후에는 오래된 미시 설문(생성/업로드/셀렉회신)을 더 이상 묻지 않는다 — 이미 다 끝난
 *  프로젝트의 초반 단계를 뒤늦게 물으면 맥락 없이 느껴진다는 문제(운영 QA 발견)를 막기 위함.
 *  first_delivery가 트리거된 시점에 아직 미응답인 미시 설문 3종을 영구 스킵 처리한다. */
const STALE_ON_DELIVERY: SurveyType[] = ["project_created", "original_uploaded", "selection_received"];

/** GET: 대시보드 진입 시 지금 노출해야 할 설문이 있는지 확인(§7.2) */
export async function GET() {
  try {
    const photographerId = await getBetaPhotographerId();
    if (!photographerId) {
      return NextResponse.json({ surveyType: null });
    }

    const admin = getAdminClient();
    const { data: rows } = await admin
      .from("beta_survey_responses")
      .select("survey_type, later_until, skipped_at, submitted_at")
      .eq("photographer_id", photographerId);

    const now = new Date();
    const suppressed = new Set(
      (rows ?? [])
        .filter((r) => {
          if (r.skipped_at || r.submitted_at) return true;
          if (r.later_until && new Date(r.later_until) > now) return true;
          return false;
        })
        .map((r) => r.survey_type)
    );

    if (await isFirstDeliveryTriggered(photographerId)) {
      const toSkip = STALE_ON_DELIVERY.filter((t) => !suppressed.has(t));
      if (toSkip.length > 0) {
        const nowIso = now.toISOString();
        await admin.from("beta_survey_responses").upsert(
          toSkip.map((surveyType) => ({
            photographer_id: photographerId,
            survey_type: surveyType,
            skipped_at: nowIso,
            updated_at: nowIso,
          })),
          { onConflict: "photographer_id,survey_type" }
        );
        toSkip.forEach((t) => suppressed.add(t));
      }
    }

    let surveyType: SurveyType | null = null;
    for (const type of IMPLEMENTED_SURVEY_TYPES) {
      if (suppressed.has(type)) continue;
      if (type === "project_created" && (await isProjectCreatedTriggered(photographerId))) {
        surveyType = type;
        break;
      }
      if (type === "original_uploaded" && (await isOriginalUploadedTriggered(photographerId))) {
        surveyType = type;
        break;
      }
      if (type === "selection_received" && (await isSelectionReceivedTriggered(photographerId))) {
        surveyType = type;
        break;
      }
      if (type === "first_delivery" && (await isFirstDeliveryTriggered(photographerId))) {
        surveyType = type;
        break;
      }
      if (type === "second_delivery" && (await isSecondDeliveryTriggered(photographerId))) {
        surveyType = type;
        break;
      }
    }

    return NextResponse.json({ surveyType });
  } catch (e) {
    console.error("[GET photographer/beta-survey/status]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
