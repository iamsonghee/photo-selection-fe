import { CustomerSelectShell } from "../_lib/CustomerSelectShell";
import { ProjectBodySkeleton } from "../_lib/ProjectBodySkeleton";

export default function GuestAlbumLoading() {
  return <CustomerSelectShell><ProjectBodySkeleton variant="cards" label="하객 앨범을 불러오고 있어요" /></CustomerSelectShell>;
}
