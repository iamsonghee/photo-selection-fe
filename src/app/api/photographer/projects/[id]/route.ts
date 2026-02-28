import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProject } from "@/lib/db";

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
