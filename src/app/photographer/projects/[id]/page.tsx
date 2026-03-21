"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  MessageCircle,
  Mail,
  QrCode,
  Copy,
  Upload,
  Search,
  Pencil,
} from "lucide-react";
import { Button, Card, CardTitle, Badge, Input, ProgressBar } from "@/components/ui";
import { getProjectById } from "@/lib/db";
import { getStatusLabel } from "@/lib/project-status";
import type { Project, ProjectStatus } from "@/types";

function statusBadgeVariant(s: ProjectStatus): "waiting" | "in_progress" | "completed" {
  if (s === "preparing") return "waiting";
  if (["selecting", "confirmed", "editing", "reviewing_v1", "editing_v2", "reviewing_v2"].includes(s))
    return "in_progress";
  return "completed";
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editShootDate, setEditShootDate] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editRequiredCount, setEditRequiredCount] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPhotoManage, setShowPhotoManage] = useState(false);
  const [photoList, setPhotoList] = useState<{ id: string; r2_thumb_url: string; original_filename: string }[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const p = await getProjectById(id);
        setProject(p);
        if (p) {
          setEditName(p.name);
          setEditCustomerName(p.customerName);
          setEditShootDate(p.shootDate);
          setEditDeadline(p.deadline);
          setEditRequiredCount(p.requiredCount);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleSaveEdit = async () => {
    if (!project) return;
    setSaveError("");
    const newN = editRequiredCount;
    if (newN !== project.requiredCount && project.photoCount < newN) {
      setSaveError(`업로드 수(M=${project.photoCount}) 이상으로 N을 설정해주세요.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          customer_name: editCustomerName,
          shoot_date: editShootDate,
          deadline: editDeadline,
          required_count: editRequiredCount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      setProject({
        ...project,
        name: editName,
        customerName: editCustomerName,
        shootDate: editShootDate,
        deadline: editDeadline,
        requiredCount: editRequiredCount,
      });
      setEditMode(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/c/${project?.accessToken ?? ""}`
      : `/c/${project?.accessToken ?? ""}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
  };

  const loadPhotoList = async () => {
    if (!id) return;
    setLoadingPhotos(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}/photos`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.photos)) setPhotoList(data.photos);
      else setPhotoList([]);
    } catch {
      setPhotoList([]);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const handleTogglePhotoManage = () => {
    if (!showPhotoManage) loadPhotoList();
    setShowPhotoManage((prev) => !prev);
  };

  const handleDeletePhoto = async (photoId: string) => {
    setDeletingPhotoId(photoId);
    try {
      const res = await fetch(`/api/photographer/photos/${photoId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "삭제 실패");
      }
      setPhotoList((prev) => prev.filter((p) => p.id !== photoId));
      setProject((prev) => prev ? { ...prev, photoCount: Math.max(0, prev.photoCount - 1) } : null);
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const handleDeleteAllPhotos = async () => {
    if (!id || !project) return;
    setDeletingAll(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}/photos`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "삭제 실패");
      }
      setPhotoList([]);
      setProject((prev) => prev ? { ...prev, photoCount: 0 } : null);
      setShowDeleteAllModal(false);
      setShowPhotoManage(false);
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingAll(false);
    }
  };

  const N = project?.requiredCount ?? 0;
  const M = project?.photoCount ?? 0;
  const isConfirmedOrEditing =
    ["confirmed", "editing", "reviewing_v1", "editing_v2", "reviewing_v2"].includes(
      project?.status ?? ""
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-zinc-400">로딩 중...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-8">
        <p className="text-zinc-400">프로젝트를 찾을 수 없습니다.</p>
        <Link href="/photographer/dashboard">
          <Button variant="outline">대시보드로</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
          <span className="text-zinc-400">{project.customerName || "(고객명 없음)"}</span>
          <Badge variant={statusBadgeVariant(project.status)}>
            {getStatusLabel(project.status)}
          </Badge>
        </div>
        <div className="flex gap-2">
          {isConfirmedOrEditing && (
            <Link href={`/photographer/projects/${id}/results`}>
              <Button variant="primary" className="flex items-center gap-2">
                결과 검토
              </Button>
            </Link>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left column */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* 프로젝트 정보 카드 */}
          <Card>
            <div className="flex items-start justify-between gap-4">
              <CardTitle className="mb-4">프로젝트 정보</CardTitle>
              {!editMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => setEditMode(true)}
                >
                  <Pencil className="h-4 w-4" />
                  수정
                </Button>
              )}
            </div>
            {editMode ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="프로젝트명"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Input
                    label="고객명"
                    value={editCustomerName}
                    onChange={(e) => setEditCustomerName(e.target.value)}
                  />
                  <Input
                    label="촬영일"
                    type="date"
                    value={editShootDate}
                    onChange={(e) => setEditShootDate(e.target.value)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  />
                  <Input
                    label="셀렉 기한"
                    type="date"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  />
                  <Input
                    label="셀렉 갯수 (N)"
                    type="number"
                    min={1}
                    value={editRequiredCount}
                    onChange={(e) => setEditRequiredCount(Number(e.target.value))}
                    onInput={(e) => {
                      const el = e.currentTarget as HTMLInputElement;
                      if (el.value.startsWith("0") && el.value.length > 1) {
                        el.value = String(parseInt(el.value, 10));
                      }
                    }}
                  />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                      업로드 수 (M)
                    </label>
                    <p className="h-11 px-4 flex items-center rounded-lg bg-zinc-800 text-zinc-400">
                      {M}장
                    </p>
                  </div>
                </div>
                {saveError && (
                  <p className="text-sm text-danger">{saveError}</p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditMode(false)}>
                    취소
                  </Button>
                  <Button variant="primary" onClick={handleSaveEdit} disabled={saving}>
                    {saving ? "저장 중..." : "저장"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <span className="text-zinc-500">프로젝트명</span>
                  <span className="text-zinc-200">{project.name}</span>
                  <span className="text-zinc-500">고객명</span>
                  <span className="text-zinc-200">{project.customerName || "—"}</span>
                  <span className="text-zinc-500">촬영일</span>
                  <span className="text-zinc-200">
                    {format(new Date(project.shootDate), "yyyy-MM-dd")}
                  </span>
                  <span className="text-zinc-500">셀렉 기한</span>
                  <span className="text-zinc-200">
                    {format(new Date(project.deadline), "yyyy-MM-dd")}
                  </span>
                  <span className="text-zinc-500">셀렉 갯수 (N)</span>
                  <span className="text-zinc-200">{N}</span>
                  <span className="text-zinc-500">업로드 수 (M)</span>
                  <span className="text-zinc-200">{M}</span>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs text-zinc-500">업로드 현황</p>
                    {project.status === "preparing" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-zinc-400"
                        onClick={handleTogglePhotoManage}
                      >
                        {showPhotoManage ? "사진 관리 접기" : "사진 관리"}
                      </Button>
                    )}
                  </div>
                  <ProgressBar value={M} max={N} variant={M >= N ? "success" : "default"} showLabel />
                  {project.status === "preparing" && showPhotoManage && (
                    <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                      {loadingPhotos ? (
                        <p className="py-4 text-center text-sm text-zinc-500">로딩 중...</p>
                      ) : photoList.length === 0 ? (
                        <p className="py-4 text-center text-sm text-zinc-500">업로드된 사진이 없습니다.</p>
                      ) : (
                        <>
                          <ul className="space-y-2 max-h-60 overflow-y-auto">
                            {photoList.map((p) => (
                              <li
                                key={p.id}
                                className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/50 p-2"
                              >
                                <img
                                  src={p.r2_thumb_url}
                                  alt=""
                                  className="h-[60px] w-[60px] shrink-0 rounded object-cover"
                                />
                                <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                                  {p.original_filename || "(파일명 없음)"}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="shrink-0 text-danger hover:text-danger"
                                  disabled={deletingPhotoId !== null}
                                  onClick={() => handleDeletePhoto(p.id)}
                                >
                                  {deletingPhotoId === p.id ? "삭제 중…" : "삭제"}
                                </Button>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-3 flex gap-2">
                            <Button
                              variant="danger"
                              size="sm"
                              className="flex-1"
                              disabled={deletingAll}
                              onClick={() => setShowDeleteAllModal(true)}
                            >
                              전체 삭제
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setShowPhotoManage(false)}>
                              목록 닫기
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* 고객 초대 카드 */}
          <Card>
            <CardTitle className="mb-3">고객 초대</CardTitle>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-zinc-300">{project.customerName || "(미입력)"}</span>
              <Badge variant={statusBadgeVariant(project.status)}>
                {getStatusLabel(project.status)}
              </Badge>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                readOnly
                value={inviteUrl}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-300"
              />
              <Button variant="secondary" size="sm" onClick={handleCopyLink} className="flex items-center gap-1">
                <Copy className="h-4 w-4" />
                링크 복사
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                카카오톡
              </Button>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                이메일
              </Button>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                QR코드
              </Button>
            </div>
          </Card>
        </div>

        {/* Right column — 320px */}
        <div className="w-full space-y-6 lg:w-[320px] lg:shrink-0">
          {project.status === "preparing" && (
            <Card>
              <p className="font-medium text-zinc-200">
                {M === 0 ? "📸 사진을 업로드해주세요" : "📸 업로드 현황"}
              </p>
              <div className="mt-3">
                <ProgressBar value={M} max={N} variant="default" showLabel />
              </div>
              <Link href={`/photographer/projects/${id}/upload`} className="mt-4 block">
                <Button variant="primary" className="w-full flex items-center justify-center gap-2">
                  <Upload className="h-4 w-4" />
                  {M === 0 ? "사진 업로드" : "업로드 관리"}
                </Button>
              </Link>
            </Card>
          )}

          {project.status !== "preparing" && (
            <Card
              className="cursor-pointer transition-colors hover:border-zinc-700"
              onClick={() => router.push(`/photographer/projects/${id}/upload`)}
            >
              <p className="font-medium text-zinc-200">📷 업로드된 사진</p>
              <p className="mt-1 text-sm text-zinc-400">업로드 {M}장 / 필요 {N}장</p>
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/photographer/projects/${id}/upload`);
                  }}
                >
                  사진 보기 →
                </Button>
              </div>
            </Card>
          )}

          {(project.status === "confirmed" || project.status === "editing") && (
            <Card>
              <CardTitle className="mb-3">결과</CardTitle>
              {project.confirmedAt && (
                <p className="text-sm text-zinc-400">
                  확정일: {format(new Date(project.confirmedAt), "yyyy-MM-dd HH:mm")}
                </p>
              )}
              <Link href={`/photographer/projects/${id}/results`} className="mt-4 block">
                <Button variant="primary" className="w-full flex items-center justify-center gap-2">
                  <Search className="h-4 w-4" />
                  결과 검토하기
                </Button>
              </Link>
            </Card>
          )}

          {project.status === "editing" && (
            <Card>
              <CardTitle className="mb-3">🎨 v1 보정본 업로드</CardTitle>
              <p className="text-sm text-zinc-400 mb-3">
                고객 선택본 기준으로 v1 보정본을 업로드하고 전달하세요.
              </p>
              <Link href={`/photographer/projects/${id}/upload-versions`} className="block">
                <Button variant="primary" className="w-full flex items-center justify-center gap-2">
                  <Upload className="h-4 w-4" />
                  보정본 업로드
                </Button>
              </Link>
            </Card>
          )}

          {project.status === "editing_v2" && (
            <Card className="border-warning/30 bg-warning/5">
              <CardTitle className="mb-3">🔄 재보정 요청이 접수되었습니다</CardTitle>
              <p className="text-sm text-zinc-400 mb-3">
                고객이 재보정을 요청한 사진이 있습니다. v2 보정본을 업로드해 주세요.
              </p>
              {/* 목업: 재보정 요청 목록은 추후 version_reviews 연동 */}
              <div className="mb-3 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs text-zinc-500">
                재보정 요청 사진 목록 · 고객 코멘트 (DB 연동 후 표시)
              </div>
              <Link href={`/photographer/projects/${id}/upload-versions/v2`} className="block">
                <Button variant="primary" className="w-full flex items-center justify-center gap-2">
                  <Upload className="h-4 w-4" />
                  v2 재보정 업로드
                </Button>
              </Link>
            </Card>
          )}

          {(project.status === "reviewing_v1" || project.status === "reviewing_v2") && (
            <Card>
              <CardTitle className="mb-3">👀 고객 검토 중</CardTitle>
              <p className="text-sm text-zinc-400 mb-2">
                고객이 보정본을 검토하고 있습니다.
              </p>
              <Link
                href={
                  project.status === "reviewing_v2"
                    ? `/photographer/projects/${id}/upload-versions/v2`
                    : `/photographer/projects/${id}/upload-versions`
                }
                className="mt-3 block"
              >
                <Button variant="outline" className="w-full">
                  보정본 확인
                </Button>
              </Link>
              <div className="mt-2 text-xs text-zinc-500">
                검토 현황 · 재보정 요청 (DB 연동 후 표시)
              </div>
              <ProgressBar
                value={0}
                max={N}
                variant="default"
                className="mt-3"
                showLabel
              />
            </Card>
          )}

          {project.status === "delivered" && (
            <Card className="border-success/30 bg-success/5">
              <CardTitle className="mb-3">✅ 납품 완료</CardTitle>
              <p className="text-sm text-zinc-400">
                이 프로젝트는 최종 납품이 완료되었습니다.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                완료일시 (DB 연동 후 표시)
              </p>
            </Card>
          )}

          {/* 위험 구역 */}
          <Card className="border-danger/50 bg-danger/5">
            <CardTitle className="text-danger">위험 구역</CardTitle>
            <Button
              variant="danger"
              className="mt-3 w-full justify-start"
              onClick={() => {
                setSaveError("");
                setShowDeleteModal(true);
              }}
            >
              프로젝트 삭제
            </Button>
          </Card>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white">프로젝트 삭제</h3>
            <p className="mt-2 text-sm text-zinc-400">
              정말 삭제하시겠습니까? 모든 사진과 셀렉 데이터가 영구적으로 삭제됩니다.
            </p>
            {saveError && (
              <p className="mt-3 text-sm text-danger">{saveError}</p>
            )}
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                취소
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await fetch(`/api/photographer/projects/${id}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? "삭제에 실패했습니다.");
                    }
                    setShowDeleteModal(false);
                    router.push("/photographer/dashboard");
                  } catch (e) {
                    console.error(e);
                    setSaveError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "삭제 중…" : "삭제"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white">사진 전체 삭제</h3>
            <p className="mt-2 text-sm text-zinc-400">
              업로드된 사진 {photoList.length}장을 모두 삭제하시겠습니까?
            </p>
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={deletingAll}
              >
                취소
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={deletingAll}
                onClick={handleDeleteAllPhotos}
              >
                {deletingAll ? "삭제 중…" : "전체 삭제"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
