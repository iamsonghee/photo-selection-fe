import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getPinAuthorizedProject } from "@/lib/customer-auth-server";

/**
 * GET /api/c/photographer?token=
 * access_token으로 인증된 project에서 photographer_id를 얻어 photographers 조회 (service role).
 * 반환: { name, profile_image_url, bio, instagram_url, portfolio_url }
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token?.trim()) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    const auth = await getPinAuthorizedProject(req, token);
    if (auth.error) return auth.error;
    if (!auth.project) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    const admin = getAdminClient();
    const photographerId = auth.project.photographerId;
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
