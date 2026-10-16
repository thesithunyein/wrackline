import React from 'react';
import { MARK_INNER_SVG, MARK_VIEWBOX } from './logoMark';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTitle?: boolean;
}

// The mark is built from a handful of big, flat shapes: at 32px it still reads as a
// breaking wave over a wrack line, which the old sixteen-piece badge did not.
//
// The shapes themselves live in logoMark.ts, because the share card rasterises the same
// mark onto a canvas. Two copies of these paths would drift the moment either changed.
export const WracklineMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox={MARK_VIEWBOX}
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="WRACKLINE"
    dangerouslySetInnerHTML={{ __html: MARK_INNER_SVG }}
  />
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
