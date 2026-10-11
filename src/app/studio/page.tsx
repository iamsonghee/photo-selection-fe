import { EntryPage } from "@/components/entry/EntryPage";
export const metadata = { title: "작가·스튜디오 | A-CUT", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };
export default function StudioLanding() { return <EntryPage space="studio" />; }
