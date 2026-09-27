import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { CustomerSelectShell } from "../_lib/CustomerSelectShell";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightLinkButton } from "@/components/photographer/PhotographerLightButton";
import { customerProjectAction, customerProjectDestination, customerProjectStatus, type CustomerProjectSummary } from "../_lib/project-routing";
import { isProjectShootType, projectShootTypeLabel } from "@/lib/project-shoot-types";
import { CustomerShareLinkField } from "../_lib/CustomerShareLinkField";

const PARTICIPANT_COLORS: Record<string, string> = {
  red: "bg-red-500",
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  purple: "bg-violet-500",
};

export default async function CustomerProjectOverview({ params }: { params: Promise<{ projectId: string }> }) {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) redirect("/customer-select/login");
  const { projectId } = await params;
  const admin = getAdminClient();
  const { data, error } = await admin.from("customer_projects")
    .select("id, name, shoot_type, shoot_date, selection_deadline, studio_name, photographer_name, shoot_region, shoot_location, target_count, photo_count, share_token, sharing_enabled, exported, delivery_count, last_delivered_at, retouch_done, created_at")
    .eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error("프로젝트 현황을 불러오지 못했어요.");
  if (!data) notFound();
  const project = data as CustomerProjectSummary & { share_token: string };
  const sharingEnabled = Boolean(data.sharing_enabled);
  const [selectionResult, participantResult] = await Promise.all([
    admin.from("customer_selections").select("photo_id", { count: "exact", head: true }).eq("project_id", projectId).eq("is_selected", true),
    admin.from("customer_project_participants").select("color, nickname, done").eq("project_id", projectId).order("created_at", { ascending: true }),
  ]);
  const selectedCount = selectionResult.error ? null : selectionResult.count ?? 0;
  const participants = participantResult.error ? [] : participantResult.data ?? [];
  const action = customerProjectAction(project, selectedCount);
  const nextStep = project.retouch_done
    ? "모든 보정 확인이 완료됐어요."
    : project.photo_count === 0
        ? "사진을 올리면 바로 선택을 시작할 수 있어요."
        : selectedCount
          ? "고르던 위치부터 사진 선택을 이어가세요."
          : "사진 업로드가 끝났어요. 이제 전달할 사진을 골라주세요.";
  const selectionProgress = selectedCount === null || project.target_count <= 0 ? 0 : Math.min(100, Math.round((selectedCount / project.target_count) * 100));
  const info = [
    ["촬영 종류", isProjectShootType(project.shoot_type) ? projectShootTypeLabel(project.shoot_type) : null],
    ["촬영일", project.shoot_date],
    ["선택 마감일", project.selection_deadline],
    ["스튜디오·업체", project.studio_name],
    ["담당 작가", project.photographer_name],
    ["촬영 지역", project.shoot_region],
    ["촬영 장소", project.shoot_location],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return <CustomerSelectShell navigation={false}>
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 py-8 md:px-8 md:py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="min-w-0 break-words text-2xl font-bold md:text-3xl">{project.name}</h1>
        <Link href={`/customer-select/${projectId}/settings`} aria-label="프로젝트 수정" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><Pencil size={15} aria-hidden /><span className="hidden sm:inline">프로젝트 </span>수정</Link>
      </div>
      <section className="mt-6 rounded-2xl border border-border-subtle bg-surface p-5 md:p-7" aria-label="프로젝트 진행 현황">
        <p className="text-sm font-bold text-accent">{customerProjectStatus(project, selectedCount)}</p>
        <h2 className="mt-2 text-lg font-bold tracking-[-0.02em] md:text-xl">{nextStep}</h2>

        <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle">
          <div className="bg-surface-raised px-4 py-4">
            <dt className="text-xs text-muted-foreground">올린 사진</dt>
            <dd className="mt-1 text-lg font-bold">{project.photo_count.toLocaleString()}장</dd>
            {project.photo_count > 0 ? <Link href={`/customer-select/${projectId}/upload`} className="mt-2 inline-flex text-xs font-semibold text-accent">올린 사진 보기 →</Link> : null}
          </div>
          <div className="bg-surface-raised px-4 py-4"><dt className="text-xs text-muted-foreground">최종 선택</dt><dd className="mt-1 text-lg font-bold">{selectedCount === null ? "확인 불가" : `${selectedCount.toLocaleString()}장`}</dd></div>
          <div className="bg-surface-raised px-4 py-4"><dt className="text-xs text-muted-foreground">보정 목표</dt><dd className="mt-1 text-lg font-bold">{project.target_count.toLocaleString()}장</dd></div>
        </dl>

        {!project.retouch_done && project.photo_count > 0 && selectedCount !== null ? <div className="mt-5">
          <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>선택 현황</span>
            <span>{selectedCount.toLocaleString()} / {project.target_count.toLocaleString()}장</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-subtle" role="progressbar" aria-label="선택 현황" aria-valuemin={0} aria-valuemax={project.target_count} aria-valuenow={Math.min(selectedCount, project.target_count)}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${selectionProgress}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">목표 장수는 안내 기준이며, 선택 장수가 달라도 전달할 수 있어요.</p>
        </div> : null}
      </section>

      <section className="mt-5 rounded-2xl border border-border-subtle bg-surface p-5 md:p-6" aria-labelledby="sharing-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="sharing-title" className="font-bold">함께 고르기</h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">가족이나 친구에게 링크를 보내 함께 사진을 골라보세요.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold ${sharingEnabled ? "text-emerald-700" : "text-muted-foreground"}`}>{sharingEnabled ? `공유 중 · 참여자 ${participants.length}/5명` : "공유 중지"}</span>
            <Link href={`/customer-select/${projectId}/settings#sharing`} className="text-xs font-semibold text-accent">링크 설정</Link>
          </div>
        </div>

        {sharingEnabled ? <div className="mt-4"><CustomerShareLinkField projectId={projectId} token={project.share_token} allowShare /></div> : <div className="mt-4 rounded-xl bg-surface-raised px-4 py-3 text-[13px] text-muted-foreground">초대 링크가 중지되어 있어요. 링크 설정에서 다시 사용할 수 있습니다.</div>}

        <div className="mt-4 flex min-h-8 flex-wrap items-center gap-2" aria-label="참여자 목록">
          {participants.length > 0 ? participants.map((participant) => <span key={participant.color} className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised px-3 py-1.5 text-xs font-semibold text-foreground">
            <span className={`size-2 rounded-full ${PARTICIPANT_COLORS[participant.color] ?? "bg-muted-foreground"}`} aria-hidden="true" />
            {participant.nickname}
            {participant.done ? <span className="text-primary">완료</span> : null}
          </span>) : <p className="text-xs text-muted-foreground">아직 참여한 사람이 없어요.</p>}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-border-subtle bg-surface p-5 md:p-6" aria-labelledby="shoot-info-title">
        <div className="flex items-center justify-between gap-4">
          <h2 id="shoot-info-title" className="font-bold">촬영 정보</h2>
          <Link href={`/customer-select/${projectId}/settings`} className="text-sm font-semibold text-accent">{info.length === 1 ? "정보 추가" : "수정"}</Link>
        </div>
        <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 md:grid-cols-3">
          {info.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}
        </dl>
      </section>
    </main>
    <PhotographerPageActionBar
      maxWidth={1120}
      mobileFixed
      leading={<div><p className="text-sm font-semibold">{project.photo_count.toLocaleString()}장 중 {selectedCount === null ? "선택 수 확인 불가" : `${selectedCount.toLocaleString()}장 선택`}</p><p className="mt-1 text-xs text-muted-foreground">목표 {project.target_count.toLocaleString()}장</p></div>}
      actions={<PhotographerLightLinkButton href={customerProjectDestination(project)} className="w-full sm:w-auto">{action}</PhotographerLightLinkButton>}
    />
  </CustomerSelectShell>;
}
