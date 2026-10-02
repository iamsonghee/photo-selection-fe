import { cookies } from "next/headers";
import { BrandLogoBar } from "@/components/BrandLogo";
import { customerResultCookieName, verifyCustomerResultToken } from "@/lib/customer-select-result-auth";
import { toPhoto } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import theme from "@/styles/AcutLightTheme.module.css";
import ResultViewer from "./ResultViewer";

export const dynamic = "force-dynamic";

function MessagePage({ title, description }: { title: string; description: string }) {
  return (
    <div className={`${theme.lightTheme} min-h-dvh bg-background text-foreground`}>
      <header className="border-b border-border-subtle bg-white"><div className="mx-auto flex h-16 max-w-[1504px] items-center px-5 md:px-8"><BrandLogoBar size="sm" href="/" /></div></header>
      <main className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-lg flex-col items-center justify-center px-5 text-center md:px-8">
        <h1 className="text-2xl font-bold tracking-[-0.04em]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
      </main>
    </div>
  );
}

export default async function CustomerResultPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const token = (await cookies()).get(customerResultCookieName(projectId))?.value ?? "";
  if (!verifyCustomerResultToken(projectId, token)) {
    return <MessagePage title="결과 링크를 확인해주세요" description="작업을 의뢰한 고객에게 받은 결과 링크로 다시 접속해주세요." />;
  }

  const admin = getAdminClient();
  const { data: project } = await admin.from("customer_projects")
    .select("id, name, target_count")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return <MessagePage title="결과를 찾을 수 없어요" description="프로젝트가 삭제되었거나 사용할 수 없는 링크입니다." />;

  const { data: selections, error: selectionError } = await admin.from("customer_selections")
    .select("photo_id, comment")
    .eq("project_id", projectId)
    .eq("is_selected", true);
  const photoIds = (selections ?? []).map((row) => row.photo_id);
  if (selectionError || photoIds.length === 0) return <MessagePage title="선택된 사진이 없어요" description="고객에게 선택 결과를 다시 확인해달라고 요청해주세요." />;

  const photosResult = await admin.from("customer_photos").select("id, filename, order_index, thumb_url, preview_url, similarity_group_id").eq("project_id", projectId).in("id", photoIds);
  if (photosResult.error) {
    return <MessagePage title="결과를 불러오지 못했어요" description="잠시 후 다시 시도해주세요." />;
  }

  const comments = Object.fromEntries((selections ?? []).filter((row) => row.comment?.trim()).map((row) => [row.photo_id, { comment: row.comment!.trim() }]));
  const photos = (photosResult.data ?? []).sort((a, b) => a.order_index - b.order_index).map((row) => toPhoto(row, projectId));

  return (
    <div className={theme.lightTheme} data-acut-light-canvas>
      <ResultViewer
        project={{ name: project.name, target: project.target_count }}
        photos={photos}
        comments={comments}
      />
    </div>
  );
}
