import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import InvitePageWrapper from "./InvitePageWrapper";
import { getProjectByToken } from "@/lib/customer-api-server";
import { getAdminClient } from "@/lib/supabase-admin";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) return <InvitePageWrapper />;

  const admin = getAdminClient();
  const project = await getProjectByToken(admin, token);
  const status = project?.status;

  if (status === "delivered") {
    redirect(`/c/${token}/delivered`);
  }

  // PIN 인증 체크
  if (project?.accessPin) {
    const cookieStore = await cookies();
    const verified = cookieStore.get(`pin_verified_${token}`);
    if (!verified) {
      redirect(`/c/${token}/pin`);
    }
  }

  return <InvitePageWrapper />;
}
