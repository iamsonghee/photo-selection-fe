import type { Metadata } from "next";
import "./landing.css";

export const metadata: Metadata = {
  title: "A-CUT | 고객의 사진 셀렉부터 보정본 확정까지",
  description:
    "사진작가를 위한 고객 셀렉·보정 피드백 관리. 함께 찜하고 AI 유사컷을 비교하며, 선택 결과부터 보정본 확정까지 한곳에서 관리하세요.",
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
