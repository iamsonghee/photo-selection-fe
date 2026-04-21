import type { ReactNode } from "react";

export default function WorkflowLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        as="style"
        crossOrigin=""
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
      />
      {children}
    </>
  );
}
