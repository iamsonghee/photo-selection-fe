import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getPolicyForPhotographer, type BetaStatus } from "@/lib/beta-policy";
import { getAppSettings } from "@/lib/app-settings";

/** GET: 로그인한 작가 본인의 현재 등급/사용량/한도 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data } = await admin
      .from("photographers")
      .select("id, email, beta_status, beta_end_date, total_projects_created")
      .eq("auth_id", session.user.id)
      .limit(1)
      .single();

    if (!data) {
      return NextResponse.json({ error: "Photographer not found" }, { status: 404 });
    }

    const settings = await getAppSettings();
    const betaStatus = data.beta_status as BetaStatus;
    const policy = getPolicyForPhotographer(
      {
        email: data.email,
        betaStatus,
        betaEndDate: data.beta_end_date,
      },
      settings
    );

    let current: number;
    if (policy.tier === "admin") {
      current = 0;
    } else {
      const { count } = await admin
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("photographer_id", data.id);
      current = count ?? 0;
    }

    return NextResponse.json({
      tier: policy.tier,
      current,
      max: policy.maxProjects,
      maxPhotosPerProject: policy.maxPhotosPerProject,
      maxRevisionCount: policy.maxRevisionCount,
      betaStatus,
      betaEndDate: data.beta_end_date,
    });
  } catch (e) {
    console.error("[GET photographer/quota]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
