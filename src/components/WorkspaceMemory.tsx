"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LAST_WORKSPACE_KEY, WORKSPACE_SAVE_FAILED_COOKIE, type Workspace } from "@/lib/workspaces";

export function WorkspaceMemory({ workspace }: { workspace: Workspace }) {
  const pathname = usePathname();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let userId: string | undefined;
    function recordFailure(failure: boolean) {
      if (cancelled) return;
      setFailed(failure);
      if (!userId) return;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${WORKSPACE_SAVE_FAILED_COOKIE}_${userId}=${failure ? "1" : ""}; Path=/; Max-Age=${failure ? 2592000 : 0}; SameSite=Lax${secure}`;
    }
    async function remember() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (cancelled || !user || error) return;
        userId = user.id;
        if (user.user_metadata[LAST_WORKSPACE_KEY] === workspace) { recordFailure(false); return; }
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || session?.user.id !== user.id) return;
        const result = await supabase.auth.updateUser({ data: { [LAST_WORKSPACE_KEY]: workspace } });
        recordFailure(Boolean(result.error));
      } catch {
        recordFailure(true);
      }
    }
    void remember();
    return () => { cancelled = true; };
  }, [pathname, workspace]);

  return failed ? <p role="status" className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border border-border bg-surface p-3 text-sm text-foreground md:left-auto md:max-w-sm">마지막 사용 공간을 저장하지 못했어요. 작업은 계속할 수 있어요.</p> : null;
}
