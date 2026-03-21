/**
 * DELETE /api/photographer/account
 *
 * 계정 탈퇴 처리:
 * 1. 현재 작가 정보 조회 (프로젝트 수, 가입월)
 * 2. deleted_photographers 테이블에 익명 통계 저장 (개인 식별 정보 없음)
 * 3. photographers 테이블에서 삭제 (cascade로 연관 데이터 삭제)
 * 4. Supabase auth 사용자 삭제
 *
 * 필요한 Supabase SQL (SQL Editor에서 실행):
 *
 * ALTER TABLE public.photographers ADD COLUMN IF NOT EXISTS contact_phone text;
 *
 * CREATE TABLE IF NOT EXISTS public.deleted_photographers (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   deleted_at timestamptz NOT NULL DEFAULT now(),
 *   project_count int4 NOT NULL DEFAULT 0,
 *   join_month text NOT NULL
 * );
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authId = user.id;

    const admin = getAdminClient();

    // 1. 현재 작가 행 조회
    const { data: photographer } = await admin
      .from("photographers")
      .select("id, created_at")
      .eq("auth_id", authId)
      .single();

    if (!photographer) {
      return NextResponse.json({ error: "Photographer not found" }, { status: 404 });
    }

    // 2. 프로젝트 수 조회
    const { count: projectCount } = await admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographer.id);

    // 3. 익명 통계 저장 (가입월만, 개인 식별 정보 없음)
    const joinMonth = photographer.created_at
      ? photographer.created_at.slice(0, 7) // "2026-02"
      : new Date().toISOString().slice(0, 7);

    await admin.from("deleted_photographers").insert({
      deleted_at: new Date().toISOString(),
      project_count: projectCount ?? 0,
      join_month: joinMonth,
    });

    // 4. photographers 테이블에서 삭제 (cascade)
    const { error: deleteError } = await admin
      .from("photographers")
      .delete()
      .eq("auth_id", authId);

    if (deleteError) {
      console.error("[DELETE account] photographers delete error:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 5. Supabase auth 사용자 삭제
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(authId);
    if (authDeleteError) {
      console.error("[DELETE account] auth delete error:", authDeleteError);
      // auth 삭제 실패해도 photographers는 이미 삭제됨 — 진행
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE account]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
