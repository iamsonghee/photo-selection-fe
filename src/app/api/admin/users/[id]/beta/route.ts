import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getAdminClient } from "@/lib/supabase-admin";
import { getAppSettings } from "@/lib/app-settings";
import type { AuditAction } from "@/lib/admin-db";

const STATUSES = ["not_invited", "active", "ended", "suspended"] as const;
type Status = (typeof STATUSES)[number];

/** PATCH /api/admin/users/[id]/beta — 베타 상태/기간/메모 변경 + 감사 로그 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAdminUser();
  if (auth.status !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  let { beta_start_date: nextStart, beta_end_date: nextEnd } = body ?? {};
  const { beta_status: nextStatus, admin_note: nextNote } = body ?? {};

  if (nextStatus !== undefined && !STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: "invalid beta_status" }, { status: 400 });
  }

  // 날짜 없이 상태만 "active"로 보내는 요청(예: 베타 신청 승인 화면의 "베타 부여" 버튼)은
  // 기간을 지정할 의도가 없었던 것이므로, app_settings의 기본 베타 기간만큼 자동으로 채운다.
  // 날짜를 명시적으로 보낸 요청(관리자 상세의 수동 기간 설정)은 그대로 존중한다.
  if (nextStatus === "active" && nextStart === undefined && nextEnd === undefined) {
    const settings = await getAppSettings();
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + settings.betaDefaultDurationDays);
    const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
    nextStart = toIsoDate(today);
    nextEnd = toIsoDate(endDate);
  }

  const admin = getAdminClient();
  const { data: before, error: fetchError } = await admin
    .from("photographers")
    .select("beta_status, beta_start_date, beta_end_date, admin_note")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !before) {
    return NextResponse.json({ error: "Photographer not found" }, { status: 404 });
  }

  const payload: Record<string, unknown> = {};
  if (nextStatus !== undefined) payload.beta_status = nextStatus;
  if (nextStart !== undefined) payload.beta_start_date = nextStart || null;
  if (nextEnd !== undefined) payload.beta_end_date = nextEnd || null;
  if (nextNote !== undefined) payload.admin_note = nextNote || null;

  const { error: updateError } = await admin.from("photographers").update(payload).eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 변경 내용에 따라 감사 로그 기록 (메모만 바뀐 경우는 기록하지 않음)
  const prevStatus = before.beta_status as Status;
  const logs: { action: AuditAction; detail: Record<string, unknown> }[] = [];

  if (nextStatus !== undefined && nextStatus !== prevStatus) {
    if (nextStatus === "active") {
      logs.push({ action: "beta_granted", detail: { from: prevStatus, to: nextStatus } });
    } else if (nextStatus === "ended") {
      logs.push({ action: "beta_ended", detail: { from: prevStatus, to: nextStatus } });
    } else if (nextStatus === "suspended") {
      logs.push({ action: "beta_suspended", detail: { from: prevStatus, to: nextStatus } });
    }
  } else if (
    (nextStart !== undefined && nextStart !== before.beta_start_date) ||
    (nextEnd !== undefined && nextEnd !== before.beta_end_date)
  ) {
    logs.push({
      action: "beta_period_changed",
      detail: {
        before: { start: before.beta_start_date, end: before.beta_end_date },
        after: { start: nextStart ?? before.beta_start_date, end: nextEnd ?? before.beta_end_date },
      },
    });
  }

  for (const log of logs) {
    try {
      await admin.from("admin_audit_logs").insert({
        photographer_id: id,
        actor: "admin",
        action: log.action,
        detail: log.detail,
      });
    } catch {
      // 감사 로그 실패는 무시 (본 업데이트는 이미 성공)
    }
  }

  return NextResponse.json({ ok: true });
}
