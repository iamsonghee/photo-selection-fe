import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getPolicyForPhotographer, type BetaStatus } from "@/lib/beta-policy";

async function getPhotographerFromSession(): Promise<{
  id: string;
  email: string | null;
  betaStatus: BetaStatus;
  betaEndDate: string | null;
  totalProjectsCreated: number;
} | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const admin = getAdminClient();
  const { data } = await admin
    .from("photographers")
    .select("id, email, beta_status, beta_end_date, total_projects_created")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    betaStatus: data.beta_status as BetaStatus,
    betaEndDate: data.beta_end_date,
    totalProjectsCreated: data.total_projects_created ?? 0,
  };
}

/** POST: 프로젝트 생성 — 등급별 한도를 서버에서 검증한 뒤 생성한다. */
export async function POST(req: NextRequest) {
  try {
    const photographer = await getPhotographerFromSession();
    if (!photographer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const policy = getPolicyForPhotographer({
      email: photographer.email,
      betaStatus: photographer.betaStatus,
      betaEndDate: photographer.betaEndDate,
    });

    const admin = getAdminClient();

    if (policy.tier !== "admin") {
      let current: number;
      {
        const { count } = await admin
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("photographer_id", photographer.id);
        current = count ?? 0;
      }

      const max = policy.maxProjects ?? Infinity;
      if (current >= max) {
        const wasBeta = photographer.betaStatus === "ended" || photographer.betaStatus === "suspended";
        const message = wasBeta
          ? "베타 이용 기간이 종료되었습니다."
          : "무료 체험에서는 프로젝트 1개까지 생성할 수 있습니다.";
        try {
          await admin.from("admin_audit_logs").insert({
            photographer_id: photographer.id,
            actor: "system",
            action: "project_limit_hit",
            detail: { current, max: policy.maxProjects, tier: policy.tier },
          });
        } catch {
          // 감사 로그 실패는 무시(본 응답을 막지 않음)
        }
        return NextResponse.json(
          {
            detail: {
              error: "beta_limit_exceeded",
              limit_type: wasBeta ? "beta_expired" : "projects_total",
              current,
              max: policy.maxProjects,
              message,
            },
          },
          { status: 403 }
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    const {
      name,
      customer_name,
      shoot_date,
      deadline,
      required_count,
      shoot_type,
      customer_phone,
      access_pin,
      max_revision_count,
      location,
      include_original,
    } = body ?? {};

    if (
      typeof name !== "string" || !name.trim() ||
      typeof customer_name !== "string" || !customer_name.trim() ||
      typeof shoot_date !== "string" || !shoot_date ||
      typeof deadline !== "string" || !deadline ||
      typeof required_count !== "number" || required_count < 1
    ) {
      return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
    }

    const accessToken = crypto.randomUUID();
    const { data: inserted, error: insertError } = await admin
      .from("projects")
      .insert({
        name: name.trim(),
        customer_name: customer_name.trim(),
        shoot_date,
        deadline,
        required_count,
        photo_count: 0,
        status: "preparing",
        photographer_id: photographer.id,
        access_token: accessToken,
        max_revision_count: max_revision_count ?? 0,
        revision_round: 0,
        ...(shoot_type ? { shoot_type } : {}),
        ...(customer_phone ? { customer_phone } : {}),
        ...(access_pin ? { access_pin } : {}),
        ...(location ? { location } : {}),
        ...(include_original != null ? { include_original } : {}),
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      return NextResponse.json({ error: insertError?.message ?? "프로젝트 생성 실패" }, { status: 500 });
    }

    // 누적 생성 카운터 증가(일반 사용자 한도 판정용 — 베타/관리자에게도 항상 기록해
    // 나중에 베타가 끝나 일반으로 돌아갔을 때 이력이 자연히 반영되도록 함)
    await admin
      .from("photographers")
      .update({ total_projects_created: photographer.totalProjectsCreated + 1 })
      .eq("id", photographer.id);

    await admin.from("project_logs").insert({
      project_id: inserted.id,
      photographer_id: photographer.id,
      action: "created",
    });

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (e) {
    console.error("[POST photographer/projects]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
