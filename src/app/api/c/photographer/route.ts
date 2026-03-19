import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * GET /api/c/photographer?token=
 * access_token으로 project 조회 → photographer_id로 photographers 조회 (service role).
 * 반환: { name, profile_image_url, bio, instagram_url, portfolio_url }
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token?.trim()) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("photographer_id")
      .eq("access_token", token.trim())
      .limit(1)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    const photographerId = (project as { photographer_id: string }).photographer_id;
    const { data: photographer, error: photographerError } = await admin
      .from("photographers")
      .select("name, profile_image_url, bio, instagram_url, portfolio_url")
      .eq("id", photographerId)
      .limit(1)
      .single();

    if (photographerError || !photographer) {
      return NextResponse.json({
        name: null,
        profile_image_url: null,
        bio: null,
        instagram_url: null,
        portfolio_url: null,
      });
    }

    const row = photographer as {
      name: string | null;
      profile_image_url: string | null;
      bio: string | null;
      instagram_url: string | null;
      portfolio_url: string | null;
    };
    return NextResponse.json({
      name: row.name ?? null,
      profile_image_url: row.profile_image_url ?? null,
      bio: row.bio ?? null,
      instagram_url: row.instagram_url ?? null,
      portfolio_url: row.portfolio_url ?? null,
    });
  } catch (e) {
    console.error("[GET /api/c/photographer]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
