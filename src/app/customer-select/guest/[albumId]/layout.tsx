import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getGuestUploadLimits, getOwnedGuestAlbum, listGuestMedia, toGuestAlbumInfo } from "@/lib/guest-album-server";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import { GuestAlbumProvider } from "../_lib/album-store";

export const dynamic = "force-dynamic";

/** 신랑신부의 하객 앨범 화면 공통: 로그인·소유자 확인 후 앨범과 올라온 파일을 읽는다(하위 페이지는 데이터를 따로 읽지 않는다). */
export default async function GuestAlbumLayout({ children, params }: { children: ReactNode; params: Promise<{ albumId: string }> }) {
  const authId = await getCurrentCustomerAuthId();
  if (!authId) redirect("/customer-select/login");
  const { albumId } = await params;
  const row = await getOwnedGuestAlbum(albumId, authId);
  if (!row) redirect("/customer-select");
  const [{ media, guests }, limits] = await Promise.all([listGuestMedia(row.id), getGuestUploadLimits()]);

  return (
    <CustomerSelectShell compactTitle={<strong className="block truncate text-[15px] font-bold">{row.name}</strong>}>
      <GuestAlbumProvider initialAlbum={toGuestAlbumInfo(row)} media={media} guests={guests} limits={limits}>{children}</GuestAlbumProvider>
    </CustomerSelectShell>
  );
}
