import { redirect } from "next/navigation";
import InvitePageWrapper from "./InvitePageWrapper";
import { getProjectByToken } from "@/lib/customer-api-server";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) return <InvitePageWrapper />;

  const project = await getProjectByToken(token);
  const status = project?.status;

  if (status === "delivered") {
    redirect(`/c/${token}/delivered`);
  }

  return <InvitePageWrapper />;
}
