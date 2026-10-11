import { redirect } from "next/navigation";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import { NewCustomerProjectForm } from "../../_lib/NewCustomerProjectForm";

export default async function NewCustomerProjectPage() {
  if (!(await getCurrentCustomerAuthId())) redirect("/app/select/login");

  return (
    <CustomerSelectShell>
      <NewCustomerProjectForm />
    </CustomerSelectShell>
  );
}
