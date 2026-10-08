import { StatusPage } from "@/components/StatusPage";
import { PhotographerLightLinkButton } from "@/components/photographer/PhotographerLightButton";

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="페이지를 찾을 수 없음"
      description="주소를 다시 확인해 주세요. 받은 링크로 들어왔다면 링크를 보낸 분께 새 링크를 요청해 주세요."
      actions={<PhotographerLightLinkButton href="/">처음으로</PhotographerLightLinkButton>}
    />
  );
}
