'use client';

import React, { useMemo } from 'react';
import { useAccessibility } from '@/contexts/AccessibilityContext';

/**
 * ColorBlindFilters Component
 *
 * Mounts the `<filter>` definitions referenced by the `.a11y-colorblind-*`
 * CSS classes in `app/accessibility.css`. The filters target the
 * `#a11y-content-wrapper` div (set up in `app/layout.tsx`) so the visual
 * effect is applied to the content tree without breaking fixed-positioned
 * overlays the way a body-level filter would.
 *
 * Strength wiring (Phase G7):
 *   The user's `accessibility_preferences.color_blind_strength` (0-100) is
 *   honored by interpolating the simulation matrix toward the identity
 *   matrix — strength=0 leaves the page untouched (matrix == identity),
 *   strength=100 applies the full simulation. The reference matrices are
 *   the standard Brettel/Vienot/Mollon coefficients for protanopia /
 *   deuteranopia / tritanopia and the Machado et al. (2009) coefficients
 *   for the milder *anomaly variants.
 *
 *   The mount stays SSR-friendly: `useAccessibility()` is called inside an
 *   `'use client'` component and the matrices are deterministic, so there's
 *   nothing to hydrate-mismatch on. We re-render only when `color_blind_mode`
 *   or `color_blind_strength` change (the `useMemo` cache).
 */

type Matrix = readonly [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
];

const IDENTITY: Matrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

const SIMULATIONS: Record<string, Matrix> = {
  protanopia: [
    0.567, 0.433, 0.000, 0, 0,
    0.558, 0.442, 0.000, 0, 0,
    0.000, 0.242, 0.758, 0, 0,
    0,     0,     0,     1, 0,
  ],
  deuteranopia: [
    0.625, 0.375, 0.000, 0, 0,
    0.700, 0.300, 0.000, 0, 0,
    0.000, 0.300, 0.700, 0, 0,
    0,     0,     0,     1, 0,
  ],
  tritanopia: [
    0.950, 0.050, 0.000, 0, 0,
    0.000, 0.433, 0.567, 0, 0,
    0.000, 0.475, 0.525, 0, 0,
    0,     0,     0,     1, 0,
  ],
  protanomaly: [
    0.817, 0.183, 0.000, 0, 0,
    0.333, 0.667, 0.000, 0, 0,
    0.000, 0.125, 0.875, 0, 0,
    0,     0,     0,     1, 0,
  ],
  deuteranomaly: [
    0.800, 0.200, 0.000, 0, 0,
    0.258, 0.742, 0.000, 0, 0,
    0.000, 0.142, 0.858, 0, 0,
    0,     0,     0,     1, 0,
  ],
  tritanomaly: [
    0.967, 0.033, 0.000, 0, 0,
    0.000, 0.733, 0.267, 0, 0,
    0.000, 0.183, 0.817, 0, 0,
    0,     0,     0,     1, 0,
  ],
};

function blend(target: Matrix, t: number): Matrix {
  const out: number[] = new Array(20);
  for (let i = 0; i < 20; i++) {
    out[i] = IDENTITY[i] * (1 - t) + target[i] * t;
  }
  return out as unknown as Matrix;
}

function matrixToValuesString(m: Matrix): string {
  return m
    .map((n) => Number(n.toFixed(4)))
    .join(' ');
}

export const ColorBlindFilters: React.FC = () => {
  const { preferences } = useAccessibility();

  const activeMode = preferences.color_blind_mode;
  const strength = Math.max(0, Math.min(100, preferences.color_blind_strength ?? 100));
  const t = strength / 100;

  const matrices = useMemo(() => {
    const result: Record<string, Matrix> = {};
    for (const [mode, full] of Object.entries(SIMULATIONS)) {
      result[mode] = mode === activeMode ? blend(full, t) : full;
    }
    return result;
  }, [activeMode, t]);

  return (
    <svg
      className="absolute"
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
      }}
      aria-hidden="true"
      data-active-color-blind-mode={activeMode}
      data-color-blind-strength={strength}
    >
      <defs>
        <filter id="protanopia-filter">
          <feColorMatrix type="matrix" values={matrixToValuesString(matrices.protanopia)} />
        </filter>

        <filter id="deuteranopia-filter">
          <feColorMatrix type="matrix" values={matrixToValuesString(matrices.deuteranopia)} />
        </filter>

        <filter id="tritanopia-filter">
          <feColorMatrix type="matrix" values={matrixToValuesString(matrices.tritanopia)} />
        </filter>

        <filter id="protanomaly-filter">
          <feColorMatrix type="matrix" values={matrixToValuesString(matrices.protanomaly)} />
        </filter>

        {}
        <filter id="deuteranomaly-filter">
          <feColorMatrix type="matrix" values={matrixToValuesString(matrices.deuteranomaly)} />
        </filter>

        <filter id="tritanomaly-filter">
          <feColorMatrix type="matrix" values={matrixToValuesString(matrices.tritanomaly)} />
        </filter>

        {}

        <filter id="high-contrast-filter">
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.5" intercept="-0.25" />
            <feFuncG type="linear" slope="1.5" intercept="-0.25" />
            <feFuncB type="linear" slope="1.5" intercept="-0.25" />
          </feComponentTransfer>
        </filter>

        <filter id="brightness-filter">
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.2" />
            <feFuncG type="linear" slope="1.2" />
            <feFuncB type="linear" slope="1.2" />
          </feComponentTransfer>
        </filter>

        <filter id="warm-tone-filter">
          <feColorMatrix
            type="matrix"
            values="1.0, 0.1, 0.0, 0, 0.05
                    0.0, 0.95, 0.05, 0, 0.02
                    0.0, 0.0, 0.85, 0, 0
                    0, 0, 0, 1, 0"
          />
        </filter>

        <filter id="cool-tone-filter">
          <feColorMatrix
            type="matrix"
            values="0.9, 0.0, 0.05, 0, 0
                    0.0, 0.95, 0.05, 0, 0.02
                    0.05, 0.1, 1.0, 0, 0.05
                    0, 0, 0, 1, 0"
          />
        </filter>

        <filter id="focus-glow-filter" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
          <feFlood floodColor="#3B82F6" floodOpacity="0.5" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="reading-highlight-filter">
          <feFlood floodColor="#FFFF00" floodOpacity="0.3" result="flood" />
          <feComposite in="flood" in2="SourceGraphic" operator="atop" result="comp" />
          <feMerge>
            <feMergeNode in="comp" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
};

export default ColorBlindFilters;
