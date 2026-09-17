import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { canTransition, getTransitionErrorMessage } from "@/lib/project-status";
import { SHOOT_TYPES } from "@/lib/project-shoot-types";
import type { ProjectStatus } from "@/types";

const VALID_SHOOT_TYPES = new Set(SHOOT_TYPES.map((t) => t.value));

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

    // 삭제로 사진/개인정보가 사라지기 전에 비식별 통계 스냅샷을 남긴다. 실패해도 삭제 자체는 막지 않는다.
    try {
      const { error: summaryError } = await admin.rpc("record_project_deletion_summary", {
        p_project_id: id,
      });
      if (summaryError) {
        console.warn("[DELETE projects] deletion summary capture failed (continuing):", summaryError);
      }
    } catch (e) {
      console.warn("[DELETE projects] deletion summary capture failed (continuing):", e);
    }

    const backendUrl = process.env.BACKEND_URL ?? process.env.API_URL ?? "http://localhost:8000";
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
      .select("id, photographer_id, photo_count, status, include_original, access_pin")
      .eq("id", id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = { updated_at: now };
    if (typeof body.name === "string") payload.name = body.name;
    if (typeof body.customer_name === "string") payload.customer_name = body.customer_name;
    if (typeof body.shoot_date === "string") payload.shoot_date = body.shoot_date;
    if (typeof body.deadline === "string") payload.deadline = body.deadline;
    if (typeof body.required_count === "number") {
      const photoCount = (project as { photo_count: number | null }).photo_count ?? 0;
      const projectStatus = (project as { status: string }).status;
      // preparing 상태에서는 아직 업로드 전이므로 셀렉수를 자유롭게 설정 가능
      if (projectStatus !== "preparing" && photoCount < body.required_count) {
        return NextResponse.json(
          { error: `업로드 수(${photoCount}장) 이상으로 셀렉 수를 설정할 수 없습니다.` },
          { status: 400 }
        );
      }
      payload.required_count = body.required_count;
    }
    if ('access_pin' in body) {
      const nextAccessPin = body.access_pin;
      if (nextAccessPin !== null && !(typeof nextAccessPin === 'string' && /^\d{4}$/.test(nextAccessPin))) {
        return NextResponse.json(
          { error: '고객 비밀번호는 숫자 4자리이거나 비밀번호 없음이어야 합니다.' },
          { status: 400 }
        );
      }
      const projectStatus = (project as { status: string }).status;
      const currentAccessPin = (project as { access_pin: string | null }).access_pin;
      if (projectStatus === 'delivered' && nextAccessPin !== currentAccessPin) {
        return NextResponse.json(
          { error: '납품 완료 후에는 고객 비밀번호를 변경할 수 없습니다.' },
          { status: 400 }
        );
      }
      if (nextAccessPin !== currentAccessPin) payload.access_pin = nextAccessPin;
    }
    if (typeof body.max_revision_count === 'number' && [0, 1, 2].includes(body.max_revision_count)) {
      payload.max_revision_count = body.max_revision_count;
    }
    if ('include_original' in body && typeof body.include_original === 'boolean') {
      const photoCount = (project as { photo_count: number | null }).photo_count ?? 0;
      const projectStatus = (project as { status: string }).status;
      const currentIncludeOriginal = (project as { include_original: boolean }).include_original;
      if ((projectStatus !== 'preparing' || photoCount > 0) && body.include_original !== currentIncludeOriginal) {
        return NextResponse.json(
          { error: '업로드된 사진이 있거나 preparing 상태가 아니면 납품 설정을 변경할 수 없습니다.' },
          { status: 400 }
        );
      }
      if (body.include_original !== currentIncludeOriginal) payload.include_original = body.include_original;
    }
    if ('review_deadline' in body) {
      payload.review_deadline = body.review_deadline ?? null;
    }
    if ("cover_photo_id" in body) {
      if (body.cover_photo_id !== null && typeof body.cover_photo_id !== "string") {
        return NextResponse.json({ error: "대표 사진 값이 올바르지 않습니다." }, { status: 400 });
      }
      if (body.cover_photo_id) {
        const { data: coverPhoto, error: coverPhotoError } = await admin
          .from("photos")
          .select("id")
          .eq("id", body.cover_photo_id)
          .eq("project_id", id)
          .maybeSingle();
        if (coverPhotoError || !coverPhoto) {
          return NextResponse.json({ error: "이 프로젝트의 사진만 대표 사진으로 설정할 수 있습니다." }, { status: 400 });
        }
        payload.cover_photo_id = body.cover_photo_id;
      } else if (body.cover_photo_id === null) {
        payload.cover_photo_id = null;
      }
    }
    if ('customer_phone' in body) {
      payload.customer_phone = body.customer_phone ?? null;
    }
    if ("location" in body) {
      payload.location = typeof body.location === "string" && body.location.trim()
        ? body.location.trim()
        : null;
    }
    if ("shoot_type" in body) {
      if (body.shoot_type === null) {
        payload.shoot_type = null;
      } else if (
        typeof body.shoot_type === "string" &&
        VALID_SHOOT_TYPES.has(body.shoot_type)
      ) {
        payload.shoot_type = body.shoot_type;
      }
    }
    if (typeof body.status === "string" && body.status) {
      const currentStatus = (project as { status: string }).status as ProjectStatus;
      if (!canTransition(currentStatus, body.status as ProjectStatus)) {
        return NextResponse.json(
          {
            error: getTransitionErrorMessage(currentStatus, body.status as ProjectStatus),
            code: "INVALID_STATUS_TRANSITION",
            currentStatus,
          },
          { status: 400 }
        );
      }
      payload.status = body.status;
      if (body.status === "delivered") payload.delivered_at = now;
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
