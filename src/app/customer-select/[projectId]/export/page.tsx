import { redirect } from "next/navigation";

export default async function CustomerExportRedirect({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/customer-select/${projectId}/review`);
}
