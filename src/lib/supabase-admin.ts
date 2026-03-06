/**
 * Supabase Admin (Service Role) 클라이언트.
 * 서버 전용 — API Route, Server Components 등에서만 사용.
 * SUPABASE_SERVICE_ROLE_KEY 는 절대 클라이언트에 노출하지 말 것 (NEXT_PUBLIC_ 사용 금지).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getAdminClient() {
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY(와 NEXT_PUBLIC_SUPABASE_URL)가 설정되지 않았습니다. 서버 .env에 추가하세요."
    );
  }
  return createClient(url, serviceRoleKey);
}
