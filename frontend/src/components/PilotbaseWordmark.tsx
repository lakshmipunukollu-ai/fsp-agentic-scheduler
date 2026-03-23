type Props = {
  /** Visual height of the wordmark image (width scales). */
  height?: number;
  /** Tight black bar behind type — matches reference (white on black). */
  pill?: boolean;
  className?: string;
};

/**
 * PILOTBASE logotype from brand asset (heavy geometric caps + stylized S).
 */
export default function PilotbaseWordmark({ height = 14, pill = true, className }: Props) {
  const img = (
    <img
      className={className}
      src="/pilotbase-wordmark.png"
      alt="Pilotbase"
      height={height}
      style={{
        display: 'block',
        width: 'auto',
        height,
        maxWidth: 'min(100%, 220px)',
        /* Punch up white type on dark UIs (asset is black-field). */
        filter: 'brightness(1.12) contrast(1.08)',
      }}
      draggable={false}
    />
  );

  if (!pill) return img;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        /* Slightly lifted from pure #000 so it doesn’t vanish on --sidebar-bg */
        background: 'linear-gradient(180deg, #141414 0%, #0a0a0a 100%)',
        padding: '5px 10px',
        borderRadius: 6,
        lineHeight: 0,
        maxWidth: '100%',
        border: '1px solid rgba(255, 255, 255, 0.38)',
        boxShadow: '0 1px 0 rgba(255, 255, 255, 0.06) inset, 0 2px 8px rgba(0, 0, 0, 0.45)',
      }}
    >
      {img}
    </span>
  );
}
