import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProject } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";

async function getPhotographerIdFromSession(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data } = await supabase
    .from("photographers")
    .select("id")
    .eq("auth_id", session.user.id)
    .limit(1)
    .single();
  return data?.id ?? null;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, photographer_id")
      .eq("id", id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: deleteError } = await admin.from("projects").delete().eq("id", id);
    if (deleteError) {
      console.error("[DELETE projects]", deleteError);
      return NextResponse.json(
        { error: deleteError.message ?? "Delete failed" },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE projects]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    const body = await req.json();
    const patch: Parameters<typeof updateProject>[1] = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.customer_name === "string") patch.customer_name = body.customer_name;
    if (typeof body.shoot_date === "string") patch.shoot_date = body.shoot_date;
    if (typeof body.deadline === "string") patch.deadline = body.deadline;
    if (typeof body.required_count === "number") {
      const project = await getProjectById(id);
      if (project && project.photoCount < body.required_count) {
        return NextResponse.json(
          { error: `업로드 수(M=${project.photoCount}) 이상으로 N을 설정해주세요.` },
          { status: 400 }
        );
      }
      patch.required_count = body.required_count;
    }
    if (typeof body.status === "string" && body.status) patch.status = body.status;
    await updateProject(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}
