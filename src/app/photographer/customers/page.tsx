import { redirect } from "next/navigation";
import { getPhotographerIdFromSession } from "@/lib/photographer-session-auth";
import { getCustomerList } from "@/lib/photographer-customer-list-server";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  const ownerId = await getPhotographerIdFromSession();
  if (!ownerId) redirect("/");
  // Request-scoped only: never share authenticated customer data across users.
  let initialData = null;
  try { initialData = await getCustomerList(ownerId); }
  catch (error) { console.error("[customers initial list]", error); }
  return <CustomersClient ownerId={ownerId} initialData={initialData} fetchedAt={initialData?.fetchedAt ?? 0} />;
}
