interface HerdrLogoProps {
  compact?: boolean;
}

export function HerdrLogo({ compact = false }: HerdrLogoProps) {
  return (
    <div className="brand-lockup">
      <svg
        className="brand-mark"
        viewBox="0 0 64 64"
        role="img"
        aria-label="Herdr sheep"
      >
        <path
          d="M33.8 11.4c-6.4 0-11.7 3.5-14.1 8.5-1.1-.6-2.4-.9-3.8-.9-4.7 0-8.5 3.8-8.5 8.5 0 2.6 1.2 5 3.1 6.5-1.1 1.6-1.7 3.5-1.7 5.5 0 5.5 4.5 10 10 10h2.5v5.7a2.8 2.8 0 0 0 5.6 0v-5.7h12v5.7a2.8 2.8 0 0 0 5.6 0v-6.4c4.2-1.5 7.2-5.5 7.2-10.2V25.2a10 10 0 0 0-10-10c-1.1 0-2.2.2-3.2.5a15 15 0 0 0-4.7-4.3Z"
          fill="currentColor"
        />
        <path
          d="M44.4 19.6c5.6 1.1 9.8 6 9.8 11.9v3.2c0 4.7-3.8 8.5-8.5 8.5h-4.5c-4.6 0-8.3-3.7-8.3-8.3 0-3.7 2.4-6.8 5.8-7.9 1.3-.4 2.5-.2 3.4.7.8.8.8 2.2 0 3-.6.7-1.6.9-2.5.7-1.2-.2-2.3.7-2.3 2 0 2.8 2.3 5 5 5h2.6c2 0 3.6-1.6 3.6-3.6v-3.6c0-3.1-2-5.9-4.9-6.9-1.3-.5-2-1.9-1.5-3.2.3-1 1.3-1.7 2.3-1.5Z"
          fill="var(--brand-cutout)"
        />
        <circle cx="46.2" cy="28.7" r="1.7" fill="currentColor" />
      </svg>
      {!compact && (
        <div className="brand-type">
          <strong>herdr</strong>
        </div>
      )}
    </div>
  );
}
