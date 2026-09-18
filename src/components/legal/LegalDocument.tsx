import Link from "next/link";
import { BrandLogoBar } from "@/components/BrandLogo";

export function LegalDocument({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#fafbf9] text-[#191918] [color-scheme:light]">
      <header className="border-b border-[#e5e7e3] bg-white">
        <div className="mx-auto flex min-h-20 w-[min(1120px,calc(100%-40px))] items-center justify-between">
          <BrandLogoBar href="/" variant="customerEntry" />
          <Link className="text-sm text-[#666864] hover:text-[#bd3900]" href="/">홈으로</Link>
        </div>
      </header>
      <main className="mx-auto w-[min(760px,calc(100%-40px))] py-14 sm:py-20">
        <header className="mb-12 border-b border-[#dededb] pb-8">
          <p className="mb-3 text-sm font-semibold text-[#d94100]">A-CUT</p>
          <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{title}</h1>
          <p className="mt-4 text-sm text-[#666864]">시행일: {effectiveDate}</p>
        </header>
        <article className="space-y-10 text-[15px] leading-7 text-[#3f413d] [&_a]:text-[#bd3900] [&_a]:underline [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-[-0.025em] [&_h2]:text-[#191918] [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_table]:w-full [&_table]:min-w-[620px] [&_td]:border [&_td]:border-[#dededb] [&_td]:p-3 [&_td]:align-top [&_th]:border [&_th]:border-[#dededb] [&_th]:bg-[#f1f3ef] [&_th]:p-3 [&_th]:text-left [&_th]:font-semibold [&_th]:text-[#191918]">
          {children}
        </article>
      </main>
      <footer className="border-t border-[#e5e7e3] bg-white px-5 py-7 text-center text-xs text-[#777c72]">
        <nav className="mb-2 flex justify-center gap-4" aria-label="법적 고지">
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보처리방침</Link>
        </nav>
        © {new Date().getFullYear()} A-CUT · 순한설기
      </footer>
    </div>
  );
}
