"use client";

import { PageLoader } from "@/components/ui/PageLoader";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  Camera,
  Bell,
  AlertTriangle,
  X,
} from "lucide-react";
import type { PhotographerProfile } from "@/app/api/photographer/profile/route";
import { getProfileImageUrl } from "@/lib/photographer";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useProfile } from "@/contexts/ProfileContext";
import { PhotographerPageHeader } from "@/components/layout/PhotographerPageHeader";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp";

const INPUT_CLS =
  "w-full bg-[#0a0a0c] border border-[#27272c] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]/20 transition-all disabled:opacity-50";

function getInitial(name: string | null, email: string | null): string {
  if (name?.trim()) return name.trim().charAt(0).toUpperCase();
  if (email?.trim()) return email.trim().charAt(0).toUpperCase();
  return "?";
}

interface ToastItem {
  id: number;
  message: string;
  isError: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const { updateProfile: updateCtxProfile } = useProfile();

  const [profile, setProfile] = useState<PhotographerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editInstagram, setEditInstagram] = useState("");
  const [editPortfolio, setEditPortfolio] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

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
        const raw = data.instagramUrl ?? "";
        setEditInstagram(
          raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, ""),
        );
        setEditPortfolio(data.portfolioUrl ?? "");
        setEditPhone(data.contactPhone ?? "");
      })
      .catch((e) => setFormError(e instanceof Error ? e.message : "오류"))
      .finally(() => setLoading(false));
  }, []);

  const showToast = (message: string, isError = false) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, isError }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setFormError(null);
    try {
      const instagramUrl = editInstagram.trim()
        ? `https://instagram.com/${editInstagram.trim().replace(/^@/, "")}`
        : null;
      const res = await fetch("/api/photographer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || null,
          bio: editBio.trim() || null,
          instagram_url: instagramUrl,
          portfolio_url: editPortfolio.trim() || null,
          contact_phone: editPhone.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("저장에 실패했습니다.");
      const patch = {
        name: editName.trim() || null,
        bio: editBio.trim() || null,
        instagramUrl,
        portfolioUrl: editPortfolio.trim() || null,
        contactPhone: editPhone.trim() || null,
      };
      setProfile({ ...profile, ...patch });
      updateCtxProfile(patch);
      showToast("프로필이 저장되었습니다.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!profile) return;
    setEditName(profile.name ?? "");
    setEditBio(profile.bio ?? "");
    const raw = profile.instagramUrl ?? "";
    setEditInstagram(
      raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, ""),
    );
    setEditPortfolio(profile.portfolioUrl ?? "");
    setEditPhone(profile.contactPhone ?? "");
    setFormError(null);
  };

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    e.target.value = "";
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return;
    setUploadingImage(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
      showToast("프로필 이미지가 변경되었습니다.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "이미지 업로드 실패", true);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const res = await fetch("/api/photographer/account", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "탈퇴 처리 중 오류가 발생했습니다.");
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "탈퇴 실패", true);
      setDeletingAccount(false);
      setShowDeleteModal(false);
    }
  };

  if (loading) {
    return <PageLoader variant="full" />;
  }

  if (!profile) return null;

  const initial = getInitial(profile.name, profile.email);
  const joinDate = profile.createdAt
    ? format(new Date(profile.createdAt), "yyyy년 M월", { locale: ko })
    : null;

  const cardCls = "bg-[#121215] border border-[#1a1a1e] rounded-2xl overflow-hidden";

  return (
    <div
      className="min-h-screen bg-[#0a0a0c] text-white"
      style={{ fontFamily: "var(--font-inter, 'Pretendard', sans-serif)" }}
      onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}
    >
      <PhotographerPageHeader
        crumbs={[{ label: "설정" }]}
        title="설정"
        stats={[
          { label: "계정", value: profile.email?.split("@")[0] ?? "—" },
        ]}
      />

      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-6">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_IMAGE}
          className="hidden"
          onChange={handleProfileImageChange}
          disabled={uploadingImage}
        />

        {/* 프로필 요약 */}
        <section className={`${cardCls} p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6`}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-20 h-20 rounded-full shrink-0 overflow-hidden border border-[#27272c] focus:outline-none focus:ring-2 focus:ring-[#FF4D00]/40"
          >
            <div
              className={`w-full h-full flex items-center justify-center ${
                profile.profileImageUrl ? "bg-transparent" : "bg-[#FF4D00]"
              }`}
            >
              {profile.profileImageUrl ? (
                <img
                  src={getProfileImageUrl(profile.profileImageUrl)}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getProfileImageUrl(null);
                  }}
                />
              ) : (
                <span
                  className="text-2xl font-bold text-black"
                  style={{ fontFamily: "var(--font-mono, monospace)" }}
                >
                  {initial}
                </span>
              )}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/75 text-[#FF4D00] text-[10px] font-semibold opacity-0 hover:opacity-100 transition-opacity">
              {uploadingImage ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Camera size={16} className="mr-1" />
                  변경
                </>
              )}
            </div>
          </button>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight truncate">
              {profile.name || "이름 없음"}
            </h2>
            <p
              className="text-sm text-zinc-500 mt-1 truncate"
              style={{ fontFamily: "var(--font-mono, monospace)" }}
            >
              {profile.email ?? ""}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/30">
                <Check size={12} strokeWidth={2.5} aria-hidden />
                Google 연결됨
              </span>
              {joinDate && (
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] text-zinc-400 bg-[#1a1a1e] border border-[#27272c]"
                  style={{ fontFamily: "var(--font-mono, monospace)" }}
                >
                  {joinDate} 가입
                </span>
              )}
            </div>
          </div>

          <div className="w-full sm:w-auto flex flex-col items-stretch sm:items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[#27272c] text-zinc-300 hover:border-[#FF4D00] hover:text-[#FF4D00] transition-colors disabled:opacity-50"
            >
              <Camera size={16} />
              이미지 변경
            </button>
            <p className="text-[10px] text-zinc-600 text-center sm:text-right leading-relaxed">
              JPG, PNG, WebP · 최대 5MB
              <br />
              권장 200×200px
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
          {/* 프로필 편집 */}
          <div className={cardCls}>
            <div className="px-6 py-4 border-b border-[#1a1a1e] bg-[#0a0a0c]/40">
              <h3 className="text-base font-bold text-white">프로필 편집</h3>
              <p className="text-xs text-zinc-500 mt-1">고객에게 보이는 이름과 링크를 관리합니다.</p>
            </div>

            <div className="p-6 flex flex-col gap-5">
              <div>
                <label className="text-sm font-semibold text-zinc-300 block mb-2">이름</label>
                <input
                  className={INPUT_CLS}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="이름"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-zinc-300 block mb-2">소개</label>
                <textarea
                  className={`${INPUT_CLS} min-h-[88px] resize-none leading-relaxed`}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="간단한 소개 (선택)"
                />
                <p className="text-[11px] text-zinc-600 mt-1.5">고객 갤러리 페이지에 표시됩니다.</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-zinc-300 block mb-2">연락처</label>
                <input
                  className={INPUT_CLS}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="010-0000-0000"
                />
                <p className="text-[11px] text-zinc-600 mt-1.5">알림 연동 시 사용됩니다 (선택).</p>
              </div>

              <div className="h-px bg-[#1a1a1e] my-1" />

              <div>
                <label className="text-sm font-semibold text-zinc-300 block mb-2">인스타그램</label>
                <div className="flex rounded-xl overflow-hidden border border-[#27272c] focus-within:border-[#FF4D00] focus-within:ring-1 focus-within:ring-[#FF4D00]/20 transition-all">
                  <span
                    className="shrink-0 px-3 py-2.5 text-xs text-zinc-500 bg-[#0a0a0c] border-r border-[#27272c] flex items-center"
                    style={{ fontFamily: "var(--font-mono, monospace)" }}
                  >
                    instagram.com/
                  </span>
                  <input
                    className="flex-1 min-w-0 bg-[#0a0a0c] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none"
                    value={editInstagram}
                    onChange={(e) => setEditInstagram(e.target.value)}
                    placeholder="계정명"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-zinc-300 block mb-2">포트폴리오</label>
                <input
                  className={INPUT_CLS}
                  value={editPortfolio}
                  onChange={(e) => setEditPortfolio(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#1a1a1e] bg-[#0a0a0c]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {formError ? (
                <p className="text-xs text-rose-400 order-2 sm:order-1">{formError}</p>
              ) : (
                <span className="hidden sm:block order-1" />
              )}
              <div className="flex gap-2 w-full sm:w-auto justify-end order-1 sm:order-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold border border-[#27272c] text-zinc-300 hover:bg-[#1a1a1e] transition-colors disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#FF4D00] hover:bg-[#ff5e1a] text-black transition-colors disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "저장 중..." : "저장하기"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {/* 알림 */}
            <div className={cardCls}>
              <div className="px-6 py-4 border-b border-[#1a1a1e] bg-[#0a0a0c]/40 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Bell size={18} className="text-[#FF4D00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-base font-bold text-white">알림 설정</h3>
                    <p className="text-xs text-zinc-500 mt-1">이메일·푸시 알림은 준비 중입니다.</p>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-[#1a1a1e] text-zinc-400 border border-[#27272c]">
                  준비 중
                </span>
              </div>
              <ul className="divide-y divide-[#1a1a1e]">
                {[
                  { label: "고객 셀렉 완료 알림", desc: "최종 확정 시 알림" },
                  { label: "재보정 요청 알림", desc: "재보정 요청 시 알림" },
                  { label: "마감 임박 알림", desc: "셀렉 기한 3일 전 알림" },
                ].map((item) => (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => showToast("준비 중인 기능입니다.")}
                      className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-[#1a1a1e]/30 transition-colors"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{item.label}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{item.desc}</div>
                      </div>
                      <div className="w-9 h-5 rounded-full border border-[#27272c] bg-[#0a0a0c] shrink-0 relative">
                        <div className="absolute left-1 top-1 w-3 h-3 rounded-full bg-zinc-600" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* 위험 영역 */}
            <div className={`${cardCls} border-rose-500/20`}>
              <div className="px-6 py-4 border-b border-rose-500/15 bg-rose-500/5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                  <AlertTriangle size={14} />
                  위험 영역
                </h3>
                <p className="text-base font-bold text-rose-300 mt-2">계정 탈퇴</p>
                <p className="text-xs text-zinc-500 mt-1">모든 프로젝트와 데이터가 영구 삭제됩니다.</p>
              </div>
              <div className="p-6">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/30 text-rose-400 text-sm font-semibold transition-colors"
                >
                  탈퇴하기
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 탈퇴 모달 */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingAccount) setShowDeleteModal(false);
          }}
        >
          <div className="bg-[#121215] border border-rose-500/25 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1e]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-500" />
                계정 탈퇴
              </h3>
              <button
                type="button"
                onClick={() => !deletingAccount && setShowDeleteModal(false)}
                aria-label="닫기"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-[#1a1a1e] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-zinc-300 leading-relaxed">
                모든 프로젝트와 사진 데이터가 삭제됩니다.{" "}
                <strong className="text-rose-400 font-semibold">되돌릴 수 없습니다.</strong>
              </p>
              <div className="flex flex-col-reverse sm:flex-row gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deletingAccount}
                  className="flex-1 py-3 rounded-xl border border-[#27272c] bg-[#1a1a1e] text-zinc-300 text-sm font-semibold hover:bg-[#27272c] disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="flex-1 py-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {deletingAccount && <Loader2 className="w-4 h-4 animate-spin" />}
                  탈퇴하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      <div className="fixed bottom-6 right-4 md:right-8 z-[210] flex flex-col gap-2 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg flex items-start gap-3 ${
              t.isError
                ? "bg-[#121215] border-rose-500/40 text-rose-200"
                : "bg-[#121215] border-[#27272c] text-white border-l-[3px] border-l-[#FF4D00]"
            }`}
          >
            <span
              className={`text-[10px] font-mono shrink-0 mt-0.5 ${t.isError ? "text-rose-400" : "text-[#FF4D00]"}`}
            >
              {t.isError ? "오류" : "완료"}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
