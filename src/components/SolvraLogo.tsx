import React from 'react';

interface SolvraLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  showText?: boolean;
  className?: string;
  theme?: 'dark' | 'light';
}

/**
 * Solvra official brand logo component.
 * Features the magnifying glass with gold coins and sprouted green leaves,
 * with the signature golden delta in the letter 'A' and the brand tagline:
 * "CLARITY TODAY. PROSPERITY TOMORROW."
 */
export function SolvraLogo({
  size = 'md',
  showTagline = false,
  showText = true,
  className = '',
  theme = 'light',
}: SolvraLogoProps) {
  const iconSizes = {
    xs: 'h-6 w-6',
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14',
    xl: 'h-20 w-20',
  };

  const textSizes = {
    xs: 'text-sm tracking-wider',
    sm: 'text-base tracking-widest',
    md: 'text-xl tracking-widest font-black',
    lg: 'text-3xl tracking-widest font-black',
    xl: 'text-4xl tracking-widest font-black',
  };

  const taglineSizes = {
    xs: 'text-[7px] tracking-[0.2em]',
    sm: 'text-[8px] tracking-[0.22em]',
    md: 'text-[9px] tracking-[0.25em]',
    lg: 'text-[11px] tracking-[0.28em]',
    xl: 'text-xs tracking-[0.3em]',
  };

  const isDark = theme === 'dark';
  const textColor = isDark ? 'text-white' : 'text-[#0C3826]';
  const tagColor = isDark ? 'text-emerald-300/80' : 'text-[#2D5A45]';

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {/* Brand Icon (Magnifying glass + Gold coins + Green leaves sprout) */}
      <div className={`relative shrink-0 ${iconSizes[size]} rounded-full overflow-hidden shadow-sm border border-emerald-900/10`}>
        <img
          src="/solvra-logo.jpg"
          alt="Solvra Emblem"
          className="h-full w-full object-cover object-center"
          onError={(e) => {
            // Fallback SVG if image not yet loaded
            const target = e.currentTarget;
            target.style.display = 'none';
            if (target.nextElementSibling) {
              (target.nextElementSibling as HTMLElement).style.display = 'block';
            }
          }}
        />
        <svg
          viewBox="0 0 100 100"
          className="hidden h-full w-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Magnifying Glass Ring */}
          <circle cx="48" cy="46" r="34" stroke="#0C3826" strokeWidth="8" fill="white" />
          <line x1="72" y1="70" x2="88" y2="86" stroke="#0C3826" strokeWidth="9" strokeLinecap="round" />
          {/* Gold Coins Stack */}
          <ellipse cx="48" cy="62" rx="16" ry="4" fill="#C59B27" />
          <ellipse cx="48" cy="58" rx="16" ry="4" fill="#D4AF37" stroke="#A9811C" strokeWidth="1" />
          <ellipse cx="48" cy="54" rx="16" ry="4" fill="#E2BD48" stroke="#A9811C" strokeWidth="1" />
          {/* Sprouting 3-leaf Plant */}
          <path d="M48 54 C48 38 48 30 48 26 C49 32 54 44 48 54 Z" fill="#1B7A4B" />
          <path d="M48 46 C42 42 34 38 32 32 C38 34 44 40 48 46 Z" fill="#24965D" />
          <path d="M48 46 C54 42 62 38 64 32 C58 34 52 40 48 46 Z" fill="#24965D" />
        </svg>
      </div>

      {/* Brand Name & Tagline */}
      {showText && (
        <div className="flex flex-col">
          <div className={`font-extrabold uppercase leading-none ${textColor} ${textSizes[size]} flex items-center`}>
            <span>SOLVR</span>
            {/* The signature Solvra 'A' with gold triangular accent */}
            <span className="relative inline-flex items-center justify-center">
              <span>A</span>
              <span
                className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-[#C59B27]"
                aria-hidden="true"
              />
            </span>
          </div>
          {showTagline && (
            <span className={`mt-1 font-semibold uppercase ${tagColor} ${taglineSizes[size]}`}>
              Clarity today. Prosperity tomorrow.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Large banner version of the Solvra Logo (as in the provided official artwork)
 */
export function SolvraBannerLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-full overflow-hidden shadow-md border-2 border-emerald-900/10 mb-4 bg-white">
        <img
          src="/solvra-logo.jpg"
          alt="Solvra Logo"
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div className="flex items-center text-3xl sm:text-4xl font-black tracking-[0.25em] text-[#0C3826]">
        <span>SOLVR</span>
        <span className="relative inline-flex items-center justify-center">
          <span>A</span>
          <span
            className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[7px] border-l-transparent border-r-transparent border-b-[#C59B27]"
            aria-hidden="true"
          />
        </span>
      </div>
      <p className="mt-2 text-[10px] sm:text-xs font-semibold tracking-[0.28em] text-[#2D5A45] uppercase">
        Clarity today. Prosperity tomorrow.
      </p>
    </div>
  );
}
