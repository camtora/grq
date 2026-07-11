import { useWindowDimensions } from 'react-native';

/**
 * Responsive layout primitives (docs/MOBILE-DESIGN.md §9 — iPad).
 *
 * Size classes are driven by the CURRENT window WIDTH, not the device model, so
 * iPad Split View / Slide Over (where the app gets a narrow slice of a big
 * screen) collapse back to the phone layout automatically. A 13" iPad Pro is
 * ~1024pt portrait / ~1366pt landscape; an 11" is ~834 / ~1194.
 *
 *   compact  (< 700)   iPhone, iPad slide-over → single column, phone layout
 *   medium   (700–999) iPad portrait, split view → centered column, 2-up grids
 *   expanded (>= 1000) iPad landscape / full-screen → wide, master-detail
 */

export const BP = { medium: 700, expanded: 1000 } as const;

export type SizeClass = 'compact' | 'medium' | 'expanded';

export type Responsive = {
  width: number;
  height: number;
  sizeClass: SizeClass;
  /** medium or expanded — anything wider than a phone. */
  isTablet: boolean;
  /** expanded — wide enough for side-by-side master-detail. */
  isWide: boolean;
  landscape: boolean;
  /** Reading column for prose/detail screens — keeps line length sane. */
  maxContentWidth: number;
  /** Wider bound for card grids (Hunt/Browse/etc). */
  maxGridWidth: number;
  /** Horizontal page gutter. */
  gutter: number;
};

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const sizeClass: SizeClass =
    width >= BP.expanded ? 'expanded' : width >= BP.medium ? 'medium' : 'compact';
  const isTablet = sizeClass !== 'compact';
  return {
    width,
    height,
    sizeClass,
    isTablet,
    isWide: sizeClass === 'expanded',
    landscape: width > height,
    maxContentWidth: isTablet ? 760 : width,
    maxGridWidth: isTablet ? 1200 : width,
    gutter: isTablet ? 24 : 16,
  };
}

/**
 * Column count for a card grid given a minimum comfortable card width. Clamped
 * to [1, max]. Pass the width actually available to the grid (usually the
 * bounded content width, not the raw screen width).
 */
export function gridColumns(available: number, minCardWidth = 340, max = 3): number {
  const cols = Math.floor(available / minCardWidth);
  return Math.max(1, Math.min(max, cols));
}
