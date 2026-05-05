import type { Metadata } from "next";
import CustomerLayoutClient from "./CustomerLayoutClient";
import "./customer-shell.css";

/** 고객 링크 구간: 루트(작가용) 타이틀을 덮어 브라우저 탭·공유 미리보기를 고객 톤으로 통일 */
export const metadata: Metadata = {
  title: {
    default: "A-CUT | 셀렉·보정을 한 곳에서",
    template: "%s | A-CUT",
  },
  description:
    "갤러리에서 사진을 고르고 확정·보정 요청까지. 링크 하나로 셀렉·보정을 한 곳에서 진행하세요.",
};

export default function CustomerTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CustomerLayoutClient>{children}</CustomerLayoutClient>;
}
