"use client";

import { SelectionProvider } from "@/contexts/SelectionContext";
import { ReviewProvider } from "@/contexts/ReviewContext";

export default function CustomerLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SelectionProvider>
      <ReviewProvider>{children}</ReviewProvider>
    </SelectionProvider>
  );
}
