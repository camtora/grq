import type { CSSProperties } from "react";

/** The GRQ bull logo, recolored. The PNG is a transparent silhouette, so we use its alpha as a CSS
 *  mask and paint it with a solid `color` — giving each bull its own tinted bull instead of a dot. */
export default function BullMark({
  color,
  className,
  style,
  title,
}: {
  color: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={`inline-block ${className ?? ""}`}
      style={{
        backgroundColor: color,
        WebkitMaskImage: "url(/bull-splash.png)",
        maskImage: "url(/bull-splash.png)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        ...style,
      }}
    />
  );
}
