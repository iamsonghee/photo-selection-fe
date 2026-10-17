import posters from "./posters.json";
import "./landing-poster.css";

export function LandingPoster({ name, alt, eager = false, className = "" }: {
  name: keyof typeof posters;
  alt: string;
  eager?: boolean;
  className?: string;
}) {
  const { desktop, mobile } = posters[name];
  return <picture className={`landing-poster ${className}`}>
    <source media="(max-width: 700px)" srcSet={`/landing/posters/${name}-mobile.webp`} width={mobile.width} height={mobile.height} />
    <img src={`/landing/posters/${name}-desktop.webp`} width={desktop.width} height={desktop.height} alt={alt}
      loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" />
  </picture>;
}
