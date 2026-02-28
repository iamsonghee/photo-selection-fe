import { NextRequest, NextResponse } from "next/server";
import { updateProject } from "@/lib/db";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    const body = await _req.json();
    const patch: Parameters<typeof updateProject>[1] = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.customer_name === "string") patch.customer_name = body.customer_name;
    if (typeof body.shoot_date === "string") patch.shoot_date = body.shoot_date;
    if (typeof body.deadline === "string") patch.deadline = body.deadline;
    if (typeof body.required_count === "number") patch.required_count = body.required_count;
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
