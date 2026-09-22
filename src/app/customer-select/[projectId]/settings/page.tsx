import { notFound, redirect } from "next/navigation";
import { getAdminClient } from "@/lib/supabase-admin";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import { EditCustomerProjectForm } from "../../_lib/EditCustomerProjectForm";

export default async function CustomerProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) redirect("/customer-select/login");
  const { projectId } = await params;
  const { data: project } = await getAdminClient().from("customer_projects").select("id, name, shoot_type, target_count, shoot_date, selection_deadline, studio_name, photographer_name, shoot_region, shoot_location, photo_count").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (!project) notFound();
  return <CustomerSelectShell><EditCustomerProjectForm project={project} /></CustomerSelectShell>;
}
