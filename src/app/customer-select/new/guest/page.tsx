import { redirect } from "next/navigation";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getGuestUploadLimits } from "@/lib/guest-album-server";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import { NewGuestAlbumForm } from "./NewGuestAlbumForm";

export default async function NewGuestAlbumPage() {
  if (!(await getCurrentCustomerAuthId())) redirect("/customer-select/login");
  const { retentionDays } = await getGuestUploadLimits();
  return (
    <CustomerSelectShell>
      <NewGuestAlbumForm retentionDays={retentionDays} />
    </CustomerSelectShell>
  );
}
