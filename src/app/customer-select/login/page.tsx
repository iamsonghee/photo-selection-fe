import { redirect } from "next/navigation";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { CustomerSelectShell } from "../_lib/CustomerSelectShell";
import { CustomerSelectLoginButtons } from "../_lib/CustomerSelectLoginButtons";

export default async function CustomerSelectLoginPage() {
  if (await getCurrentCustomerAuthId()) redirect("/customer-select");

  return (
    <CustomerSelectShell navigation={false}>
      <main className="grid min-h-[calc(100dvh-64px)] place-items-center px-5 py-10">
        <section className="w-full max-w-[460px] rounded-2xl border border-border-subtle bg-surface p-7 shadow-[0_18px_55px_rgba(2,56,82,0.08)] md:p-10">
          <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-accent">Customer Select</span>
          <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.045em]">A-CUT으로<br />내 사진을 고르세요</h1>
          <p className="mt-4 text-[14px] leading-6 text-muted-foreground">촬영본을 올리고 함께 고른 뒤, 파일명과 보정 요청을 한 번에 정리해요.</p>
          <CustomerSelectLoginButtons />
        </section>
      </main>
    </CustomerSelectShell>
  );
}
