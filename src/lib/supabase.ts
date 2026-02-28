/**
 * 클라이언트 전용. Server Components / Route Handler에서는 @/lib/supabase/server 의 createClient 사용.
 */
export { createClient } from "./supabase/client";

import { createClient } from "./supabase/client";

export const supabase = createClient();
