import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAILS, isAdminEmail } from "@/lib/admin-emails";

export { ADMIN_EMAILS, isAdminEmail };

export type AdminAuthResult =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "ok"; email: string };

/** 서버 컴포넌트/Route Handler 전용. `/admin` 접근 제어와 화면 표시용 이메일 확인에 사용한다. */
export async function getAdminUser(): Promise<AdminAuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "unauthenticated" };
  if (!isAdminEmail(user.email)) return { status: "forbidden" };

  return { status: "ok", email: user.email! };
}
