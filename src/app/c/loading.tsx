import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";

/** 고객 token layout 자체가 서버에서 준비되는 동안에도 root dark fallback을 노출하지 않는다. */
export default function CustomerLoading() {
  return <SystemLoadingScreen />;
}
