import type { Metadata } from "next";
import "../c/[token]/customer-shell.css";
import "./customer-select.css";
import { CustomerSelectDraftProvider } from "@/contexts/CustomerSelectDraftContext";

export const metadata: Metadata = {
  title: "A-CUT Select — 내 사진 직접 고르기",
  description: "수천 장의 본식 사진을 장면과 유사컷으로 정리해 직접 고르는 셀렉 서비스",
};

export default function CustomerSelectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="customer-app-shell customer-light-shell customer-select-app min-h-screen">
      <CustomerSelectDraftProvider>{children}</CustomerSelectDraftProvider>
    </div>
  );
}
