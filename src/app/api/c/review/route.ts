import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getReviewDataByToken, getProjectByToken } from "@/lib/customer-api-server";

/** GET /api/c/review?token= — 보정본 검토 데이터 (project, photos with version URLs, existing reviews) */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  try {
    const admin = getAdminClient();
    const data = await getReviewDataByToken(admin, token);
    if (data) {
      return NextResponse.json(data);
    }
    const project = await getProjectByToken(admin, token);
    if (project?.status === "reviewing_v1" || project?.status === "reviewing_v2") {
      return NextResponse.json({ project, globalPhotographerMemo: null, photos: [] });
    }
    return NextResponse.json({ error: "Invalid token or not in review phase" }, { status: 404 });
  } catch (e) {
    console.error("[GET /api/c/review]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
