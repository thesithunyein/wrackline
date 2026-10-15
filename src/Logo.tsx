import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTitle?: boolean;
}

export const WracklineLogo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showTitle = true
}) => {
  const iconSizes = {
    sm: 'w-12 h-12',
    md: 'w-18 h-18',
    lg: 'w-24 h-24'
  };

  const titleSizes = {
    sm: 'text-3xl',
    md: 'text-5xl md:text-6xl',
    lg: 'text-6xl md:text-7xl'
  };

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      {/* Crisp Low-Poly 3D Art Emblem */}
      <div className={`relative mb-3 ${iconSizes[size]} drop-shadow-lg`}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Faceted Low-Poly Sun Disc (Dodecagonal Polygon) */}
          <polygon
            points="50,4 73,11 90,27 96,50 90,73 73,90 50,96 27,90 10,73 4,50 10,27 27,11"
            fill="#FFF9EE"
            stroke="#17181C"
            strokeWidth="3.5"
            strokeLinejoin="bevel"
          />

          {/* Low-Poly Sky Facet Shading */}
          <polygon points="50,4 73,11 90,27 50,50" fill="#E8F4FC" />
          <polygon points="90,27 96,50 50,50" fill="#D6ECF9" />
          <polygon points="10,27 50,4 50,50" fill="#F4FAFE" />
          <polygon points="4,50 10,27 50,50" fill="#E2F1FB" />

          {/* Low-Poly Ocean Horizon Facets */}
          <polygon points="4,50 50,50 36,64 10,73" fill="#24648F" stroke="#17181C" strokeWidth="2" strokeLinejoin="bevel" />
          <polygon points="50,50 96,50 90,73 64,64" fill="#1C5377" stroke="#17181C" strokeWidth="2" strokeLinejoin="bevel" />
          <polygon points="36,64 50,50 64,64 50,78" fill="#194B6D" stroke="#17181C" strokeWidth="2" strokeLinejoin="bevel" />

          {/* Low-Poly Breaker Wave - Sharp Triangular Facets */}
          {/* Main Wave Body */}
          <polygon points="14,66 38,36 56,48 34,74" fill="#3B8BB8" stroke="#17181C" strokeWidth="2.5" strokeLinejoin="bevel" />
          <polygon points="38,36 68,34 56,48" fill="#58A3CE" stroke="#17181C" strokeWidth="2" strokeLinejoin="bevel" />
          <polygon points="68,34 82,42 70,54 56,48" fill="#2E79A3" stroke="#17181C" strokeWidth="2" strokeLinejoin="bevel" />

          {/* Curling Low-Poly Wave Lip & Crest */}
          <polygon points="68,34 76,28 84,36 82,42" fill="#EAF6FD" stroke="#17181C" strokeWidth="2.5" strokeLinejoin="bevel" />
          <polygon points="76,28 66,24 68,34" fill="#FFFFFF" stroke="#17181C" strokeWidth="2" strokeLinejoin="bevel" />
          <polygon points="56,48 70,54 62,62 48,58" fill="#26698F" stroke="#17181C" strokeWidth="2" strokeLinejoin="bevel" />

          {/* Low-Poly Foam Chips */}
          <polygon points="84,36 92,38 88,44" fill="#FFFFFF" stroke="#17181C" strokeWidth="1.5" />
          <polygon points="78,46 84,50 78,54" fill="#E2F2FC" stroke="#17181C" strokeWidth="1.5" />

          {/* Low-Poly Driftwood Block */}
          <polygon points="26,72 58,66 66,72 34,78" fill="#CBB17E" stroke="#17181C" strokeWidth="2.5" strokeLinejoin="bevel" />
          <polygon points="34,78 66,72 62,78 30,84" fill="#A88B58" stroke="#17181C" strokeWidth="2.5" strokeLinejoin="bevel" />
          <polygon points="58,66 66,72 62,78" fill="#8C7142" stroke="#17181C" strokeWidth="2" strokeLinejoin="bevel" />

          {/* Low-Poly Golden Treasure Star/Diamond */}
          <polygon points="72,60 78,54 84,60 78,66" fill="#F6C445" stroke="#17181C" strokeWidth="2" strokeLinejoin="bevel" />
          <polygon points="72,60 78,54 78,60" fill="#FFE58F" />
          <polygon points="78,60 84,60 78,66" fill="#D49A24" />
        </svg>
      </div>

      {/* Clean Game Title */}
      {showTitle && (
        <h1
          className={`font-game text-[#17181C] tracking-wide leading-none ${titleSizes[size]} drop-shadow-sm`}
          style={{ letterSpacing: '0.05em' }}
        >
          WRACKLINE
        </h1>
      )}
    </div>
  );
};
