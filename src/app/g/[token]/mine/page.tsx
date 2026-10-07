import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { deviceHash, getGuestAlbumByToken, listGuestMedia, readGuestDeviceKey } from "@/lib/guest-album-server";
import { countMedia, mediaSummary } from "@/lib/guest-album";
import { GuestMediaGrid } from "@/components/guest-album/GuestAlbumParts";

export const dynamic = "force-dynamic";

/**
 * 하객의 '내가 보낸 사진'. 이 브라우저의 식별 쿠키로 서버가 그 하객의 파일만 조회한다
 * (다른 기기·브라우저에서는 보이지 않는다 — 본인 전용 링크는 만들지 않기로 함).
 */
export default async function GuestMinePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const album = await getGuestAlbumByToken(token);
  if (!album) {
    return <main className="flex flex-1 items-center justify-center px-6 py-16 text-center text-[15px] text-muted-foreground">앨범을 찾을 수 없어요.</main>;
  }
  const deviceKey = await readGuestDeviceKey();
  const { media } = deviceKey ? await listGuestMedia(album.id, deviceHash(album.id, deviceKey)) : { media: [] };

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pb-12 pt-4">
      <Link href={`/g/${token}`} className="-ml-1 inline-flex items-center gap-1 self-start py-2 text-[14px] font-semibold text-muted-foreground"><ChevronLeft size={18} />{album.closed_at ? album.name : "사진 보내기"}</Link>
      <header>
        <h1 className="text-[22px] font-bold tracking-[-0.03em]">내가 보낸 사진</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">이 휴대폰에서 보낸 사진과 영상만 보여요.</p>
      </header>
      {media.length === 0 ? (
        <p className="py-12 text-center text-[14px] leading-6 text-muted-foreground">아직 보낸 사진이 없어요.<br />다른 휴대폰이나 브라우저에서 보냈다면 그곳에서 확인해 주세요.</p>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">{mediaSummary(countMedia(media))}</p>
          <GuestMediaGrid media={media} showUploader={false} />
        </>
      )}
    </main>
  );
}
