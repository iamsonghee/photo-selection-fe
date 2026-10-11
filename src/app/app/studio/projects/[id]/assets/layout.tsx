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
    <ProjectAssetsDataProvider key={id} projectId={id}>
      <CollapsibleAssetHeaderProvider compactOnly>
        <ProjectAssetsRoutePanels />
      </CollapsibleAssetHeaderProvider>
    </ProjectAssetsDataProvider>
  );
}
