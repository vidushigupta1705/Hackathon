export default function Logo({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeOpacity="0.65" strokeWidth="1" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
