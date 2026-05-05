import type { Metadata } from "next";
import "./landing.css";

export const metadata: Metadata = {
  title: "A-CUT | 셀렉·보정을 한 곳에서",
  description:
    "사진 셀렉, 이제 링크 하나로 끝냅니다. 작가는 업로드만, 고객은 클릭만.",
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
