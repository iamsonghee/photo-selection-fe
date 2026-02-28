import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";

const ACTIONS = ["created", "uploaded", "selecting", "confirmed", "editing"] as const;

export type ProjectLogAction = (typeof ACTIONS)[number];

export interface ProjectLogApiItem {
  id: string;
  projectId: string;
  projectName: string;
  customerName: string;
  action: ProjectLogAction;
  createdAt: string;
}

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

/** GET: 현재 작가의 최근 10건 활동 로그 (project_logs + projects JOIN) */
export async function GET() {
  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("project_logs")
      .select("id, project_id, action, created_at, projects(name, customer_name)")
      .eq("photographer_id", photographerId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("[GET project-logs]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list: ProjectLogApiItem[] = (data ?? []).map((row: Record<string, unknown>) => {
      const projects = row.projects as { name: string; customer_name: string | null } | null;
      return {
        id: row.id as string,
        projectId: row.project_id as string,
        projectName: projects?.name ?? "",
        customerName: projects?.customer_name ?? "",
        action: row.action as ProjectLogAction,
        createdAt: row.created_at as string,
      };
    });

    return NextResponse.json(list);
  } catch (e) {
    console.error("[GET project-logs]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/** POST: 활동 로그 1건 추가 */
export async function POST(req: NextRequest) {
  try {
    const photographerId = await getPhotographerIdFromSession();
    if (!photographerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { project_id: projectId, action } = body;
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json({ error: "project_id required" }, { status: 400 });
    }
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, photographer_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if ((project as { photographer_id: string }).photographer_id !== photographerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: insertError } = await admin.from("project_logs").insert({
      project_id: projectId,
      photographer_id: photographerId,
      action,
    });

    if (insertError) {
      console.error("[POST project-logs]", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.error("[POST project-logs]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
