import { NextResponse } from "next/server";
import { getAppSettings } from "@/lib/app-settings";

/** GET: 현재 유효한 이용 한도 값(민감 정보 아님, 인증 불필요) — 대시보드/업로드 등 표시용 화면이 사용. */
export async function GET() {
  const settings = await getAppSettings();
  return NextResponse.json(settings);
}
