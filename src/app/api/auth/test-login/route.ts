import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 테스트 전용 이메일 로그인 — ENABLE_TEST_LOGIN=true 일 때만 동작 */
export async function POST(req: Request) {
  if (process.env.ENABLE_TEST_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };

  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true, userId: data.user?.id });
}
