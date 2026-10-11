import { EntryPage } from "@/components/entry/EntryPage";
export const metadata = { title: "내 사진 셀렉 | A-CUT", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };
export default function SelectLanding() { return <EntryPage space="select" />; }
