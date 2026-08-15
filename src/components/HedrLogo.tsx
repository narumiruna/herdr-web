interface HedrLogoProps {
  compact?: boolean;
}

export function HedrLogo({ compact = false }: HedrLogoProps) {
  return (
    <div className="brand-lockup">
      <svg
        className="brand-mark"
        viewBox="0 0 64 64"
        role="img"
        aria-label="Hedr terminal mark"
      >
        <rect
          x="5"
          y="8"
          width="54"
          height="48"
          rx="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
        />
        <path
          d="M17 21v25m13-25v25M17 33.5h13"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5"
        />
        <path
          d="m39 27 7 7-7 7m5 5h8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
      </svg>
      {!compact && (
        <div className="brand-type">
          <strong>herdr-web</strong>
        </div>
      )}
    </div>
  );
}
