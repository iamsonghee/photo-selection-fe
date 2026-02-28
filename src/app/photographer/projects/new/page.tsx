"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addDays, format, isBefore } from "date-fns";
import { Button, Card, Input } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { createProject, getPhotographerIdByAuthId } from "@/lib/db";

/** catch된 값에서 사용자에게 보여줄 메시지 추출 (Supabase 등 비열거 속성 대응) */
function getErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(Boolean);
    if (parts.length) return parts.join(" ");
    const fromKeys = Object.getOwnPropertyNames(e)
      .map((k) => `${k}: ${(e as Record<string, unknown>)[k]}`)
      .join(", ");
    if (fromKeys) return fromKeys;
  }
  return String(e) || "프로젝트 생성에 실패했습니다.";
}

const deadlineOptions = [
  { label: "7일", days: 7 },
  { label: "14일", days: 14 },
  { label: "30일", days: 30 },
];

const schema = z.object({
  projectName: z.string().min(1, "프로젝트명을 입력하세요"),
  shootDate: z.string().min(1, "촬영 날짜를 선택하세요"),
  deadlineType: z.enum(["quick", "custom"]),
  quickDays: z.number().optional(),
  customDeadline: z.string().optional(),
  customerName: z.string().min(1, "고객명을 입력하세요"),
  requiredCount: z.number().min(1, "1 이상이어야 합니다"),
}).refine(
  (data) => {
    if (data.deadlineType === "custom" && data.customDeadline) {
      return !isBefore(new Date(data.customDeadline), new Date());
    }
    return true;
  },
  { message: "기한은 오늘 이후여야 합니다", path: ["customDeadline"] }
);

type FormData = z.infer<typeof schema>;

export default function NewProjectPage() {
  const router = useRouter();
  const [deadlineType, setDeadlineType] = useState<"quick" | "custom">("quick");
  const [quickDays, setQuickDays] = useState<number>(14);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const today = format(new Date(), "yyyy-MM-dd");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      deadlineType: "quick",
      quickDays: 14,
    },
  });

  const customDeadline = watch("customDeadline");
  const resolvedDeadline =
    deadlineType === "quick"
      ? addDays(new Date(), quickDays)
      : customDeadline
        ? new Date(customDeadline)
        : null;
  const daysLabel = resolvedDeadline
    ? `D+${Math.max(0, Math.ceil((resolvedDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}`
    : "";

  const onSubmit = async (data: FormData) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("로그인이 필요합니다.");
    const photographerId = await getPhotographerIdByAuthId(user.id);
    if (!photographerId) throw new Error("사진작가 계정 정보를 찾을 수 없습니다.");
    setAuthError(null);
    setSubmitting(true);
    try {
      const deadline =
        deadlineType === "quick"
          ? addDays(new Date(), quickDays)
          : data.customDeadline
            ? new Date(data.customDeadline)
            : addDays(new Date(), 14);
      const id = await createProject({
        name: data.projectName,
        customer_name: data.customerName,
        shoot_date: data.shootDate,
        deadline: format(deadline, "yyyy-MM-dd"),
        required_count: data.requiredCount,
        photographer_id: photographerId,
      });
      await fetch("/api/photographer/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "created" }),
      }).catch(() => {});
      router.push(`/photographer/projects/${id}/upload`);
    } catch (e) {
      const msg = getErrorMessage(e);
      console.error("[프로젝트 생성 실패]", msg, e);
      setAuthError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[440px] space-y-8">
      <h1 className="text-2xl font-semibold text-white">새 프로젝트</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Input
          label="프로젝트명"
          placeholder="예: 웨딩 스튜디오 A"
          error={errors.projectName?.message}
          {...register("projectName")}
        />

        <Input
          label="촬영 날짜"
          type="date"
          error={errors.shootDate?.message}
          {...register("shootDate")}
        />

        <Card>
          <p className="mb-3 text-sm font-medium text-zinc-300">기한 설정</p>
          <div className="flex gap-2 border-b border-zinc-800 pb-3">
            <button
              type="button"
              onClick={() => setDeadlineType("quick")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                deadlineType === "quick" ? "bg-[#4f7eff]/20 text-[#4f7eff]" : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              빠른 선택
            </button>
            <button
              type="button"
              onClick={() => setDeadlineType("custom")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                deadlineType === "custom" ? "bg-[#4f7eff]/20 text-[#4f7eff]" : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              날짜 직접 지정
            </button>
          </div>
          {deadlineType === "quick" ? (
            <div className="mt-3 flex gap-2">
              {deadlineOptions.map(({ label, days }) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    setQuickDays(days);
                    setValue("quickDays", days);
                  }}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                    quickDays === days
                      ? "border-[#4f7eff] bg-[#4f7eff]/20 text-[#4f7eff]"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <Input
                type="date"
                min={today}
                error={errors.customDeadline?.message}
                {...register("customDeadline")}
              />
            </div>
          )}
          {resolvedDeadline && (
            <p className="mt-3 text-sm text-zinc-400">
              기한: {format(resolvedDeadline, "yyyy-MM-dd")} ({daysLabel})
            </p>
          )}
        </Card>

        <Input
          label="고객명"
          placeholder="고객 이름"
          error={errors.customerName?.message}
          {...register("customerName")}
        />

        <Input
          label="셀렉 갯수 (N)"
          type="number"
          min={1}
          placeholder="예: 200"
          error={errors.requiredCount?.message}
          {...register("requiredCount", { valueAsNumber: true })}
        />
        <p className="-mt-2 text-xs text-zinc-500">일반적으로 150~300장을 추천합니다</p>

        {authError && (
          <p className="text-sm text-red-400">{authError}</p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!isValid || submitting}
        >
          {submitting ? "생성 중..." : "프로젝트 생성"}
        </Button>
      </form>
    </div>
  );
}
