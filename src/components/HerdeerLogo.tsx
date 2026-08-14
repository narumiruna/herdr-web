interface HerdeerLogoProps {
  compact?: boolean;
}

export function HerdeerLogo({ compact = false }: HerdeerLogoProps) {
  return (
    <div className="brand-lockup">
      <svg
        className="brand-mark"
        viewBox="0 0 64 64"
        role="img"
        aria-label="Herdeer deer"
      >
        <path
          d="M23 24C17 21 13 15 14 8m4 11-8-2m8-2 3-7m20 16c6-3 10-9 9-16m-4 11 8-2m-8-2-3-7"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        <path
          d="m22 24-9-3c-2.7-.9-4.5 2.4-2.4 4.3l9.2 8.4M42 24l9-3c2.7-.9 4.5 2.4 2.4 4.3l-9.2 8.4"
          fill="currentColor"
        />
        <path
          d="M32 18c-8.7 0-14 6.1-14 15.1 0 10.4 6.5 21.2 14 24.9 7.5-3.7 14-14.5 14-24.9C46 24.1 40.7 18 32 18Z"
          fill="currentColor"
        />
        <circle cx="26.5" cy="34" r="1.8" fill="var(--brand-cutout)" />
        <circle cx="37.5" cy="34" r="1.8" fill="var(--brand-cutout)" />
        <path
          d="M27 45.5c2.9 2.4 7.1 2.4 10 0"
          fill="none"
          stroke="var(--brand-cutout)"
          strokeLinecap="round"
          strokeWidth="2.5"
        />
      </svg>
      {!compact && (
        <div className="brand-type">
          <strong>herdeer</strong>
        </div>
      )}
    </div>
  );
}
