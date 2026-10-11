import Link from "next/link";
import { BrandLogoBar } from "@/components/BrandLogo";
import { PhotographerLightLinkButton } from "@/components/photographer/PhotographerLightButton";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACES, type Workspace } from "@/lib/workspaces";
import theme from "@/styles/AcutLightTheme.module.css";

export async function EntryPage({ space, choose = false, login = false, children }: { space?: Workspace; choose?: boolean; login?: boolean; children?: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const title = login ? "로그인하고 작업을 이어가세요." : choose ? "어떤 작업을 시작할까요?" : space === "studio" ? "원본 전달부터 고객 셀렉, 보정본 검토까지." : space === "select" ? "받은 사진, 한 장면씩 셀렉하세요." : "사진을 고르고, 함께 작업하는 곳.";
  const description = login ? "스튜디오와 내 사진 셀렉을 같은 계정으로 이용해요." : choose ? "같은 계정으로 두 공간을 이용할 수 있어요. 작업 중에도 공간을 바꿀 수 있어요." : space === "studio" ? "고객에게 사진을 전달하고, 셀렉 결과와 보정 요청을 촬영 건마다 관리하세요." : space === "select" ? "작가님께 받은 사진을 직접 올리고, 비슷한 컷을 비교하며 마음에 드는 사진을 골라보세요." : "내 사진을 직접 셀렉하거나, 고객과 사진·보정 요청을 주고받으세요.";
  return <div className={`${theme.lightTheme} flex min-h-dvh flex-col bg-background text-foreground`}>
    <header className="border-b border-border-subtle bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 md:px-8">
        <BrandLogoBar href="/" size="md" />
        <nav aria-label="서비스 메뉴" className="flex flex-wrap items-center gap-2 text-sm sm:gap-5">
          <Link href="/studio" aria-current={space === "studio" ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-lg px-2 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent">스튜디오</Link>
          <Link href="/select" aria-current={space === "select" ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-lg px-2 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent">내 사진 셀렉</Link>
          <PhotographerLightLinkButton href={user ? "/workspaces" : "/login"} variant="outline" size="toolbar">{user ? "내 작업으로 이동" : "로그인"}</PhotographerLightLinkButton>
        </nav>
      </div>
    </header>
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-14 md:px-8 md:py-24">
      <h1 className="max-w-3xl break-keep text-balance text-3xl font-bold leading-tight tracking-tight md:text-5xl">{title}</h1>
      <p className="mt-6 max-w-2xl break-keep text-base leading-7 text-muted-foreground md:text-lg">{description}</p>
      {login ? null : space ? <div className="mt-9"><PhotographerLightLinkButton href={`/login?next=${encodeURIComponent(WORKSPACES[space].path)}`} size="confirmation">{space === "studio" ? "고객 프로젝트 시작하기" : "내 사진 셀렉 시작하기"}</PhotographerLightLinkButton></div> : <div className="mt-12 divide-y divide-border-subtle border-y border-border-subtle">
        {(["studio", "select"] as const).map((key) => <section key={key} className="flex flex-col items-start justify-between gap-5 py-7 sm:flex-row sm:items-center">
          <div><h2 className="text-xl font-semibold">{WORKSPACES[key].label}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{key === "studio" ? "고객 프로젝트와 사진 전달·셀렉·보정 검토를 관리해요." : "받은 사진을 직접 올리고 가족·친구와 함께 셀렉해요."}</p></div>
          <PhotographerLightLinkButton href={choose ? WORKSPACES[key].path : `/${key}`} variant="outline" size="toolbar">{choose ? `${WORKSPACES[key].label} 시작하기` : `${WORKSPACES[key].label} 알아보기`}</PhotographerLightLinkButton>
        </section>)}
      </div>}
      {children}
    </main>
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap gap-6 px-5 py-6 text-sm text-muted-foreground md:px-8"><Link href="/terms" className="underline underline-offset-4">이용약관</Link><Link href="/privacy" className="underline underline-offset-4">개인정보처리방침</Link></footer>
  </div>;
}
