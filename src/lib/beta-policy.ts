import { isAdminEmail } from "@/lib/admin-emails";
import type { AppSettings } from "@/lib/app-settings";

export type PhotographerTier = "admin" | "beta" | "general";

export type BetaStatus = "not_invited" | "active" | "ended" | "suspended";

export interface PhotographerTierInput {
  email: string | null;
  betaStatus: BetaStatus;
  betaEndDate: string | null;
}

export interface PhotographerPolicy {
  tier: PhotographerTier;
  /** null = 무제한 */
  maxProjects: number | null;
  /** null = 무제한 */
  maxPhotosPerProject: number | null;
  /** null = 무제한. 현재 등급 구분 없이 동일한 값 적용(beta 한도를 그대로 씀). */
  maxRevisionCount: number | null;
}

/** 베타 상태가 지금 시점에 실제로 유효한지(기간 만료 포함) */
export function isBetaActive(input: Pick<PhotographerTierInput, "betaStatus" | "betaEndDate">): boolean {
  if (input.betaStatus !== "active") return false;
  if (!input.betaEndDate) return true;
  const today = new Date().toISOString().slice(0, 10);
  return input.betaEndDate >= today;
}

export function getEffectiveTier(input: PhotographerTierInput): PhotographerTier {
  if (isAdminEmail(input.email)) return "admin";
  if (isBetaActive(input)) return "beta";
  return "general";
}

export function getPolicyForPhotographer(
  input: PhotographerTierInput,
  limits: AppSettings
): PhotographerPolicy {
  const tier = getEffectiveTier(input);
  if (tier === "admin") {
    return { tier, maxProjects: null, maxPhotosPerProject: null, maxRevisionCount: null };
  }
  if (tier === "beta") {
    return {
      tier,
      maxProjects: limits.betaMaxProjectsTotal,
      maxPhotosPerProject: limits.betaMaxPhotosPerProject,
      maxRevisionCount: limits.betaMaxRevisionCount,
    };
  }
  return {
    tier,
    maxProjects: limits.generalMaxProjects,
    maxPhotosPerProject: limits.generalMaxPhotosPerProject,
    maxRevisionCount: limits.betaMaxRevisionCount,
  };
}
