import type { SupabaseClient } from "@supabase/supabase-js";

export type BetaUsageEventType = "signup_completed" | "first_login" | "customer_link_visited";

/**
 * beta_usage_events에 최선의 노력으로(best-effort) 기록한다 — 절대 throw하지 않는다.
 * 작가/프로젝트당 이벤트 타입 1건만 허용하는 유니크 인덱스(migration 참고)가 있어, 이미 기록된
 * 이벤트를 다시 넣으려 하면 23505(unique violation)가 나는데 이는 정상적인 "이미 기록됨" 상황이라
 * 조용히 무시한다. 호출부(가입, 로그인, 고객 링크 접속)는 실패해도 본 기능이 막히면 안 되므로
 * 이 함수는 error를 리턴/throw하지 않는다.
 */
export async function recordBetaUsageEvent(
  admin: SupabaseClient,
  params: {
    eventType: BetaUsageEventType;
    photographerId?: string | null;
    projectId?: string | null;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const { error } = await admin.from("beta_usage_events").insert({
      event_type: params.eventType,
      photographer_id: params.photographerId ?? null,
      project_id: params.projectId ?? null,
      meta: params.meta ?? null,
    });
    if (error && error.code !== "23505") {
      console.error("[beta_usage_events] insert failed", error);
    }
  } catch (e) {
    console.error("[beta_usage_events] insert failed", e);
  }
}
