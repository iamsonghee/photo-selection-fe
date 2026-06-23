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
        pillStyle: { border: "1px solid var(--border-subtle)", background: "var(--surface)" },
        dotType: "filled",
        dotStyle: { background: "var(--border-strong)" },
        textStyle: { fontWeight: 500, color: "var(--subtle-foreground)" },
      };
    }
    if (photoCount < requiredCount) {
      return {
        label: "업로드중",
        pillStyle: { border: "1px solid var(--border-subtle)", background: "var(--surface)" },
        dotType: "outline",
        dotStyle: { border: "1px solid var(--subtle-foreground)" },
        textStyle: { fontWeight: 500, color: "var(--subtle-foreground)" },
      };
    }
    return {
      label: "초대대기",
      pillStyle: { border: "1px solid var(--border)", background: "var(--surface)" },
      dotType: "filled",
      dotStyle: { background: "var(--subtle-foreground)" },
      textStyle: { fontWeight: 500, color: "var(--muted-foreground)" },
    };
  }

  switch (status) {
    case "selecting":
      return {
        label: "셀렉중",
        pillStyle: { border: "1px solid var(--border)", background: "var(--surface)" },
        dotType: "outline",
        dotStyle: { border: "1px solid rgba(var(--accent-rgb), 0.6)" },
        textStyle: { fontWeight: 500, color: "var(--foreground)" },
      };
    case "confirmed":
      return {
        label: "보정대기",
        pillStyle: { border: "1px solid var(--border-strong)", background: "var(--surface)" },
        dotType: "outline",
        dotStyle: { border: "1px solid var(--accent)" },
        textStyle: { fontWeight: 500, color: "var(--foreground)" },
      };
    case "editing":
      return {
        label: "보정중",
        pillStyle: { border: "1px solid var(--border)", background: "var(--surface)" },
        dotType: "filled",
        dotStyle: { background: "var(--accent)", boxShadow: "0 0 5px rgba(var(--accent-rgb), 0.4)" },
        textStyle: { fontWeight: 600, color: "var(--foreground)" },
      };
    case "reviewing_v1":
      return {
        label: "검토중",
        pillStyle: { border: "1px solid rgba(var(--accent-rgb), 0.3)", background: "rgba(var(--accent-rgb), 0.05)" },
        dotType: "filled",
        dotStyle: { background: "var(--accent)", boxShadow: "0 0 8px rgba(var(--accent-rgb), 0.6)" },
        textStyle: { fontWeight: 600, color: "var(--accent)" },
      };
    case "editing_v2":
      return {
        label: "재보정",
        pillStyle: {
          border: "1px solid rgba(var(--accent-rgb), 0.5)",
          background: "rgba(var(--accent-rgb), 0.1)",
          boxShadow: "0 0 10px rgba(var(--accent-rgb), 0.1)",
        },
        dotType: "ping-orange",
        textStyle: { fontWeight: 700, color: "var(--accent)" },
      };
    case "reviewing_v2":
      return {
        label: "재검토",
        pillStyle: {
          border: "1px solid rgba(var(--accent-rgb), 0.8)",
          background: "rgba(var(--accent-rgb), 0.2)",
          boxShadow: "0 0 12px rgba(var(--accent-rgb), 0.2)",
        },
        dotType: "ping-white",
        textStyle: { fontWeight: 700, color: "var(--accent)" },
      };
    case "delivered":
      return {
        label: "납품완료",
        pillStyle: {
          border: "1px solid var(--accent)",
          background: "rgba(var(--accent-rgb), 0.05)",
          boxShadow: "0 0 15px rgba(var(--accent-rgb), 0.15)",
        },
        dotType: "check",
        textStyle: { fontWeight: 900, color: "var(--accent)" },
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
        stroke="var(--accent)"
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
          style={{ width: "100%", height: "100%", background: "var(--accent)", opacity: 0.75 }}
        />
        <span
          className="relative inline-flex rounded-full"
          style={{ width: 8, height: 8, background: "var(--accent)" }}
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
          style={{ width: 8, height: 8, background: "var(--accent)", border: "1px solid rgba(255,255,255,0.5)" }}
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
