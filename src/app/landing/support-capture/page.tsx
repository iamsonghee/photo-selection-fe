import { notFound } from "next/navigation";
import { ProductStoryboard } from "./ProductStoryboard";

export default async function Page({ searchParams }: { searchParams: Promise<{ scene?: string }> }) {
  // 지원 영상용 샘플은 개발 환경에만 노출한다. 실제 고객·운영 데이터는 읽지 않는다.
  if (process.env.NODE_ENV !== "development") notFound();
  const scene = Number((await searchParams).scene ?? 1);
  if (!Number.isInteger(scene) || scene < 1 || scene > 9) notFound();
  return <ProductStoryboard scene={scene} />;
}
