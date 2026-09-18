import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import "./beta.css";

/** 베타 경로에만 라이트 토큰을 적용해 기존 작가·고객 작업 화면에 영향을 주지 않는다. */
export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return <div className="beta-light">
    <header className="beta-header"><BrandLogoBar href="/" variant="customerEntry"/><Link href="/" prefetch={false}><ArrowLeft size={14}/>홈으로</Link></header>
    <main className="beta-main">{children}</main>
    <footer className="beta-footer">사진에 집중할 수 있도록. <span>A-CUT</span> · <Link href="/terms">이용약관</Link> · <Link href="/privacy">개인정보처리방침</Link></footer>
  </div>;
}
