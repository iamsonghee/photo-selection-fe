import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { canTransition } from "@/lib/project-status";
import type { ProjectStatus } from "@/types";

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

    const backendUrl = process.env.BACKEND_URL ?? process.env.API_URL ?? "http://127.0.0.1:8001";
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (token) {
      try {
        await fetch(`${backendUrl}/api/projects/${id}/r2`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.warn("[DELETE projects] R2 delete request failed (continuing with DB delete):", e);
      }
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
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, photographer_id, photo_count, status")
      .eq("id", id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") payload.name = body.name;
    if (typeof body.customer_name === "string") payload.customer_name = body.customer_name;
    if (typeof body.shoot_date === "string") payload.shoot_date = body.shoot_date;
    if (typeof body.deadline === "string") payload.deadline = body.deadline;
    if (typeof body.required_count === "number") {
      const photoCount = (project as { photo_count: number | null }).photo_count ?? 0;
      if (photoCount < body.required_count) {
        return NextResponse.json(
          { error: `업로드 수(M=${photoCount}) 이상으로 N을 설정해주세요.` },
          { status: 400 }
        );
      }
      payload.required_count = body.required_count;
    }
    if (typeof body.status === "string" && body.status) {
      const currentStatus = (project as { status: string }).status as ProjectStatus;
      if (!canTransition(currentStatus, body.status as ProjectStatus)) {
        return NextResponse.json(
          { error: `상태를 '${body.status}'로 변경할 수 없습니다. (현재: ${currentStatus})` },
          { status: 400 }
        );
      }
      payload.status = body.status;
    }

    const { error: updateError } = await admin
      .from("projects")
      .update(payload)
      .eq("id", id);
    if (updateError) {
      console.error("[PATCH projects]", updateError);
      return NextResponse.json(
        { error: updateError.message ?? "Update failed" },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}
