import type { Metadata } from "next";
import "./landing.css";

export const metadata: Metadata = {
  title: "A-CUT | 미래형 사진 셀렉 플랫폼",
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
