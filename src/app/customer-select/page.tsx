import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderPlus, ImageIcon } from "lucide-react";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { CustomerSelectShell } from "./_lib/CustomerSelectShell";
import { customerProjectDestination, customerProjectStatus, type CustomerProjectSummary } from "./_lib/project-routing";

export default async function CustomerSelectHomePage() {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) redirect("/customer-select/login");

  const { data, error } = await getAdminClient()
    .from("customer_projects")
    .select("id, name, shoot_type, target_count, photo_count, exported, retouch_done, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  const projects = (data ?? []) as CustomerProjectSummary[];

  return (
    <CustomerSelectShell>
      <main className="mx-auto w-full max-w-[1504px] px-5 py-8 md:px-8 md:py-10">
        <h1 className="text-[26px] font-bold tracking-[-0.04em] md:text-[30px]">내 셀렉 프로젝트</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">사진 셀렉부터 보정 요청까지 한곳에서 이어가세요.</p>

        {error ? (
          <div className="mt-8 rounded-xl border border-danger/20 bg-surface p-6 text-[14px] text-danger">프로젝트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</div>
        ) : projects.length === 0 ? (
          <section className="mt-10 flex min-h-[520px] items-center justify-center rounded-2xl border border-border-subtle bg-surface px-6 py-14">
            <div className="flex max-w-[620px] flex-col items-center text-center">
              <div className="grid size-16 place-items-center rounded-2xl bg-surface-raised text-accent"><FolderPlus size={29} strokeWidth={1.8} /></div>
              <h2 className="mt-6 text-[24px] font-bold tracking-[-0.04em]">첫 프로젝트를 만들어보세요</h2>
              <p className="mt-3 text-[14px] leading-6 text-muted-foreground">촬영본을 올리고 함께 고른 뒤, 파일명과 보정 요청을 작가에게 전달할 수 있어요.</p>
              <Link href="/customer-select/new" className="mt-7 rounded-full bg-accent px-6 py-3.5 text-[15px] font-bold text-white hover:bg-[var(--accent-hover)]">새 프로젝트 만들기</Link>
            </div>
          </section>
        ) : (
          <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="프로젝트 목록">
            {projects.map((project) => (
              <Link key={project.id} href={customerProjectDestination(project)} className="group overflow-hidden rounded-2xl border border-border-subtle bg-surface transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_12px_32px_rgba(2,56,82,0.08)]">
                <div className="grid aspect-[16/8] place-items-center bg-surface-raised text-subtle-foreground"><ImageIcon size={34} strokeWidth={1.5} /></div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="min-w-0 truncate text-[17px] font-bold">{project.name}</strong>
                    <span className="shrink-0 rounded-md bg-customer-soft px-2 py-1 text-[11px] font-bold text-primary">{customerProjectStatus(project)}</span>
                  </div>
                  <p className="mt-3 text-[13px] text-muted-foreground">{project.shoot_type ?? "촬영"} · {project.photo_count}장 · 목표 {project.target_count}장</p>
                </div>
              </Link>
            ))}
          </section>
        )}
      </main>
    </CustomerSelectShell>
  );
}
