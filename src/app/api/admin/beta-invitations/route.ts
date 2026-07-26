import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase-admin";

/** POST /api/admin/beta-invitations — 가입 전 이메일 사전 등록(초대) */
export async function POST(req: NextRequest) {
  const auth = await getAdminUser();
  if (auth.status !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const rawEmail = body?.email;
  if (typeof rawEmail !== "string" || !rawEmail.trim()) {
    return NextResponse.json({ error: "이메일을 입력해주세요." }, { status: 400 });
  }
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "올바른 이메일 형식이 아닙니다." }, { status: 400 });
  }

  const admin = getAdminClient();

  const { data: existingPhotographer } = await admin
    .from("photographers")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingPhotographer) {
    return NextResponse.json(
      { error: "이미 가입된 사용자입니다. 사용자 상세에서 직접 베타를 부여해주세요." },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("beta_invitations")
    .upsert({ email, invited_at: new Date().toISOString(), consumed_at: null }, { onConflict: "email" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
