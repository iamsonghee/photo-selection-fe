import { redirect } from "next/navigation";
import { resolvePostLoginPath } from "@/lib/post-login-redirect";

export default async function CustomerSelectLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  redirect(`/login?next=${encodeURIComponent(resolvePostLoginPath(typeof next === "string" ? next : "/app/select"))}`);
}
