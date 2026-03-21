import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";

async function getPhotographerAuth(): Promise<{ authId: string; email: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) return null;
  return { authId: user.id, email: user.email ?? null };
}

export interface PhotographerProfile {
  id: string;
  authId: string;
  email: string | null;
  name: string | null;
  profileImageUrl: string | null;
  bio: string | null;
  instagramUrl: string | null;
  portfolioUrl: string | null;
  contactPhone: string | null;
  createdAt: string;
}

const SELECT_COLS = "id, auth_id, email, name, profile_image_url, bio, instagram_url, portfolio_url, contact_phone, created_at";

/** GET: 현재 로그인 작가 프로필. admin 클라이언트 우선, 없으면 server anon 클라이언트로 폴백. */
export async function GET() {
  const tag = `[GET /api/photographer/profile ${Date.now()}]`;
  try {
    // STEP 1: 세션 확인
    const auth = await getPhotographerAuth();
    console.log(tag, "STEP1 auth:", auth ? `authId=${auth.authId}` : "null (no session)");
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { authId, email } = auth;

    // STEP 2: admin 클라이언트
    let queryClient: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof getAdminClient>;
    let hasAdmin = false;
    try {
      queryClient = getAdminClient();
      hasAdmin = true;
      console.log(tag, "STEP2 admin client OK");
    } catch (adminErr) {
      console.log(tag, "STEP2 admin client FAILED, fallback to anon:", adminErr instanceof Error ? adminErr.message : adminErr);
      queryClient = await createClient();
    }

    // STEP 3: 기존 행 조회
    const { data, error: selectError } = await queryClient
      .from("photographers")
      .select(SELECT_COLS)
      .eq("auth_id", authId)
      .limit(1)
      .single();
    console.log(tag, "STEP3 select result:", { data: data ? "row found" : null, errorCode: selectError?.code, errorMsg: selectError?.message });

    let finalData = data;
    let finalError = selectError;

    // STEP 4: 행 없으면 upsert
    if (selectError?.code === "PGRST116" && hasAdmin) {
      console.log(tag, "STEP4 no row found, upserting...");
      const admin = queryClient as ReturnType<typeof getAdminClient>;
      const { error: upsertError } = await admin
        .from("photographers")
        .upsert({ id: crypto.randomUUID(), auth_id: authId, email: email ?? null }, { onConflict: "auth_id", ignoreDuplicates: true });
      console.log(tag, "STEP4 upsert result:", { upsertError: upsertError ? { code: upsertError.code, msg: upsertError.message } : null });

      const { data: refetchData, error: refetchError } = await admin
        .from("photographers")
        .select(SELECT_COLS)
        .eq("auth_id", authId)
        .limit(1)
        .single();
      console.log(tag, "STEP4 refetch result:", { data: refetchData ? "row found" : null, errorCode: refetchError?.code, errorMsg: refetchError?.message });
      finalData = refetchData;
      finalError = refetchError;
    } else if (selectError?.code === "PGRST116" && !hasAdmin) {
      console.log(tag, "STEP4 no row but no admin client — cannot auto-create");
    }

    if (finalError || !finalData) {
      console.error(tag, "FINAL ERROR:", { errorCode: finalError?.code, errorMsg: finalError?.message, hasData: !!finalData });
      return NextResponse.json(
        { error: finalError?.message ?? "Not found", code: finalError?.code },
        { status: 500 }
      );
    }

    const row = finalData as Record<string, unknown>;
    const profile: PhotographerProfile = {
      id: row.id as string,
      authId: row.auth_id as string,
      email: (row.email as string | null) ?? null,
      name: (row.name as string | null) ?? null,
      profileImageUrl: (row.profile_image_url as string | null) ?? null,
      bio: (row.bio as string | null) ?? null,
      instagramUrl: (row.instagram_url as string | null) ?? null,
      portfolioUrl: (row.portfolio_url as string | null) ?? null,
      contactPhone: (row.contact_phone as string | null) ?? null,
      createdAt: row.created_at as string,
    };

    console.log(tag, "SUCCESS profile id:", profile.id);
    return NextResponse.json(profile);
  } catch (e) {
    console.error(tag, "EXCEPTION:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** PATCH: name, bio, instagram_url, portfolio_url 수정 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await getPhotographerAuth();
    const authId = auth?.authId ?? null;
    if (!authId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const payload: Record<string, unknown> = {};
    if (typeof body.name === "string") payload.name = body.name;
    else if (body.name === null) payload.name = null;
    if (typeof body.bio === "string") payload.bio = body.bio;
    else if (body.bio === null) payload.bio = null;
    if (typeof body.instagram_url === "string") payload.instagram_url = body.instagram_url;
    else if (body.instagram_url === null) payload.instagram_url = null;
    if (typeof body.portfolio_url === "string") payload.portfolio_url = body.portfolio_url;
    else if (body.portfolio_url === null) payload.portfolio_url = null;
    if (typeof body.profile_image_url === "string") payload.profile_image_url = body.profile_image_url;
    else if (body.profile_image_url === null) payload.profile_image_url = null;
    if (typeof body.contact_phone === "string") payload.contact_phone = body.contact_phone;
    else if (body.contact_phone === null) payload.contact_phone = null;

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const admin = getAdminClient();
    const { error } = await admin
      .from("photographers")
      .update(payload)
      .eq("auth_id", authId);

    if (error) {
      console.error("[PATCH photographer/profile]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH photographer/profile]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
