import Script from "next/script";
import "./auth.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://code.iconify.design/iconify-icon/2.3.0/iconify-icon.min.js"
        strategy="lazyOnload"
      />
      {children}
    </>
  );
}
