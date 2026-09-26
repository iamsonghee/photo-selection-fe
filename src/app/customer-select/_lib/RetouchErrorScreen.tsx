import Link from "next/link";
import { CustomerSelectShell } from "./CustomerSelectShell";

export function RetouchErrorScreen({ message }: { message: string }) {
  return <CustomerSelectShell navigation={false}>
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-xl font-bold text-foreground">보정본 화면을 열 수 없어요</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground" role="alert">{message}</p>
      <Link href="/customer-select" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-foreground px-5 text-sm font-bold text-background">내 프로젝트로 돌아가기</Link>
    </main>
  </CustomerSelectShell>;
}
