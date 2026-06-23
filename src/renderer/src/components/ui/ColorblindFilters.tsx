import React from 'react'

/**
 * Hidden SVG color-matrix filters referenced by index.css when a colorblind
 * adjustment is active (`[data-colorblind] #root { filter: url(#cb-…) }`).
 * Standard feColorMatrix values (Machado et al.) — rendered once, near-zero cost
 * while inactive.
 */
export function ColorblindFilters() {
  return (
    <svg aria-hidden="true" focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
      <defs>
        <filter id="cb-protanopia">
          <feColorMatrix type="matrix" values="
            0.567 0.433 0     0 0
            0.558 0.442 0     0 0
            0     0.242 0.758 0 0
            0     0     0     1 0" />
        </filter>
        <filter id="cb-deuteranopia">
          <feColorMatrix type="matrix" values="
            0.625 0.375 0   0 0
            0.700 0.300 0   0 0
            0     0.300 0.7 0 0
            0     0     0   1 0" />
        </filter>
        <filter id="cb-tritanopia">
          <feColorMatrix type="matrix" values="
            0.95 0.05  0     0 0
            0    0.433 0.567 0 0
            0    0.475 0.525 0 0
            0    0     0     1 0" />
        </filter>
      </defs>
    </svg>
  )
}
