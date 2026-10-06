import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Images, QrCode } from "lucide-react";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { CustomerSelectShell } from "../_lib/CustomerSelectShell";

const TYPES = [
  {
    href: "/customer-select/new/photos",
    icon: Images,
    title: "촬영본 고르기",
    description: "작가님께 받은 원본을 올리고 가족·친구와 함께 고른 뒤 보정 요청을 정리해요.",
  },
  {
    href: "/customer-select/new/guest",
    icon: QrCode,
    title: "하객 사진 모으기",
    description: "QR이나 링크를 공유하면 하객이 앱 설치 없이 찍은 사진과 영상을 보내요. 식이 끝난 뒤 모인 사진을 골라요.",
  },
];

export default async function NewCustomerProjectTypePage() {
  if (!(await getCurrentCustomerAuthId())) redirect("/customer-select/login");

  return (
    <CustomerSelectShell>
      <main className="mx-auto w-full max-w-[840px] px-5 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="text-[24px] font-bold tracking-[-0.04em] md:text-[28px]">어떤 프로젝트를 만들까요?</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">사진을 어떻게 모으고 고를지에 맞춰 골라 주세요.</p>
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TYPES.map(({ href, icon: Icon, title, description }) => (
            <li key={href}>
              <Link href={href} className="group flex h-full flex-col rounded-[24px] border border-border-subtle bg-surface p-6 transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-[0_20px_48px_-12px_rgba(2,56,82,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
                <span className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent"><Icon size={24} strokeWidth={1.8} /></span>
                <strong className="mt-5 text-[18px] font-bold tracking-[-0.02em]">{title}</strong>
                <span className="mt-2 flex-1 text-[14px] leading-6 text-muted-foreground">{description}</span>
                <span className="mt-5 inline-flex items-center gap-1 text-[14px] font-bold text-accent">선택하기<ArrowRight size={16} strokeWidth={2.4} className="transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </CustomerSelectShell>
  );
}
