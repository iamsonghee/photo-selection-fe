import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase/server";

/** 테스트 전용 데이터 세팅 — ENABLE_TEST_LOGIN=true 일 때만 동작 */
export async function POST(req: Request) {
  if (process.env.ENABLE_TEST_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { action } = await req.json() as { action: "create_project" | "delete_project"; projectId?: string };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();

  // photographers 테이블에서 현재 유저의 photographer_id 조회
  const { data: photographer } = await admin
    .from("photographers")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!photographer) {
    return NextResponse.json({ error: "Photographer not found" }, { status: 404 });
  }

  if (action === "create_project") {
    const today = new Date();
    const deadline = new Date(today);
    deadline.setDate(deadline.getDate() + 30);

    const { data: project, error } = await admin
      .from("projects")
      .insert({
        photographer_id: photographer.id,
        name: `[E2E] 테스트 프로젝트 ${Date.now()}`,
        customer_name: "E2E 테스트 고객",
        shoot_date: today.toISOString().slice(0, 10),
        deadline: deadline.toISOString().slice(0, 10),
        required_count: 5,
        photo_count: 0,
        status: "preparing",
      })
      .select("id, access_token")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, projectId: project.id, accessToken: project.access_token });
  }

  if (action === "delete_project") {
    const { projectId } = await req.json().catch(() => ({}));
    if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

    await admin.from("photos").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId).eq("photographer_id", photographer.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  if (process.env.ENABLE_TEST_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { projectId } = await req.json() as { projectId: string };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: photographer } = await admin
    .from("photographers")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!photographer) return NextResponse.json({ error: "Photographer not found" }, { status: 404 });

  await admin.from("photos").delete().eq("project_id", projectId);
  await admin.from("projects").delete().eq("id", projectId).eq("photographer_id", photographer.id);

  return NextResponse.json({ ok: true });
}
