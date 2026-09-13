import { redirect } from "next/navigation";

export default async function LegacyWorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const stage = query.stage === "original" || query.stage === "v1" || query.stage === "v2"
    ? `?stage=${query.stage}`
    : "";
  redirect(`/photographer/projects/${id}/assets/retouched${stage}`);
}
