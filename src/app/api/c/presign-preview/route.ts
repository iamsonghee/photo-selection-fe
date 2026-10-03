import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getPinAuthorizedProject } from "@/lib/customer-auth-server";

/**
 * GET /api/c/presign-preview?token=X&cover=1
 *
 * 초대 첫 화면의 대표 사진 URL(프로젝트 대표 사진, 없으면 첫 사진). 전체 사진 목록보다 먼저 받아 이미지 전송을 일찍 시작한다.
 * 2026-10-03부터 서명 URL이 아니라 공개 주소(img.acut.kr, Cloudflare 캐시)를 그대로 돌려준다 — 버킷이 공개라
 * 서명이 실제로 막아 주는 게 없고 캐시만 못 타서 느렸다. 갤러리 썸네일·뷰어도 사진 정보의 공개 주소를 바로 쓴다.
 * (경로 이름은 기존 클라이언트 호환으로 유지)
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const auth = await getPinAuthorizedProject(req, token);
  if (auth.error) return auth.error;
  if (!auth.project) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  if (req.nextUrl.searchParams.get("cover") !== "1") {
    return NextResponse.json({ error: "cover=1 required" }, { status: 400 });
  }

  try {
    const admin = getAdminClient();
    const coverId = auth.project.coverPhotoId;
    const cover = coverId ? await admin.from("photos").select("r2_preview_url").eq("project_id", auth.project.id).eq("id", coverId).maybeSingle() : null;
    if (cover?.error) throw cover.error;
    let previewUrl = cover?.data?.r2_preview_url;
    if (!previewUrl) {
      const first = await admin.from("photos").select("r2_preview_url").eq("project_id", auth.project.id).order("number").limit(1).maybeSingle();
      if (first.error) throw first.error;
      previewUrl = first.data?.r2_preview_url;
    }
    if (!previewUrl) return NextResponse.json({ error: "No preview URL" }, { status: 404 });
    return NextResponse.json({ url: previewUrl });
  } catch (e) {
    console.error("[presign-preview cover]", e);
    return NextResponse.json({ error: "Cover lookup failed" }, { status: 500 });
  }
}
