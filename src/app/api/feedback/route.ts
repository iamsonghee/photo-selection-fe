import { NextRequest, NextResponse } from "next/server";
import { getPhotographerIdFromSession } from "@/lib/photographer-session-auth";
import { getAdminClient } from "@/lib/supabase-admin";

const CATEGORIES = ["bug", "suggestion"] as const;

/** POST: 작가 피드백(버그 제보/기능 제안) 제출 */
export async function POST(req: NextRequest) {
  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { category, message, page_url: pageUrl, project_id: projectId } = body;

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { error } = await admin.from("feedback").insert({
      reporter_type: "photographer",
      photographer_id: photographerId,
      project_id: typeof projectId === "string" ? projectId : null,
      category,
      message: message.trim(),
      page_url: typeof pageUrl === "string" ? pageUrl : null,
    });

    if (error) {
      console.error("[POST feedback]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.error("[POST feedback]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
