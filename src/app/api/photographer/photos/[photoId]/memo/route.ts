import { NextRequest, NextResponse } from "next/server";
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const { photoId } = await params;
  if (!photoId) {
    return NextResponse.json({ error: "Missing photoId" }, { status: 400 });
  }

  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (typeof body.memo !== "string") {
      return NextResponse.json({ error: "memo required" }, { status: 400 });
    }

    const memo = body.memo.trim();
    const memoToSave: string | null = memo.length ? memo : null;

    const admin = getAdminClient();
    const { data: photo, error: photoError } = await admin
      .from("photos")
      .select("id, project_id")
      .eq("id", photoId)
      .limit(1)
      .single();

    if (photoError || !photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const projectId = (photo as { project_id: string }).project_id;
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, photographer_id")
      .eq("id", projectId)
      .limit(1)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: updateError } = await admin
      .from("photos")
      .update({ memo: memoToSave })
      .eq("id", photoId);

    if (updateError) {
      console.error("[PATCH photo memo]", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, memo: memoToSave });
  } catch (e) {
    console.error("[PATCH photo memo]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

