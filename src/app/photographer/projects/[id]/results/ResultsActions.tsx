"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui";

export function ResultsActions() {
  return (
    <Button
      variant="outline"
      className="flex items-center gap-2"
      onClick={() => console.log("다운로드")}
    >
      <Download className="h-4 w-4" />
      다운로드
    </Button>
  );
}
