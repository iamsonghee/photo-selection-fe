"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, FolderOpen, Link2, MousePointer } from "lucide-react";
import { Button, Card, ProgressBar } from "@/components/ui";
import { mockProjects } from "@/lib/mock-data";

export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const project = mockProjects.find((p) => p.id === id);

  const [fileCount, setFileCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  if (!project) return null;

  const M = project.photoCount;
  const N = project.requiredCount;
  const status = M < N ? "insufficient" : M === N ? "ready" : "excess";

  const handleUploadStart = () => {
    setUploading(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          router.push(`/photographer/projects/${id}/settings`);
          return 100;
        }
        return p + 10;
      });
    }, 300);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">사진 업로드</h1>
        <Link href={`/photographer/projects/${id}/settings`}>
          <Button variant="ghost">설정으로</Button>
        </Link>
      </div>

      <Card
        className={`
        p-5
        ${status === "insufficient" ? "border-danger/50 bg-danger/5" : ""}
        ${status === "ready" ? "border-success/50 bg-success/5" : ""}
        ${status === "excess" ? "border-primary/50 bg-primary/5" : ""}
      `}
      >
        {status === "insufficient" && (
          <p className="font-medium text-danger">
            아직 부족합니다 (현재 {M}장 / 필요 {N}장)
          </p>
        )}
        {status === "ready" && (
          <p className="font-medium text-success">✅ 준비 완료</p>
        )}
        {status === "excess" && (
          <p className="font-medium text-[#4f7eff]">
            {N}장 초과 업로드됨 (총 {M}장)
          </p>
        )}
        <p className="mt-1 text-sm text-zinc-400">M = {M}장, N = {N}장</p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card
          className="flex cursor-pointer flex-col items-center justify-center gap-3 py-8 transition-colors hover:border-zinc-600"
          onClick={() => setFileCount((c) => c + 5)}
        >
          <FolderOpen className="h-10 w-10 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">📂 로컬 폴더에서 선택</span>
        </Card>
        <Card
          className="flex cursor-pointer flex-col items-center justify-center gap-3 py-8 transition-colors hover:border-zinc-600"
          onClick={() => setFileCount((c) => c + 3)}
        >
          <Link2 className="h-10 w-10 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">🔗 Google Drive에서 선택</span>
        </Card>
        <Card
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-600 py-8 transition-colors hover:border-zinc-500"
          onClick={() => setFileCount((c) => c + 2)}
        >
          <MousePointer className="h-10 w-10 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">🖱️ 드래그 & 드롭</span>
        </Card>
      </div>

      <Card>
        <p className="text-sm text-zinc-400">선택된 파일: {fileCount}개</p>
        <Button
          variant="primary"
          className="mt-4 flex items-center gap-2"
          disabled={uploading}
          onClick={handleUploadStart}
        >
          <Upload className="h-4 w-4" />
          업로드 시작
        </Button>
        {(uploading || progress > 0) && (
          <div className="mt-4">
            <ProgressBar value={progress} max={100} showLabel />
          </div>
        )}
      </Card>
    </div>
  );
}
