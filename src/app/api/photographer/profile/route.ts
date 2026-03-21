import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";

async function getPhotographerAuth(): Promise<{ authId: string; email: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  return { authId: session.user.id, email: session.user.email ?? null };
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
  createdAt: string;
}

const SELECT_COLS = "id, auth_id, email, name, profile_image_url, bio, instagram_url, portfolio_url, created_at";

/** GET: 현재 로그인 작가 프로필. admin 클라이언트 우선, 없으면 server anon 클라이언트로 폴백. */
export async function GET() {
  try {
    const auth = await getPhotographerAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { authId, email } = auth;

    // admin 클라이언트 시도 (SUPABASE_SERVICE_ROLE_KEY 필요)
    // 없으면 server anon 클라이언트로 폴백 (photographers 테이블 RLS SELECT 정책 필요)
    let queryClient: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof getAdminClient>;
    let hasAdmin = false;
    try {
      queryClient = getAdminClient();
      hasAdmin = true;
    } catch {
      queryClient = await createClient();
    }

    let { data, error } = await queryClient
      .from("photographers")
      .select(SELECT_COLS)
      .eq("auth_id", authId)
      .limit(1)
      .single();

    // 행 없으면 admin으로 자동 생성 (admin 사용 가능할 때만)
    // upsert + ignoreDuplicates: 동시 요청 시 unique constraint 에러 방지
    if (error?.code === "PGRST116" && hasAdmin) {
      const admin = queryClient as ReturnType<typeof getAdminClient>;
      await admin
        .from("photographers")
        .upsert({ auth_id: authId, email: email ?? null }, { onConflict: "auth_id", ignoreDuplicates: true });
      const refetched = await admin
        .from("photographers")
        .select(SELECT_COLS)
        .eq("auth_id", authId)
        .limit(1)
        .single();
      data = refetched.data;
      error = refetched.error;
    }

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 500 });
    }

    const row = data as Record<string, unknown>;
    const profile: PhotographerProfile = {
      id: row.id as string,
      authId: row.auth_id as string,
      email: (row.email as string | null) ?? null,
      name: (row.name as string | null) ?? null,
      profileImageUrl: (row.profile_image_url as string | null) ?? null,
      bio: (row.bio as string | null) ?? null,
      instagramUrl: (row.instagram_url as string | null) ?? null,
      portfolioUrl: (row.portfolio_url as string | null) ?? null,
      createdAt: row.created_at as string,
    };

    return NextResponse.json(profile);
  } catch (e) {
    console.error("[GET photographer/profile]", e);
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
