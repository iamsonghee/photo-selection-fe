import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { parseUploadPerformance } from "@/lib/upload-performance";

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const row = parseUploadPerformance(JSON.parse(text));
    const admin = getAdminClient();
    const { data: photographer, error: photographerError } = await admin
      .from("photographers")
      .select("id")
      .eq("auth_id", user.id)
      .maybeSingle();
    if (photographerError || !photographer?.id) {
      return NextResponse.json({ error: "Photographer not found" }, { status: 403 });
    }

    const appVersion = process.env.VERCEL_GIT_COMMIT_SHA
      ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
      ?? null;
    const { error } = await admin.from("upload_performance_logs").insert({
      ...row,
      photographer_id: photographer.id,
      app_version: appVersion?.slice(0, 128) ?? null,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    console.error("[POST photographer/upload-performance]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
