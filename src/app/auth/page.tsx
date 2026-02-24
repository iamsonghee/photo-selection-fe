"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Camera } from "lucide-react";

export default function AuthPage() {
  const router = useRouter();

  const handleGoogleLogin = () => {
    console.log("Google 로그인 시도");
    router.push("/photographer/dashboard");
  };

  const handleKakaoLogin = () => {
    console.log("카카오 로그인 시도");
    router.push("/photographer/dashboard");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0b0d] px-4">
      <div className="w-full max-w-[440px] text-center">
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-2">
            <Camera className="h-10 w-10 text-[#4f7eff]" />
            <span className="logo-text text-2xl text-white">PhotoSelect</span>
          </div>
        </div>
        <p className="mb-10 text-zinc-400">
          사진작가를 위한 셀렉 워크플로우
        </p>

        <div className="space-y-3">
          <Button
            variant="google"
            size="lg"
            fullWidth
            onClick={handleGoogleLogin}
            className="flex items-center justify-center gap-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google로 계속하기
          </Button>
          <Button
            variant="kakao"
            size="lg"
            fullWidth
            onClick={handleKakaoLogin}
            className="flex items-center justify-center gap-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#3C1E1E">
              <path d="M12 3c5.8 0 10.5 3.66 10.5 8.18 0 4.52-4.7 8.18-10.5 8.18-1.07 0-2.1-.15-3.06-.43l-3.43 1.2-.95-2.9c-1.4-2.5-2.14-5.35-2.14-8.05C1.5 6.66 6.2 3 12 3z" />
            </svg>
            카카오로 계속하기
          </Button>
        </div>

        <p className="mt-6 text-sm text-zinc-500">
          소셜 계정으로 간편하게 시작하세요 · 최초 로그인 시 자동으로 가입됩니다
        </p>

        <footer className="mt-16 flex justify-center gap-6 text-sm text-zinc-500">
          <Link href="#" className="hover:text-zinc-300">
            이용약관
          </Link>
          <Link href="#" className="hover:text-zinc-300">
            개인정보처리방침
          </Link>
        </footer>
      </div>
    </div>
  );
}
