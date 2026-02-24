"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { MessageCircle, Mail, QrCode, Link2, Copy, RefreshCw } from "lucide-react";
import { Button, Card, CardTitle, Badge, Input } from "@/components/ui";
import { mockProjects } from "@/lib/mock-data";

export default function SettingsPage() {
  const params = useParams();
  const id = params.id as string;
  const project = mockProjects.find((p) => p.id === id);
  const [showNModal, setShowNModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [newN, setNewN] = useState(project?.requiredCount ?? 0);
  const [nError, setNError] = useState("");

  if (!project) return null;

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/c/${project.inviteToken}`
      : `/c/${project.inviteToken}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    console.log("링크 복사됨");
  };

  const handleNChange = () => {
    const M = project.photoCount;
    if (newN > M) {
      setNError(`M(${M}) 이상으로 설정할 수 없습니다.`);
      return;
    }
    setNError("");
    setShowNModal(false);
    console.log("N 변경:", newN);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">프로젝트 관리</h1>
        <div className="flex gap-2">
          <Link href={`/photographer/projects/${id}/upload`}>
            <Button variant="outline">업로드</Button>
          </Link>
          <Link href={`/photographer/projects/${id}/progress`}>
            <Button variant="outline">고객 진행도 보기</Button>
          </Link>
        </div>
      </div>

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>프로젝트 정보</CardTitle>
            <ul className="mt-2 space-y-1 text-sm text-zinc-400">
              <li>프로젝트명: {project.name}</li>
              <li>촬영날짜: {format(new Date(project.shootDate), "yyyy-MM-dd")}</li>
              <li>기한: {format(new Date(project.deadline), "yyyy-MM-dd")}</li>
              <li>N(셀렉 갯수): {project.requiredCount}</li>
              <li>M(업로드 수): {project.photoCount}</li>
            </ul>
          </div>
          <Button variant="ghost" size="sm">
            수정하기
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>고객 관리</CardTitle>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-zinc-300">{project.customerName || "(미입력)"}</span>
          <Badge variant={project.status === "selecting" ? "in_progress" : "waiting"}>
            {project.status === "selecting" ? "진행 중" : "대기 중"}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
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
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            링크복사
          </Button>
        </div>
        <div className="mt-4 flex gap-2">
          <Input readOnly value={inviteUrl} className="flex-1 font-mono text-xs" />
          <Button variant="secondary" size="md" onClick={handleCopyLink} className="flex items-center gap-1">
            <Copy className="h-4 w-4" />
            복사
          </Button>
          <Button variant="ghost" size="md" className="flex items-center gap-1">
            <RefreshCw className="h-4 w-4" />
            새로 생성
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>설정</CardTitle>
        <ul className="mt-3 space-y-2">
          <li>
            <Button variant="ghost" className="w-full justify-start" onClick={() => setShowNModal(true)}>
              셀렉 갯수(N) 변경
            </Button>
          </li>
          <li>
            <Button variant="ghost" className="w-full justify-start">
              기한 연장하기
            </Button>
          </li>
          <li>
            <Link href={`/photographer/projects/${id}/upload`}>
              <Button variant="ghost" className="w-full justify-start">
                사진 삭제/추가
              </Button>
            </Link>
          </li>
          <li>
            <Button variant="danger" className="w-full justify-start" onClick={() => setShowDeleteModal(true)}>
              프로젝트 삭제
            </Button>
          </li>
        </ul>
      </Card>

      {showNModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white">셀렉 갯수(N) 변경</h3>
            <p className="mt-1 text-sm text-zinc-400">현재 N: {project.requiredCount}</p>
            <div className="mt-4">
              <Input
                type="number"
                min={1}
                max={project.photoCount}
                value={newN}
                onChange={(e) => setNewN(Number(e.target.value))}
                error={nError}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">변경 즉시 고객에게 알림됩니다</p>
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowNModal(false);
                  setNError("");
                }}
              >
                취소
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleNChange}>
                변경하기
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white">프로젝트 삭제</h3>
            <p className="mt-2 text-sm text-zinc-400">
              정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDeleteModal(false)}>
                취소
              </Button>
              <Button variant="danger" className="flex-1">
                삭제
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
