"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardTitle, Button, Input } from "@/components/ui";
import type { PhotographerProfile } from "@/app/api/photographer/profile/route";
import { getProfileImageUrl } from "@/lib/photographer";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Pencil, Loader2 } from "lucide-react";
import { useProfile } from "@/contexts/ProfileContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp";

function getInitial(name: string | null, email: string | null): string {
  if (name?.trim()) return name.trim().charAt(0).toUpperCase();
  if (email?.trim()) return email.trim().charAt(0).toUpperCase();
  return "?";
}

export default function SettingsPage() {
  const { profile: ctxProfile, updateProfile: updateCtxProfile } = useProfile();
  const [profile, setProfile] = useState<PhotographerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editInstagramUrl, setEditInstagramUrl] = useState("");
  const [editPortfolioUrl, setEditPortfolioUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/photographer/profile")
      .then((r) => {
        if (!r.ok) throw new Error("프로필을 불러올 수 없습니다.");
        return r.json();
      })
      .then((data: PhotographerProfile) => {
        setProfile(data);
        setEditName(data.name ?? "");
        setEditBio(data.bio ?? "");
        setEditInstagramUrl(data.instagramUrl ?? "");
        setEditPortfolioUrl(data.portfolioUrl ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "오류"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/photographer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || null,
          bio: editBio.trim() || null,
          instagram_url: editInstagramUrl.trim() || null,
          portfolio_url: editPortfolioUrl.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("저장에 실패했습니다.");
      const patch = {
        name: editName.trim() || null,
        bio: editBio.trim() || null,
        instagramUrl: editInstagramUrl.trim() || null,
        portfolioUrl: editPortfolioUrl.trim() || null,
      };
      setProfile({ ...profile, ...patch });
      updateCtxProfile(patch);
      setEditMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    e.target.value = "";
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return;
    setUploadingImage(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다.");
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/api/upload/profile-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? "업로드 실패");
      const url = data.url as string;
      const patchRes = await fetch("/api/photographer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_image_url: url }),
      });
      if (!patchRes.ok) throw new Error("프로필 저장 실패");
      setProfile({ ...profile, profileImageUrl: url });
      updateCtxProfile({ profileImageUrl: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 업로드 실패");
    } finally {
      setUploadingImage(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-zinc-400">로딩 중...</p>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="space-y-4">
        <p className="text-danger">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (!profile) return null;

  const initial = getInitial(profile.name, profile.email);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-white">설정</h1>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* 좌측: 프로필 카드 */}
        <div className="min-w-0 flex-1">
          <Card>
            <CardTitle className="mb-4">프로필</CardTitle>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_IMAGE}
                className="hidden"
                onChange={handleProfileImageChange}
                disabled={uploadingImage}
              />
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <img
                    src={getProfileImageUrl(profile.profileImageUrl)}
                    alt="프로필"
                    className="h-20 w-20 rounded-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getProfileImageUrl(null);
                    }}
                  />
                  {uploadingImage && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </span>
                  )}
                </button>
                <p className="text-xs text-zinc-500">등록된 이미지가 없으면 기본 이미지가 표시됩니다</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? "업로드 중…" : "프로필 이미지 변경"}
                </Button>
              </div>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                {!editMode ? (
                  <>
                    <p className="font-medium text-white">{profile.name || "이름 없음"}</p>
                    <p className="text-sm text-zinc-400">{profile.email ?? ""}</p>
                    {profile.bio && (
                      <p className="mt-2 text-sm text-zinc-300">{profile.bio}</p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 flex items-center gap-1"
                      onClick={() => setEditMode(true)}
                    >
                      <Pencil className="h-4 w-4" />
                      수정
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <Input
                      label="이름"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="이름"
                    />
                    <Input
                      label="소개"
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      placeholder="간단한 소개 (선택)"
                    />
                    <Input
                      label="인스타그램 URL"
                      value={editInstagramUrl}
                      onChange={(e) => setEditInstagramUrl(e.target.value)}
                      placeholder="https://instagram.com/..."
                    />
                    <Input
                      label="포트폴리오 URL"
                      value={editPortfolioUrl}
                      onChange={(e) => setEditPortfolioUrl(e.target.value)}
                      placeholder="https://..."
                    />
                    {error && <p className="text-sm text-danger">{error}</p>}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditName(profile.name ?? "");
                          setEditBio(profile.bio ?? "");
                          setEditInstagramUrl(profile.instagramUrl ?? "");
                          setEditPortfolioUrl(profile.portfolioUrl ?? "");
                          setEditMode(false);
                          setError(null);
                        }}
                      >
                        취소
                      </Button>
                      <Button variant="primary" onClick={handleSave} disabled={saving}>
                        {saving ? "저장 중..." : "저장"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* 우측: 계정 정보 카드 */}
        <div className="w-full lg:w-[280px] shrink-0">
          <Card>
            <CardTitle className="mb-4">계정 정보</CardTitle>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500">이메일</dt>
                <dd className="mt-0.5 text-zinc-200">{profile.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">가입일</dt>
                <dd className="mt-0.5 text-zinc-200">
                  {format(new Date(profile.createdAt), "yyyy년 M월 d일", { locale: ko })}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">연결된 소셜</dt>
                <dd className="mt-0.5 text-zinc-200">Google</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
