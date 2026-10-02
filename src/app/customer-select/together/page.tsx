import { redirect } from "next/navigation";

export default function TogetherPage() {
  redirect("/customer-select/select?scene=0&scenes=1&collab=1");
}
