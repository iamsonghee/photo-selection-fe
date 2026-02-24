"use client";

import { SelectionProvider } from "@/contexts/SelectionContext";

export default function CustomerLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SelectionProvider>{children}</SelectionProvider>;
}
