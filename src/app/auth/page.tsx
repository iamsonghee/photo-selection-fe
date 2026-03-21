import { Suspense } from "react";
import { AuthContent } from "./AuthContent";

// AuthPage는 Server Component여야 Next.js metadata 스트리밍이 정상 작동함.
// useSearchParams()를 사용하는 AuthContent만 Client Component로 분리.
export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthContent />
    </Suspense>
  );
}
