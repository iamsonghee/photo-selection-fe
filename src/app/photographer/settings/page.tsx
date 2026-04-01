"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, Bell, AlertTriangle, Phone, Globe, User, FileText, Loader2,
} from "lucide-react";
import type { PhotographerProfile } from "@/app/api/photographer/profile/route";
import { getProfileImageUrl } from "@/lib/photographer";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useProfile } from "@/contexts/ProfileContext";
import { PHOTOGRAPHER_THEME as C, PS_DISPLAY, PS_FONT } from "@/lib/photographer-theme";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp";

function getInitial(name: string | null, email: string | null): string {
  if (name?.trim()) return name.trim().charAt(0).toUpperCase();
  if (email?.trim()) return email.trim().charAt(0).toUpperCase();
  return "?";
}

// ── Toast ──
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: C.surface2, border: `1px solid ${C.borderMd}`, borderRadius: 10,
      padding: "10px 20px", fontSize: 13, color: C.text, zIndex: 9999,
      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    }}>
      {message}
    </div>
  );
}

// ── 탈퇴 확인 모달 ──
function DeleteModal({ onConfirm, onCancel, loading }: { onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998,
    }}>
      <div style={{
        background: C.surface, border: `1px solid rgba(255,71,87,0.2)`, borderRadius: 14,
        padding: "28px 28px 24px", maxWidth: 380, width: "100%", margin: "0 16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <AlertTriangle size={18} color={C.red} />
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>정말 탈퇴하시겠습니까?</span>
        </div>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 6 }}>
          모든 프로젝트와 사진 데이터가 삭제됩니다.
        </p>
        <p style={{ fontSize: 13, color: C.red, fontWeight: 500, marginBottom: 24 }}>
          이 작업은 되돌릴 수 없습니다.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "8px 16px", background: "transparent",
              border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.muted, fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "8px 18px",
              background: `rgba(255,71,87,0.15)`,
              border: `1px solid rgba(255,71,87,0.35)`,
              borderRadius: 8, color: C.red, fontSize: 13, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {loading && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
            탈퇴하기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { profile: ctxProfile, updateProfile: updateCtxProfile } = useProfile();
  const [profile, setProfile] = useState<PhotographerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // form state
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editInstagram, setEditInstagram] = useState("");
  const [editPortfolio, setEditPortfolio] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // image upload
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [toast, setToast] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    fetch("/api/photographer/profile")
      .then((r) => { if (!r.ok) throw new Error("프로필을 불러올 수 없습니다."); return r.json(); })
      .then((data: PhotographerProfile) => {
        setProfile(data);
        setEditName(data.name ?? "");
        setEditBio(data.bio ?? "");
        // instagram_url 전체 저장 → prefix 제거 후 표시
        const raw = data.instagramUrl ?? "";
        setEditInstagram(raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, ""));
        setEditPortfolio(data.portfolioUrl ?? "");
        setEditPhone(data.contactPhone ?? "");
      })
      .catch((e) => setFormError(e instanceof Error ? e.message : "오류"))
      .finally(() => setLoading(false));
  }, []);

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
      setToast("저장되었습니다.");
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
      setToast("프로필 이미지가 변경되었습니다.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "이미지 업로드 실패");
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
      router.push("/auth");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "탈퇴 실패");
      setDeletingAccount(false);
      setShowDeleteModal(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh" }}>
        <Loader2 size={24} color={C.muted} style={{ animation: "spin 1s linear infinite" }} />
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
    width: "100%", padding: "10px 12px",
    background: C.surface2, border: `1px solid ${C.border}`,
    borderRadius: 8, color: C.text, fontSize: 13,
    fontFamily: PS_FONT,
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: C.muted, marginBottom: 5, display: "flex", alignItems: "center", gap: 5,
  };

  return (
    <div style={{
      padding: 28, maxWidth: 860,
      fontFamily: PS_FONT,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .settings-hero { animation: fadeUp 0.3s ease both; }
        .settings-grid { animation: fadeUp 0.3s ease both; animation-delay: 0.08s; }
        .form-input:focus { border-color: rgba(79,126,255,0.4) !important; }
        .btn-save:hover:not(:disabled) { background: #6490ff !important; }
        .btn-cancel:hover { background: rgba(79,126,255,0.06) !important; }
        .btn-danger:hover { background: rgba(255,71,87,0.12) !important; }
        .avatar-wrap:hover .avatar-overlay { opacity: 1 !important; }
        .avatar-wrap:hover .avatar-img { border-color: ${C.steel} !important; }
      `}</style>

      {/* ── 프로필 히어로 ── */}
      <div className="settings-hero" style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: "24px 28px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 20,
        position: "relative", overflow: "hidden",
      }}>
        {/* radial glow */}
        <div aria-hidden style={{
          position: "absolute", top: -60, right: -60,
          width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(79,126,255,0.05), transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_IMAGE}
          style={{ display: "none" }}
          onChange={handleProfileImageChange}
          disabled={uploadingImage}
        />

        {/* Avatar */}
        <div
          className="avatar-wrap"
          style={{ position: "relative", flexShrink: 0, cursor: "pointer" }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="avatar-img" style={{
            width: 72, height: 72, borderRadius: "50%",
            background: C.surface2, border: `2px solid ${C.borderMd}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", transition: "border-color 0.2s",
          }}>
            {profile.profileImageUrl ? (
              <img
                src={getProfileImageUrl(profile.profileImageUrl)}
                alt="프로필"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => { (e.target as HTMLImageElement).src = getProfileImageUrl(null); }}
              />
            ) : (
              <span style={{ fontSize: 26, fontWeight: 600, color: C.steelLt }}>{initial}</span>
            )}
          </div>
          <div className="avatar-overlay" style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "rgba(0,0,0,0.55)", display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            opacity: 0, transition: "opacity 0.2s", gap: 3,
          }}>
            {uploadingImage
              ? <Loader2 size={18} color="white" style={{ animation: "spin 1s linear infinite" }} />
              : <Camera size={18} color="white" />}
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.8)" }}>변경</span>
          </div>
        </div>

        {/* Hero info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: PS_DISPLAY,
            fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4,
          }}>
            {profile.name || "이름 없음"}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{profile.email ?? ""}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: 20, fontSize: 10,
              background: C.greenDim, border: "1px solid rgba(46,213,115,0.25)", color: C.green,
            }}>
              ✓ Google 연결됨
            </span>
            {joinDate && (
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "3px 9px", borderRadius: 20, fontSize: 10,
                background: C.surface2, border: `1px solid ${C.border}`, color: C.muted,
              }}>
                {joinDate} 가입
              </span>
            )}
          </div>
        </div>

        {/* 이미지 변경 버튼 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <label
            className="btn-cancel"
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 16px", background: "transparent",
              border: `1px solid ${C.borderMd}`, borderRadius: 8,
              color: C.muted, fontSize: 12, fontWeight: 500, cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            <Camera size={13} />
            이미지 변경
            <input
              type="file" accept={ACCEPT_IMAGE} style={{ display: "none" }}
              onChange={handleProfileImageChange} disabled={uploadingImage}
            />
          </label>
          <div style={{ fontSize: 10, color: C.dim, textAlign: "right", lineHeight: 1.6 }}>
            JPG, PNG · 최대 5MB<br />권장 크기 200×200px
          </div>
        </div>
      </div>

      {/* ── 2컬럼 그리드 ── */}
      <div className="settings-grid" style={{
        display: "grid",
        gridTemplateColumns: "1fr 280px",
        gap: 14, alignItems: "start",
      }}>

        {/* ── 좌측: 프로필 편집 ── */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 12, overflow: "hidden",
        }}>
          <div style={{
            padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <User size={14} color={C.steel} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>프로필 편집</span>
          </div>
          <div style={{ padding: 18 }}>

            {/* 이름 */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>
                <User size={11} color={C.dim} /> 이름
              </div>
              <input
                className="form-input"
                style={inputStyle}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="이름"
              />
            </div>

            {/* 소개 */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>
                <FileText size={11} color={C.dim} /> 소개
              </div>
              <textarea
                className="form-input"
                style={{ ...inputStyle, resize: "none", height: 68, lineHeight: 1.5 }}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="간단한 소개 (선택)"
              />
              <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
                고객 갤러리 페이지에 표시됩니다
              </div>
            </div>

            {/* 연락처 */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>
                <Phone size={11} color={C.dim} /> 연락처
              </div>
              <input
                className="form-input"
                style={inputStyle}
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="010-0000-0000"
              />
              <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
                알림 기능 연동 시 사용됩니다 (선택사항)
              </div>
            </div>

            {/* SNS 링크 섹션 구분선 */}
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 1,
              textTransform: "uppercase", color: C.dim,
              marginBottom: 12, marginTop: 20,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              SNS 링크
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            {/* 인스타그램 */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>인스타그램</div>
              <div style={{
                display: "flex", alignItems: "center",
                background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 8, overflow: "hidden",
              }}>
                <span style={{
                  padding: "10px 10px", fontSize: 12, color: C.dim,
                  borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap",
                  background: C.surface3,
                }}>
                  instagram.com/
                </span>
                <input
                  style={{
                    flex: 1, padding: "10px 12px", background: "transparent",
                    border: "none", color: C.text, fontSize: 13,
                    fontFamily: PS_FONT, outline: "none",
                  }}
                  value={editInstagram}
                  onChange={(e) => setEditInstagram(e.target.value)}
                  placeholder="계정명"
                />
              </div>
            </div>

            {/* 포트폴리오 */}
            <div style={{ marginBottom: 0 }}>
              <div style={labelStyle}>
                <Globe size={11} color={C.dim} /> 포트폴리오
              </div>
              <input
                className="form-input"
                style={inputStyle}
                value={editPortfolio}
                onChange={(e) => setEditPortfolio(e.target.value)}
                placeholder="https://..."
              />
            </div>

            {formError && (
              <p style={{ fontSize: 12, color: C.red, marginTop: 12 }}>{formError}</p>
            )}

            {/* 저장 액션 */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              gap: 8, paddingTop: 14,
              borderTop: `1px solid ${C.border}`, marginTop: 18,
            }}>
              <button
                className="btn-cancel"
                onClick={handleCancel}
                style={{
                  padding: "8px 14px", background: "transparent",
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  color: C.muted, fontSize: 12, fontWeight: 500, cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                취소
              </button>
              <button
                className="btn-save"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "8px 18px", background: C.steel,
                  border: "none", borderRadius: 8, color: "white",
                  fontSize: 12, fontWeight: 500,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "background 0.15s",
                }}
              >
                {saving && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
                {saving ? "저장 중..." : "저장하기"}
              </button>
            </div>
          </div>
        </div>

        {/* ── 우측 ── */}
        <div>

          {/* 알림 설정 카드 */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 12, overflow: "hidden", marginBottom: 12,
          }}>
            <div style={{
              padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bell size={14} color={C.steel} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>알림 설정</span>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", padding: "3px 8px",
                background: "rgba(79,126,255,0.08)", border: `1px solid ${C.border}`,
                borderRadius: 20, color: C.dim,
              }}>
                준비 중
              </span>
            </div>
            <div style={{ padding: "12px 18px" }}>
              {[
                { label: "고객 셀렉 완료 알림", desc: "최종 확정 시 알림" },
                { label: "재보정 요청 알림", desc: "재보정 요청 시 알림" },
                { label: "마감 임박 알림", desc: "셀렉 기한 3일 전 알림" },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "11px 0",
                    borderBottom: i < 2 ? `1px solid ${C.border}` : "none",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{item.desc}</div>
                  </div>
                  <button
                    onClick={() => setToast("준비 중인 기능입니다.")}
                    style={{
                      width: 34, height: 19, background: C.surface3,
                      borderRadius: 10, position: "relative",
                      cursor: "pointer", flexShrink: 0, border: "none",
                    }}
                  >
                    <span style={{
                      position: "absolute", top: 2.5, left: 2.5,
                      width: 14, height: 14, borderRadius: "50%", background: "white",
                    }} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 위험 구역 카드 */}
          <div style={{
            background: "rgba(255,71,87,0.03)",
            border: "1px solid rgba(255,71,87,0.15)",
            borderRadius: 12, overflow: "hidden",
          }}>
            <div style={{
              padding: "12px 18px",
              borderBottom: "1px solid rgba(255,71,87,0.1)",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <AlertTriangle size={13} color={C.red} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.red }}>위험 구역</span>
            </div>
            <div style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 2 }}>계정 탈퇴</div>
                  <div style={{ fontSize: 11, color: C.muted }}>모든 데이터가 영구 삭제됩니다</div>
                </div>
                <button
                  className="btn-danger"
                  onClick={() => setShowDeleteModal(true)}
                  style={{
                    padding: "7px 14px", background: "transparent",
                    border: "1px solid rgba(255,71,87,0.3)", borderRadius: 7,
                    color: C.red, fontSize: 12, fontWeight: 500,
                    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                >
                  탈퇴하기
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* 탈퇴 확인 모달 */}
      {showDeleteModal && (
        <DeleteModal
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeleteModal(false)}
          loading={deletingAccount}
        />
      )}
    </div>
  );
}
