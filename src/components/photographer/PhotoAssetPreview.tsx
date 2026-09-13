import type { ReactNode, HTMLAttributes, CSSProperties } from "react";
import { PhotoThumbnailFrame } from "@/components/ui/PhotoThumbnailFrame";
import { TruncatedTextTooltip } from "@/components/ui/TruncatedTextTooltip";
import styles from "./PhotoAssetPreview.module.css";

export const PHOTO_ASSET_MEDIA_ASPECT_RATIO = 218.32 / 150.7;

type Props = {
  filename: string;
  /** Undefined uses the shared filename; null hides the header. */
  header?: ReactNode;
  active?: boolean;
  mediaProps?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
};

/** Filename and image presentation shared by selected and retouched photos. */
export function PhotoAssetPreview({ filename, header, active, mediaProps, children }: Props) {
  const { className = "", style, ...rest } = mediaProps ?? {};
  return <>
    {header === undefined ? <span className={styles.filenameRow} title={filename} data-photo-asset-filename><TruncatedTextTooltip text={filename} className={styles.filename} /></span> : header}
    <PhotoThumbnailFrame {...rest} style={{ "--photo-asset-aspect": PHOTO_ASSET_MEDIA_ASPECT_RATIO, ...style } as CSSProperties} className={`${styles.media} ${className}`} active={active} ringLayer={6}>
      {children}
    </PhotoThumbnailFrame>
  </>;
}
