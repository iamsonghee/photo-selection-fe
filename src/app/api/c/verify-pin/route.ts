import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const { token, pin } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const admin = getAdminClient();

    // 1. Get project by access_token
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, access_pin")
      .eq("access_token", token)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    const accessPin = (project as { access_pin: string | null }).access_pin;

    // 2. Check rate limiting: 5 attempts within 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: attempts } = await admin
      .from("pin_attempts")
      .select("id")
      .eq("project_token", token)
      .gte("attempted_at", thirtyMinutesAgo);

    const attemptsCount = attempts?.length ?? 0;

    if (attemptsCount >= 5) {
      return NextResponse.json({ success: false, locked: true }, { status: 429 });
    }

    // 3. Record this attempt
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await admin.from("pin_attempts").insert({
      project_token: token,
      ip_address: ip,
    });

    // 4. Verify PIN
    const isMatch = accessPin === null || accessPin === pin;

    if (isMatch) {
      // 5. Set verification cookie
      const cookieName = `pin_verified_${token}`;
      const response = NextResponse.json({ success: true });
      response.cookies.set(cookieName, "1", {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 86400,
        path: "/",
      });
      return response;
    }

    // 6. Wrong PIN — return remaining attempts
    const remaining = 5 - (attemptsCount + 1);
    return NextResponse.json({ success: false, remaining }, { status: 401 });
  } catch (e) {
    console.error("[verify-pin]", e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
