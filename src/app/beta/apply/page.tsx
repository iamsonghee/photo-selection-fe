import { createClient } from "@/lib/supabase/server";
import { BetaApplyForm } from "@/components/beta/BetaApplyForm";

export default async function BetaApplyPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <div>
      <BetaApplyForm prefillEmail={session?.user?.email ?? null} />
    </div>
  );
}
