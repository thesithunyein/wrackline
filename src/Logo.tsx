import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTitle?: boolean;
}

// The mark is built from a handful of big, flat shapes: at 32px it still reads as
// a breaking wave over a wrack line, which the old sixteen-piece badge did not.
export const WracklineMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 64 64"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="WRACKLINE"
  >
    <defs>
      <clipPath id="wl-badge-clip">
        <circle cx="32" cy="32" r="28" />
      </clipPath>
    </defs>

    <g clipPath="url(#wl-badge-clip)">
      {/* Sky */}
      <rect x="0" y="0" width="64" height="64" fill="#CFE7F6" />

      {/* Sun */}
      <circle cx="18" cy="19" r="6.2" fill="#F6C445" stroke="#17181C" strokeWidth="2.3" />

      {/* The sea */}
      <path d="M0 45.5 L64 43.5 L64 60 L0 60 Z" fill="#1A85B6" />
      <path d="M0 45.5 L64 43.5" fill="none" stroke="#17181C" strokeWidth="2.6" />

      {/* The breaker: a swell whose lip curls forward over its own face */}
      <path
        d="M7 45 C11 43.5 15 40 19.5 35 C24 30 28.5 25.5 34 23 C39 21 43.5 22 47 25.5 C50 28.5 51 32.5 49.5 35.5 C47.5 33 44.5 32 41.5 32.5 C38.5 33 36.5 35 36 38 C35 41.5 34 44 33 45 Z"
        fill="#1A85B6"
      />
      <path
        d="M7 45 C11 43.5 15 40 19.5 35 C24 30 28.5 25.5 34 23 C39 21 43.5 22 47 25.5 C50 28.5 51 32.5 49.5 35.5 C47.5 33 44.5 32 41.5 32.5 C38.5 33 36.5 35 36 38 C35 41.5 34 44 33 45"
        fill="none"
        stroke="#17181C"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Foam along the curling crest, and spray off the lip */}
      <path
        d="M26.5 32.5 C30.5 25.8 38 23 43.5 25.2 C47 26.6 49.3 29.5 50 32.8 C47.5 30 43 29.8 37.5 30.2 C32.5 30.6 28.8 31.4 26.5 32.5 Z"
        fill="#FFFFFF"
      />
      <path d="M53 25 L56.5 27.5 L54 31 Z" fill="#FFFFFF" />
      <path d="M57 31 L60.5 33.5 L58 37 Z" fill="#FFFFFF" />

      {/* Beach, with the day's wrack left on it */}
      <path
        d="M0 52 L64 45.5 L64 64 L0 64 Z"
        fill="#E7D3A4"
        stroke="#17181C"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <rect
        x="10"
        y="53"
        width="12"
        height="2.6"
        rx="1.3"
        fill="#BFAE93"
        stroke="#17181C"
        strokeWidth="1.6"
        transform="rotate(-4 16 54)"
      />
      <circle cx="33" cy="56.6" r="1.8" fill="#B8A98F" stroke="#17181C" strokeWidth="1.5" />
      <circle cx="39" cy="55.6" r="1.4" fill="#E25B45" stroke="#17181C" strokeWidth="1.5" />
      <circle cx="44.5" cy="57.2" r="1.6" fill="#767E88" stroke="#17181C" strokeWidth="1.5" />
    </g>

    {/* Ink ring, drawn last so nothing overlaps it */}
    <circle cx="32" cy="32" r="28.6" fill="none" stroke="#17181C" strokeWidth="2.8" />
  </svg>
);

export const WracklineLogo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showTitle = true
}) => {
  const iconSizes = {
    sm: 'w-11 h-11',
    md: 'w-16 h-16 md:w-18 md:h-18',
    lg: 'w-24 h-24'
  };

  const titleSizes = {
    sm: 'text-3xl',
    md: 'text-5xl md:text-6xl',
    lg: 'text-6xl md:text-7xl'
  };

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <div className={`${iconSizes[size]} drop-shadow-md mb-3 md:mb-4`}>
        <WracklineMark className="w-full h-full" />
      </div>

      {showTitle && (
        <h1
          className={`font-game text-[#17181C] leading-none ${titleSizes[size]} drop-shadow-sm`}
          style={{ letterSpacing: '0.04em' }}
        >
          WRACKLINE
        </h1>
      )}
    </div>
  );
};
