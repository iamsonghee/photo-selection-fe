"use client";

import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui";

export function EditProgressActions() {
  return (
    <>
      <Button
        variant="outline"
        className="w-full justify-start gap-2"
        onClick={() => console.log("보정된 사진 다운로드")}
      >
        <Download className="h-4 w-4" />
        보정된 사진 다운로드 (완료분)
      </Button>
      <Button
        variant="outline"
        className="w-full justify-start gap-2"
        onClick={() => console.log("최종 결과물 내보내기")}
      >
        <Download className="h-4 w-4" />
        최종 결과물 내보내기
      </Button>
      <Button
        variant="outline"
        className="w-full justify-start gap-2"
        onClick={() => console.log("Google Drive 업로드")}
      >
        <Upload className="h-4 w-4" />
        Google Drive로 업로드
      </Button>
    </>
  );
}
