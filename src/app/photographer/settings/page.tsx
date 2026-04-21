"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Camera } from "lucide-react";
import type { PhotographerProfile } from "@/app/api/photographer/profile/route";
import { getProfileImageUrl } from "@/lib/photographer";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useProfile } from "@/contexts/ProfileContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp";
const ACCENT  = "#FF4D00";
const DANGER  = "#FF3333";
const SURFACE_0  = "#050505";
const SURFACE_1  = "#0a0a0a";
const SURFACE_2  = "#0d0d0d";
const BORDER_MID  = "#222";
const BORDER_HIGH = "#333";
const TEXT_SEC  = "#888";
const TEXT_TERT = "#444";
const FONT_MONO = "'Space Mono', 'Noto Sans KR', sans-serif";
const FONT_SANS = "'Pretendard', -apple-system, sans-serif";

function getInitial(name: string | null, email: string | null): string {
  if (name?.trim()) return name.trim().charAt(0).toUpperCase();
  if (email?.trim()) return email.trim().charAt(0).toUpperCase();
  return "?";
}

/** 모서리 꺾쇠 장식 */
function Brackets() {
  const base: React.CSSProperties = {
    position: "absolute", width: 12, height: 12,
    border: `2px solid ${ACCENT}`, pointerEvents: "none",
  };
  return (
    <>
      <div style={{ ...base, top: -1, left: -1, borderRight: "none", borderBottom: "none" }} />
      <div style={{ ...base, top: -1, right: -1, borderLeft: "none", borderBottom: "none" }} />
      <div style={{ ...base, bottom: -1, left: -1, borderRight: "none", borderTop: "none" }} />
      <div style={{ ...base, bottom: -1, right: -1, borderLeft: "none", borderTop: "none" }} />
    </>
  );
}

interface ToastItem { id: number; message: string; isError: boolean; }

export default function SettingsPage() {
  const router = useRouter();
  const { profile: ctxProfile, updateProfile: updateCtxProfile } = useProfile();

  const [profile, setProfile] = useState<PhotographerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // form
  const [editName, setEditName]           = useState("");
  const [editBio, setEditBio]             = useState("");
  const [editInstagram, setEditInstagram] = useState("");
  const [editPortfolio, setEditPortfolio] = useState("");
  const [editPhone, setEditPhone]         = useState("");
  const [saving, setSaving]               = useState(false);
  const [formError, setFormError]         = useState<string | null>(null);

  // image
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI
  const [toasts, setToasts]               = useState<ToastItem[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [clockStr, setClockStr]           = useState("");

  // clock
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setClockStr(
        `${n.getHours().toString().padStart(2, "0")}:${n.getMinutes().toString().padStart(2, "0")}:${n.getSeconds().toString().padStart(2, "0")}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // profile load
  useEffect(() => {
    fetch("/api/photographer/profile")
      .then((r) => { if (!r.ok) throw new Error("프로필을 불러올 수 없습니다."); return r.json(); })
      .then((data: PhotographerProfile) => {
        setProfile(data);
        setEditName(data.name ?? "");
        setEditBio(data.bio ?? "");
        const raw = data.instagramUrl ?? "";
        setEditInstagram(raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, ""));
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
      showToast("프로필 데이터가 저장되었습니다.");
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
    setEditInstagram(raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, ""));
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

  const userName = ctxProfile?.name?.trim() || ctxProfile?.email?.split("@")[0] || "작가";

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#000" }}>
        <Loader2 size={24} color={TEXT_TERT} style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!profile) return null;

  const initial = getInitial(profile.name, profile.email);
  const joinDate = profile.createdAt
    ? format(new Date(profile.createdAt), "yyyy년 M월", { locale: ko })
    : null;

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "transparent", border: "none",
    borderBottom: `1px solid ${BORDER_HIGH}`, color: "#fff",
    fontFamily: FONT_SANS, fontSize: 15, padding: "8px 0",
    transition: "border-color 0.2s, background 0.2s",
    borderRadius: 0, outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13, color: TEXT_SEC, marginBottom: 6, display: "block",
  };

  return (
    <div
      className="st-root"
      style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: FONT_SANS, position: "relative" }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes st-scanline { 0% { bottom: 100%; } 100% { bottom: -100px; } }
        @keyframes st-toastIn { from { transform: translateX(120%); } to { transform: translateX(0); } }

        .st-grid-bg {
          position: fixed; inset: 0;
          background-image: linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px);
          background-size: 60px 60px; background-position: center top;
          opacity: 0.2; pointer-events: none; z-index: 0;
        }
        .st-scanline {
          width: 100%; height: 100px; position: fixed; bottom: 100%;
          background: linear-gradient(0deg, rgba(255,77,0,0.02) 0%, rgba(255,77,0,0) 100%);
          animation: st-scanline 8s linear infinite; pointer-events: none; z-index: 1;
        }
        .st-input:focus {
          border-bottom-color: ${ACCENT} !important;
          background: rgba(255,77,0,0.04) !important;
          padding-left: 4px;
        }
        .st-input::placeholder { color: ${TEXT_TERT}; }
        .st-textarea:focus {
          border-color: ${ACCENT} !important;
          background: rgba(255,77,0,0.04) !important;
          outline: none;
        }
        .st-textarea::placeholder { color: ${TEXT_TERT}; }
        .st-instagram-row:focus-within .st-insta-prefix {
          border-bottom-color: ${ACCENT} !important;
          color: ${ACCENT} !important;
        }
        .st-instagram-row:focus-within .st-input {
          border-bottom-color: ${ACCENT} !important;
        }
        .st-btn-outline:hover:not(:disabled) { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .st-btn-primary:hover:not(:disabled) { background: #ff5e1a !important; }
        .st-btn-danger:hover:not(:disabled) { background: ${DANGER} !important; color: #fff !important; }
        .st-avatar-wrap:hover .st-avatar-hover { opacity: 1 !important; }
        .st-toast { animation: st-toastIn 0.3s cubic-bezier(0.16,1,0.3,1) both; }
        .st-toggle-row:hover { background: rgba(255,255,255,0.02); }

        @media (max-width: 768px) {
          .st-topbar { flex-wrap: wrap; gap: 10px; padding: 10px 14px !important; padding-top: max(10px, env(safe-area-inset-top)) !important; height: auto !important; }
          .st-clock { display: none !important; }
          .st-hero { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
          .st-hero-actions { width: 100% !important; align-items: stretch !important; }
          .st-hero-actions button { width: 100% !important; justify-content: center !important; }
          .st-grid { grid-template-columns: 1fr !important; }
          .st-card-footer { flex-direction: column-reverse !important; gap: 10px !important; }
          .st-card-footer > div { width: 100% !important; justify-content: stretch !important; }
          .st-card-footer button { width: 100% !important; min-height: 44px !important; justify-content: center !important; }
          .st-danger-row { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
          .st-danger-row button { width: 100% !important; min-height: 44px !important; justify-content: center !important; }
          .st-delete-actions { flex-direction: column-reverse !important; align-items: stretch !important; gap: 8px !important; }
          .st-delete-actions button { width: 100% !important; min-height: 44px !important; justify-content: center !important; }
        }
      `}</style>

      {/* 배경 */}
      <div className="st-grid-bg" />
      <div className="st-scanline" />

      {/* ── 상단 헤더 (대시보드와 동일) ── */}
      <header
        className="st-topbar"
        style={{
          position: "sticky", top: 0, zIndex: 50,
          height: 64, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 28px",
          background: "rgba(0,0,0,0.95)", backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${BORDER_MID}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {ctxProfile?.profileImageUrl ? (
            <img
              src={getProfileImageUrl(ctxProfile.profileImageUrl)}
              alt=""
              style={{ width: 32, height: 32, objectFit: "cover", border: "1px solid #2a2a2a", flexShrink: 0 }}
              onError={(e) => { (e.target as HTMLImageElement).src = getProfileImageUrl(null); }}
            />
          ) : (
            <div style={{
              width: 32, height: 32, background: "#111", border: "1px solid #2a2a2a",
              flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: "#777", fontFamily: "'Space Grotesk', sans-serif",
            }}>
              {userName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, color: "#ccc" }}>
              안녕하세요, <strong style={{ color: "#fff" }}>{userName} 작가님</strong>
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.15em", marginTop: 1 }}>
              세션 활성
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="st-clock" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: "#555", letterSpacing: "0.15em", textTransform: "uppercase" }}>SYS_TIME</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: "#fff", letterSpacing: "0.1em" }}>{clockStr}</span>
          </div>
          <div style={{
            fontFamily: FONT_MONO, fontSize: 10, color: TEXT_TERT,
            letterSpacing: "0.1em", textTransform: "uppercase",
            border: "1px solid #1a1a1a", padding: "5px 10px",
          }}>
            SYS :: SETTINGS
          </div>
        </div>
      </header>

      {/* ── 본문 ── */}
      <div style={{ position: "relative", zIndex: 10, padding: "28px 28px 60px" }}>

        {/* 타이틀 바 */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          borderBottom: `1px solid ${BORDER_MID}`, paddingBottom: 20, marginBottom: 28,
        }}>
          <div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: ACCENT, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 6 }}>
              SYS.USER :: PHOTOGRAPHER_SETTINGS
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>설정</h1>
          </div>
        </div>

        {/* ── 히어로 패널 ── */}
        <section
          className="st-hero"
          style={{
            background: SURFACE_1, border: `1px solid ${BORDER_MID}`,
            padding: "28px 32px", display: "flex", alignItems: "center", gap: 28,
            position: "relative", marginBottom: 28,
          }}
        >
          <Brackets />

          {/* 숨김 파일 인풋 */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_IMAGE}
            style={{ display: "none" }}
            onChange={handleProfileImageChange}
            disabled={uploadingImage}
          />

          {/* 아바타 */}
          <div
            className="st-avatar-wrap"
            onClick={() => fileInputRef.current?.click()}
            style={{ position: "relative", width: 80, height: 80, flexShrink: 0, cursor: "pointer" }}
          >
            <div style={{
              width: "100%", height: "100%", borderRadius: "50%",
              background: profile.profileImageUrl ? "transparent" : ACCENT,
              border: `1px solid ${profile.profileImageUrl ? BORDER_HIGH : ACCENT}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              {profile.profileImageUrl ? (
                <img
                  src={getProfileImageUrl(profile.profileImageUrl)}
                  alt="프로필"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => { (e.target as HTMLImageElement).src = getProfileImageUrl(null); }}
                />
              ) : (
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 24, color: "#000", letterSpacing: "-1px" }}>
                  {initial}
                </span>
              )}
            </div>
            <div
              className="st-avatar-hover"
              style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: "rgba(0,0,0,0.8)", color: ACCENT,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: FONT_MONO, fontSize: 10,
                opacity: 0, transition: "opacity 0.2s",
                border: `1px solid ${ACCENT}`,
              }}
            >
              {uploadingImage
                ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                : "EDIT"}
            </div>
          </div>

          {/* 히어로 정보 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: "#fff", marginBottom: 6, lineHeight: 1.2 }}>
              {profile.name || "이름 없음"}
            </h2>
            <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: TEXT_SEC, marginBottom: 12 }}>
              {profile.email ?? ""}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{
                fontFamily: FONT_MONO, fontSize: 10, padding: "3px 8px",
                border: `1px solid ${ACCENT}`, color: ACCENT,
                background: "rgba(255,77,0,0.15)", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                <Check size={9} strokeWidth={3} aria-hidden /> Google 연결됨
              </span>
              {joinDate && (
                <span style={{
                  fontFamily: FONT_MONO, fontSize: 10, padding: "3px 8px",
                  border: `1px solid ${BORDER_HIGH}`, color: TEXT_SEC, textTransform: "uppercase",
                }}>
                  {joinDate} 가입
                </span>
              )}
            </div>
          </div>

          {/* 이미지 변경 */}
          <div className="st-hero-actions" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              className="st-btn-outline"
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: "transparent", border: `1px solid ${BORDER_HIGH}`,
                color: "#fff", padding: "8px 16px", cursor: "pointer",
                fontSize: 13, fontFamily: FONT_SANS, fontWeight: 500,
                transition: "border-color 0.2s, color 0.2s",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Camera size={13} />
              이미지 변경
            </button>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: TEXT_TERT, textAlign: "right", lineHeight: 1.7 }}>
              JPG, PNG · 최대 5MB<br />권장 크기 200×200px
            </span>
          </div>
        </section>

        {/* ── 2컬럼 그리드 ── */}
        <div
          className="st-grid"
          style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28, alignItems: "start" }}
        >

          {/* ── 좌: 프로필 편집 ── */}
          <div style={{ background: SURFACE_1, border: `1px solid ${BORDER_MID}`, display: "flex", flexDirection: "column" }}>

            {/* 카드 헤더 */}
            <div style={{
              padding: "16px 24px", borderBottom: `1px solid ${BORDER_MID}`,
              background: SURFACE_0, display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{
                fontFamily: FONT_MONO, fontSize: 10, color: ACCENT,
                letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 8,
              }}>
                <div style={{ width: 6, height: 6, background: ACCENT, flexShrink: 0 }} />
                &gt;_ SYS.USER :: PROFILE_DATA
              </div>
              <div style={{ fontSize: 17, fontWeight: 500 }}>프로필 편집</div>
            </div>

            {/* 카드 바디 */}
            <div style={{ padding: "24px 24px 8px", display: "flex", flexDirection: "column", gap: 22, flex: 1 }}>

              {/* 이름 */}
              <div>
                <label style={labelStyle}>이름</label>
                <input
                  className="st-input"
                  style={inputStyle}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="이름"
                />
              </div>

              {/* 소개 */}
              <div>
                <label style={labelStyle}>소개</label>
                <textarea
                  className="st-textarea"
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${BORDER_HIGH}`, color: "#fff",
                    fontFamily: FONT_SANS, fontSize: 14, padding: "8px 10px",
                    resize: "none", height: 72, lineHeight: 1.5,
                    transition: "border-color 0.2s, background 0.2s",
                    outline: "none", borderRadius: 0, boxSizing: "border-box",
                  }}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="간단한 소개 (선택)"
                />
                <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: TEXT_TERT, marginTop: 4 }}>
                  고객 갤러리 페이지에 표시됩니다
                </div>
              </div>

              {/* 연락처 */}
              <div>
                <label style={labelStyle}>연락처</label>
                <input
                  className="st-input"
                  style={inputStyle}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="010-0000-0000"
                />
                <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: TEXT_TERT, marginTop: 4 }}>
                  알림 기능 연동 시 사용됩니다 (선택사항)
                </div>
              </div>

              {/* SNS 구분선 */}
              <div style={{ height: 1, background: BORDER_MID, position: "relative", marginTop: 4 }}>
                <span style={{
                  position: "absolute", right: 0, top: -10,
                  fontFamily: FONT_MONO, fontSize: 8, color: TEXT_TERT,
                  background: SURFACE_1, paddingLeft: 8,
                }}>
                  LINK_DATA
                </span>
              </div>

              {/* 인스타그램 */}
              <div>
                <label style={labelStyle}>인스타그램</label>
                <div className="st-instagram-row" style={{ display: "flex", alignItems: "stretch" }}>
                  <span
                    className="st-insta-prefix"
                    style={{
                      background: SURFACE_2,
                      borderBottom: `1px solid ${BORDER_HIGH}`,
                      padding: "8px 10px", fontFamily: FONT_MONO, fontSize: 12,
                      color: TEXT_SEC, display: "flex", alignItems: "center",
                      whiteSpace: "nowrap", transition: "border-color 0.2s, color 0.2s",
                    }}
                  >
                    instagram.com/
                  </span>
                  <input
                    className="st-input"
                    style={{ ...inputStyle, flex: 1 }}
                    value={editInstagram}
                    onChange={(e) => setEditInstagram(e.target.value)}
                    placeholder="계정명"
                  />
                </div>
              </div>

              {/* 포트폴리오 */}
              <div style={{ paddingBottom: 8 }}>
                <label style={labelStyle}>포트폴리오</label>
                <input
                  className="st-input"
                  style={inputStyle}
                  value={editPortfolio}
                  onChange={(e) => setEditPortfolio(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* 카드 푸터 */}
            <div
              className="st-card-footer"
              style={{
                padding: "16px 24px", borderTop: `1px solid ${BORDER_MID}`,
                background: SURFACE_0,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <span style={{
                fontFamily: FONT_MONO, fontSize: 11, color: DANGER,
                opacity: formError ? 1 : 0, transition: "opacity 0.2s",
              }}>
                {formError ?? ""}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="st-btn-outline"
                  onClick={handleCancel}
                  disabled={saving}
                  style={{
                    background: "transparent", border: `1px solid ${BORDER_HIGH}`,
                    color: "#fff", padding: "9px 18px", cursor: "pointer",
                    fontSize: 13, fontFamily: FONT_SANS, fontWeight: 500,
                    transition: "border-color 0.2s, color 0.2s", opacity: saving ? 0.5 : 1,
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="st-btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    background: ACCENT, border: `1px solid ${ACCENT}`,
                    color: "#000", padding: "9px 22px",
                    cursor: saving ? "not-allowed" : "pointer",
                    fontSize: 13, fontFamily: FONT_SANS, fontWeight: 600,
                    transition: "background 0.2s",
                    opacity: saving ? 0.7 : 1,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
                  {saving ? "저장 중..." : "저장하기"}
                </button>
              </div>
            </div>
          </div>

          {/* ── 우측 컬럼 ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* 알림 설정 */}
            <div style={{ background: SURFACE_1, border: `1px solid ${BORDER_MID}`, display: "flex", flexDirection: "column" }}>
              <div style={{
                padding: "16px 24px", borderBottom: `1px solid ${BORDER_MID}`,
                background: SURFACE_0,
                display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{
                    fontFamily: FONT_MONO, fontSize: 10, color: ACCENT,
                    letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 8, marginBottom: 4,
                  }}>
                    <div style={{ width: 6, height: 6, background: ACCENT, flexShrink: 0 }} />
                    &gt;_ SYS.NET :: ALERT_ROUTING
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 500 }}>알림 설정</div>
                </div>
                <span style={{
                  fontFamily: FONT_MONO, fontSize: 9, padding: "3px 8px",
                  background: BORDER_MID, color: TEXT_SEC, border: `1px solid ${BORDER_HIGH}`,
                }}>준비 중</span>
              </div>

              <div style={{ padding: "0 24px" }}>
                {[
                  { label: "고객 셀렉 완료 알림", desc: "최종 확정 시 알림" },
                  { label: "재보정 요청 알림", desc: "재보정 요청 시 알림" },
                  { label: "마감 임박 알림", desc: "셀렉 기한 3일 전 알림" },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="st-toggle-row"
                    onClick={() => showToast("준비 중인 기능입니다.")}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "18px 0",
                      borderBottom: i < 2 ? `1px solid ${BORDER_MID}` : "none",
                      cursor: "pointer", transition: "background 0.15s",
                      margin: "0 -24px", paddingLeft: 24, paddingRight: 24,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, color: "#fff", marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: TEXT_SEC }}>{item.desc}</div>
                    </div>
                    {/* 토글 */}
                    <div style={{
                      width: 36, height: 18, flexShrink: 0,
                      border: `1px solid ${BORDER_HIGH}`, background: SURFACE_2,
                      position: "relative",
                    }}>
                      <div style={{
                        width: 12, height: 12, background: BORDER_HIGH,
                        position: "absolute", top: 2, left: 2,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 위험 구역 */}
            <div style={{ background: SURFACE_1, border: `1px solid ${BORDER_HIGH}`, display: "flex", flexDirection: "column" }}>
              <div style={{
                padding: "16px 24px", borderBottom: "1px solid rgba(255,51,51,0.2)",
                background: SURFACE_0, display: "flex", flexDirection: "column", gap: 4,
              }}>
                <div style={{
                  fontFamily: FONT_MONO, fontSize: 10, color: DANGER,
                  letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 8,
                }}>
                  <div style={{ width: 6, height: 6, background: DANGER, flexShrink: 0 }} />
                  &gt;_ SYS.SEC :: DANGER_ZONE
                </div>
                <div style={{ fontSize: 17, fontWeight: 500, color: DANGER }}>위험 구역</div>
              </div>
              <div
                className="st-danger-row"
                style={{ padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 3 }}>계정 탈퇴</div>
                  <div style={{ fontSize: 12, color: TEXT_SEC }}>모든 데이터가 영구 삭제됩니다</div>
                </div>
                <button
                  type="button"
                  className="st-btn-danger"
                  onClick={() => setShowDeleteModal(true)}
                  style={{
                    background: "transparent", border: `1px solid ${DANGER}`,
                    color: DANGER, padding: "8px 18px", cursor: "pointer",
                    fontSize: 13, fontFamily: FONT_SANS, fontWeight: 500,
                    transition: "background 0.2s, color 0.2s",
                    flexShrink: 0, whiteSpace: "nowrap",
                  }}
                >
                  탈퇴하기
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 탈퇴 확인 모달 ── */}
      {showDeleteModal && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
            zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
        >
          <div style={{
            background: SURFACE_1, border: `1px solid ${BORDER_MID}`,
            width: "100%", maxWidth: 400, padding: 32,
            position: "relative", margin: "0 16px",
          }}>
            <Brackets />
            <div style={{ fontFamily: FONT_MONO, fontSize: 28, color: DANGER, marginBottom: 16 }}>[!]</div>
            <h3 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8, color: "#fff" }}>정말 탈퇴하시겠습니까?</h3>
            <p style={{ fontSize: 14, color: TEXT_SEC, lineHeight: 1.7, marginBottom: 24 }}>
              모든 프로젝트와 사진 데이터가 삭제됩니다.{" "}
              <strong style={{ color: DANGER, fontWeight: 400 }}>이 작업은 되돌릴 수 없습니다.</strong>
            </p>
            <div
              className="st-delete-actions"
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="st-btn-outline"
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingAccount}
                style={{
                  background: "transparent", border: `1px solid ${BORDER_HIGH}`,
                  color: "#fff", padding: "9px 18px", cursor: "pointer",
                  fontSize: 13, fontFamily: FONT_SANS, fontWeight: 500,
                  transition: "border-color 0.2s, color 0.2s",
                  opacity: deletingAccount ? 0.5 : 1,
                }}
              >
                취소
              </button>
              <button
                type="button"
                className="st-btn-danger"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                style={{
                  background: "transparent", border: `1px solid ${DANGER}`,
                  color: DANGER, padding: "9px 22px",
                  cursor: deletingAccount ? "not-allowed" : "pointer",
                  fontSize: 13, fontFamily: FONT_SANS, fontWeight: 500,
                  transition: "background 0.2s, color 0.2s",
                  opacity: deletingAccount ? 0.7 : 1,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {deletingAccount && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
                탈퇴하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      <div style={{
        position: "fixed", bottom: 28, right: 28,
        display: "flex", flexDirection: "column", gap: 8, zIndex: 200,
      }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className="st-toast"
            style={{
              background: SURFACE_1, border: `1px solid ${BORDER_MID}`,
              borderLeft: `3px solid ${t.isError ? DANGER : ACCENT}`,
              padding: "14px 20px", fontSize: 13, color: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", gap: 12,
              minWidth: 240,
            }}
          >
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: t.isError ? DANGER : ACCENT, flexShrink: 0 }}>
              {t.isError ? "[ERR]" : "[OK]"}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
