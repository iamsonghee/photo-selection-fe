import { getGuestAlbumByToken, getGuestUploadLimits, toGuestAlbumInfo } from "@/lib/guest-album-server";
import { GuestClosedScreen, GuestUploadClient } from "./GuestUploadClient";

export const dynamic = "force-dynamic";

export default async function GuestUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await getGuestAlbumByToken(token);
  if (!row) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-[20px] font-bold">앨범을 찾을 수 없어요</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">QR이나 링크를 다시 확인해 주세요.</p>
      </main>
    );
  }
  const album = toGuestAlbumInfo(row);
  if (album.closed) return <GuestClosedScreen album={album} />;
  return <GuestUploadClient album={album} limits={await getGuestUploadLimits()} />;
}
