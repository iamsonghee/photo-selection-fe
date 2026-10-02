import { redirect } from "next/navigation";

export default async function CustomerSelectComparePage({ searchParams }: {
  searchParams: Promise<{ scene?: string }>;
}) {
  const { scene } = await searchParams;
  const index = Math.min(4, Math.max(0, Math.trunc(Number(scene)) || 0));
  // 이전 비교 주소도 별도 이중 선택 화면 대신 같은 갤러리로 연결한다.
  redirect(`/customer-select/select?scene=${index}`);
}
