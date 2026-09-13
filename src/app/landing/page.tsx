import { LandingPageClient } from "./LandingPageClient";
import { SAMPLE_PLAN_LIMITS } from "./sample-project";

export default function LandingPage() {
  return <LandingPageClient limits={SAMPLE_PLAN_LIMITS} />;
}
