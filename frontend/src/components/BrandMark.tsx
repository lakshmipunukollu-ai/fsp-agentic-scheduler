type Props = {
  size?: number;
  className?: string;
};

/**
 * Stylized “S” mark — warm orange/yellow gradient on dark field (provided brand asset).
 */
export default function BrandMark({ size = 36, className }: Props) {
  return (
    <img
      className={className}
      src="/brand-s.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      style={{
        display: 'block',
        borderRadius: Math.max(8, Math.round(size * 0.22)),
        objectFit: 'contain',
      }}
    />
  );
}
