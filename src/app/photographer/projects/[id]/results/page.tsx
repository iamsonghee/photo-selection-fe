import { redirect } from "next/navigation";

export default async function LegacyResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tab = query.tab === "original" ? "original" : "selected";
  redirect(`/photographer/projects/${id}/assets/${tab}`);
}
