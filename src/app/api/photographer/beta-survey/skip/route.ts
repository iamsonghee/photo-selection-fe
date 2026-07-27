import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { IMPLEMENTED_SURVEY_TYPES, type SurveyType } from "@/lib/beta-survey";

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

/** POST: 설문 "다시 묻지 않기"(영구 건너뛰기, §7.2) */
export async function POST(req: NextRequest) {
  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { surveyType } = body as { surveyType?: SurveyType };

    if (!surveyType || !IMPLEMENTED_SURVEY_TYPES.includes(surveyType)) {
      return NextResponse.json({ error: "invalid surveyType" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("beta_survey_responses")
      .select("submitted_at")
      .eq("photographer_id", photographerId)
      .eq("survey_type", surveyType)
      .maybeSingle();

    // 이미 제출된 설문은 건너뛰기로 덮어쓰지 않는다
    if (existing?.submitted_at) {
      return NextResponse.json({ ok: true });
    }

    const { error } = await admin
      .from("beta_survey_responses")
      .upsert(
        { photographer_id: photographerId, survey_type: surveyType, skipped_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "photographer_id,survey_type" }
      );
    if (error) {
      console.error("[POST photographer/beta-survey/skip]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST photographer/beta-survey/skip]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
