import { CustomerSelectShell } from "../_lib/CustomerSelectShell";
import { ProjectBodySkeleton } from "../_lib/ProjectBodySkeleton";

export default function NewProjectLoading() {
  return <CustomerSelectShell><ProjectBodySkeleton variant="cards" label="새 프로젝트 화면을 준비하고 있어요" /></CustomerSelectShell>;
}
