import { BrandLogoBar } from "@/components/BrandLogo";
import { ProjectBodySkeleton } from "../_lib/ProjectBodySkeleton";
import theme from "@/styles/AcutLightTheme.module.css";

export default function CustomerResultLoading() {
  return <div data-acut-light-canvas className={`${theme.lightTheme} min-h-dvh bg-background`}>
    <header className="flex h-14 items-center border-b border-border-subtle px-5"><BrandLogoBar size="sm" href="/" /></header>
    <ProjectBodySkeleton variant="gallery" label="셀렉 결과를 불러오고 있어요" />
  </div>;
}
