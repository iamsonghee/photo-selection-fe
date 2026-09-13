import { notFound } from "next/navigation";
import { HeroStoryboard } from "./HeroStoryboard";
import { UploadStoryboard } from "./UploadStoryboard";
import { ReviewStoryboard } from "./ReviewStoryboard";
import { DemoCapture } from "./DemoCapture";

export default async function Page({ searchParams }: { searchParams: Promise<{ storyboard?: string; uploadStoryboard?: string; reviewStoryboard?: string }> }) {
  // 녹화 전용 경로는 로컬 개발 환경에서만 제공한다.
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  if (query.reviewStoryboard === "1") return <ReviewStoryboard />;
  if (query.uploadStoryboard === "1") return <UploadStoryboard />;
  return query.storyboard === "1" ? <HeroStoryboard /> : <DemoCapture />;
}
