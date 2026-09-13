import { ProjectAssetsDataProvider } from "@/components/photographer/ProjectAssetsDataProvider";
import { CollapsibleAssetHeaderProvider } from "@/hooks/useCollapsibleAssetHeader";
import { ProjectAssetsRoutePanels } from "./ProjectAssetsRoutePanels";

export default async function ProjectAssetsLayout({
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <link
        rel="stylesheet"
        as="style"
        crossOrigin=""
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
      />
      <ProjectAssetsDataProvider key={id} projectId={id}>
        <CollapsibleAssetHeaderProvider compactOnly>
          <ProjectAssetsRoutePanels />
        </CollapsibleAssetHeaderProvider>
      </ProjectAssetsDataProvider>
    </>
  );
}
