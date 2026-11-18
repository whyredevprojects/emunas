/**
 * The "opens in a new tab" mark as markup, for links built outside an Astro component (the About
 * texts, ../pages/[ed]/about/_content.ts). ./NewTabIcon.astro renders the same element; its styles
 * are global so they reach both.
 */
export const NEW_TAB_ICON_PATH =
  "M14 3h7v7h-2V6.41l-9.3 9.3-1.41-1.42L17.59 5H14V3zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z";

export const NEW_TAB_ICON_SVG =
  `<svg class="new-tab-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">` +
  `<path d="${NEW_TAB_ICON_PATH}" fill="currentColor" /></svg>`;
