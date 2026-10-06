import { notFound, redirect } from "next/navigation";
import { getAdminClient } from "@/lib/supabase-admin";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { EditCustomerProjectForm } from "../../_lib/EditCustomerProjectForm";

export default async function CustomerProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) redirect("/customer-select/login");
  const { projectId } = await params;
  const { data: project } = await getAdminClient().from("customer_projects").select("id, name, shoot_type, target_count, shoot_date, selection_deadline, studio_name, photographer_name, shoot_region, shoot_location, photo_count, share_token, sharing_enabled").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (!project) notFound();
  // 셸·헤더는 [projectId] 레이아웃이 그린다.
  return <EditCustomerProjectForm project={project} />;
}
