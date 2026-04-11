"use client";

import type { ProjectStatus } from "@/types";

interface StatusPillProps {
  status: ProjectStatus;
  photoCount?: number;
  requiredCount?: number;
}

type DotType = "filled" | "outline" | "ping-orange" | "ping-white" | "check";

type PillVariant = {
  label: string;
  pillStyle: React.CSSProperties;
  dotType: DotType;
  dotStyle?: React.CSSProperties;
  textStyle: React.CSSProperties;
};

function getVariant(
  status: ProjectStatus,
  photoCount: number,
  requiredCount: number
): PillVariant {
  if (status === "preparing") {
    if (photoCount === 0) {
      return {
        label: "업로드전",
        pillStyle: { border: "1px solid rgba(39,39,42,0.8)", background: "#111", opacity: 0.7 },
        dotType: "filled",
        dotStyle: { background: "#3f3f46" },
        textStyle: { fontWeight: 500, color: "#71717a" },
      };
    }
    if (photoCount < requiredCount) {
      return {
        label: "업로드중",
        pillStyle: { border: "1px solid #27272a", background: "#151515" },
        dotType: "outline",
        dotStyle: { border: "1px solid #71717a" },
        textStyle: { fontWeight: 500, color: "#a1a1aa" },
      };
    }
    return {
      label: "초대대기",
      pillStyle: { border: "1px solid #3f3f46", background: "#1A1A1A" },
      dotType: "filled",
      dotStyle: { background: "#a1a1aa" },
      textStyle: { fontWeight: 500, color: "#d4d4d8" },
    };
  }

  switch (status) {
    case "selecting":
      return {
        label: "셀렉중",
        pillStyle: { border: "1px solid #3f3f46", background: "#151515" },
        dotType: "outline",
        dotStyle: { border: "1px solid rgba(255,77,0,0.6)" },
        textStyle: { fontWeight: 500, color: "#d4d4d8" },
      };
    case "confirmed":
      return {
        label: "보정대기",
        pillStyle: { border: "1px solid #52525b", background: "#1A1A1A" },
        dotType: "outline",
        dotStyle: { border: "1px solid #FF4D00" },
        textStyle: { fontWeight: 500, color: "#e4e4e7" },
      };
    case "editing":
      return {
        label: "보정중",
        pillStyle: { border: "1px solid #3f3f46", background: "#1A1A1A" },
        dotType: "filled",
        dotStyle: { background: "#FF4D00", boxShadow: "0 0 5px rgba(255,77,0,0.4)" },
        textStyle: { fontWeight: 600, color: "#fff" },
      };
    case "reviewing_v1":
      return {
        label: "검토중",
        pillStyle: { border: "1px solid rgba(255,77,0,0.3)", background: "rgba(255,77,0,0.05)" },
        dotType: "filled",
        dotStyle: { background: "#FF4D00", boxShadow: "0 0 8px rgba(255,77,0,0.6)" },
        textStyle: { fontWeight: 600, color: "#FF4D00" },
      };
    case "editing_v2":
      return {
        label: "재보정",
        pillStyle: {
          border: "1px solid rgba(255,77,0,0.5)",
          background: "rgba(255,77,0,0.1)",
          boxShadow: "0 0 10px rgba(255,77,0,0.1)",
        },
        dotType: "ping-orange",
        textStyle: { fontWeight: 700, color: "#FF4D00" },
      };
    case "reviewing_v2":
      return {
        label: "재검토",
        pillStyle: {
          border: "1px solid rgba(255,77,0,0.8)",
          background: "rgba(255,77,0,0.2)",
          boxShadow: "0 0 12px rgba(255,77,0,0.2)",
        },
        dotType: "ping-white",
        textStyle: { fontWeight: 700, color: "#FF4D00" },
      };
    case "delivered":
      return {
        label: "납품완료",
        pillStyle: {
          border: "1px solid #FF4D00",
          background: "rgba(255,77,0,0.05)",
          boxShadow: "0 0 15px rgba(255,77,0,0.15)",
        },
        dotType: "check",
        textStyle: { fontWeight: 900, color: "#FF4D00" },
      };
  }
}

function Dot({ type, dotStyle }: { type: DotType; dotStyle?: React.CSSProperties }) {
  if (type === "check") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={3}
        stroke="#FF4D00"
        style={{ width: 12, height: 12, flexShrink: 0 }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    );
  }

  if (type === "ping-orange") {
    return (
      <div className="relative flex" style={{ width: 8, height: 8, flexShrink: 0 }}>
        <span
          className="animate-ping absolute inline-flex rounded-full"
          style={{ width: "100%", height: "100%", background: "#FF4D00", opacity: 0.75 }}
        />
        <span
          className="relative inline-flex rounded-full"
          style={{ width: 8, height: 8, background: "#FF4D00" }}
        />
      </div>
    );
  }

  if (type === "ping-white") {
    return (
      <div className="relative flex" style={{ width: 8, height: 8, flexShrink: 0 }}>
        <span
          className="animate-ping absolute inline-flex rounded-full"
          style={{ width: "100%", height: "100%", background: "#fff", opacity: 0.75 }}
        />
        <span
          className="relative inline-flex rounded-full"
          style={{ width: 8, height: 8, background: "#FF4D00", border: "1px solid rgba(255,255,255,0.5)" }}
        />
      </div>
    );
  }

  // filled or outline
  return (
    <div
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        flexShrink: 0,
        background: "transparent",
        ...dotStyle,
      }}
    />
  );
}

export function StatusPill({ status, photoCount = 0, requiredCount = 0 }: StatusPillProps) {
  const variant = getVariant(status, photoCount, requiredCount);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: status === "delivered" ? 6 : 8,
        padding: "5px 12px",
        borderRadius: 9999,
        flexShrink: 0,
        fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
        ...variant.pillStyle,
      }}
    >
      <Dot type={variant.dotType} dotStyle={variant.dotStyle} />
      <span style={{ fontSize: 12, lineHeight: 1, ...variant.textStyle }}>
        {variant.label}
      </span>
    </div>
  );
}
