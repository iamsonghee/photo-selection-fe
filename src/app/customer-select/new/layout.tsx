import { WorkspaceMemory } from "@/components/WorkspaceMemory";

export default function NewProjectLayout({ children }: { children: React.ReactNode }) {
  return <><WorkspaceMemory workspace="select" />{children}</>;
}
