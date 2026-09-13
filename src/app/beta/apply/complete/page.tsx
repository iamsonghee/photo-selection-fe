import { Check } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui";

export default function BetaApplyCompletePage() {
  return (
    <div className="beta-complete-wrap">
      <Card className="beta-form-card beta-complete w-full text-center">
        <div className="beta-complete-icon"><Check size={26} aria-hidden="true"/></div>
        <h1 className="mt-3 text-xl font-semibold text-foreground">신청 완료</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          신청이 정상적으로 접수되었습니다.
          <br />
          검토 후 입력하신 번호로 연락드리겠습니다.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg border border-border-strong text-base font-medium text-foreground transition-colors hover:bg-surface"
        >
          홈으로 돌아가기
        </Link>
      </Card>
    </div>
  );
}
