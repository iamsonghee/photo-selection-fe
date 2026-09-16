import type { SVGProps } from "react";

/** A-CUT recommendation mark: a geometric A with a diagonal cut, independent of fonts. */
export function RecommendationMark({ size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path fillRule="evenodd" clipRule="evenodd" d="M2 21 9 3h6l3.1 8-2.8.8.7 2 2.9-.8L22 21h-5l-1.5-4h-7L7 21H2Zm8-8h4l-2-6-2 6Z" />
    </svg>
  );
}
