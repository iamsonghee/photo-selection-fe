import { CustomerSelectShell } from "../_lib/CustomerSelectShell";
import { ProjectBodySkeleton } from "../_lib/ProjectBodySkeleton";

export default function CustomerSelectLoginLoading() {
  return <CustomerSelectShell><ProjectBodySkeleton variant="cards" label="로그인 화면을 준비하고 있어요" /></CustomerSelectShell>;
}
