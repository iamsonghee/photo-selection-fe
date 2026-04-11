import type { LucideIcon } from "lucide-react";
import { Baby, Briefcase, Camera, GraduationCap, Heart } from "lucide-react";

/** `/photographer/projects/new` 와 동일 — DB `shoot_type` 값과 매칭 */
export const SHOOT_TYPES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "wedding", label: "웨딩", icon: Heart },
  { value: "family", label: "가족·베이비", icon: Baby },
  { value: "graduation", label: "졸업·기념", icon: GraduationCap },
  { value: "profile", label: "프로필·증명", icon: Briefcase },
  { value: "etc", label: "기타", icon: Camera },
];
