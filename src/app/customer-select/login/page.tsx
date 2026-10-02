import { redirect } from "next/navigation";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { CustomerSelectShell } from "../_lib/CustomerSelectShell";
import { CustomerSelectLoginModal } from "../_lib/CustomerSelectLoginModal";

export default async function CustomerSelectLoginPage() {
  if (await getCurrentCustomerAuthId()) redirect("/customer-select");

  return (
    <CustomerSelectShell navigation={false}>
      <main className="min-h-[calc(100dvh-56px)]" />
      <CustomerSelectLoginModal />
    </CustomerSelectShell>
  );
}
