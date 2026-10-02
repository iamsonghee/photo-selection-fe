"use client";

import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/AuthModal";
import "./customer-select-auth.css";

/**
 * 셀프 고객 로그인: 운영 랜딩과 같은 로그인 모달(AuthModal + 흰 카드 덮어쓰기)을 그대로 띄운다.
 * 화면을 따로 만들면 운영 모달과 모양이 달라진다. 로그인 후에는 내 프로젝트 목록으로, 닫으면 홈으로 간다.
 */
export function CustomerSelectLoginModal() {
  const router = useRouter();
  return (
    <div className="cs-auth">
      <AuthModal
        isOpen
        onClose={() => router.push("/")}
        redirectPath="/customer-select"
        notice={<><strong>베타 테스트 중</strong><br />웨딩스냅·본식스냅·돌잔치 원본을 올리고<br />가족·친구와 함께 사진을 골라 보세요.<span className="cs-auth-mobile-tip">원본이 많으면 PC에서 올리는 걸 권장해요.</span></>}
      />
    </div>
  );
}
