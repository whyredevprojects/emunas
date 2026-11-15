// @ts-check
/**
 * Shared Stylelint config: logical properties only, so RTL (Yiddish) and LTR
 * (English) share one stylesheet (tech-quiet §styling, tech-live §1).
 */

const LOGICAL_HINT = "Use logical properties (margin-inline-start, inset-inline-end, ...)";

/** @type {import("stylelint").Config} */
export default {
  rules: {
    "property-disallowed-list": [
      [
        /^(left|right)$/,
        /^(margin|padding|border|scroll-margin|scroll-padding)-(left|right)(-.*)?$/,
        /^border-(top|bottom)-(left|right)-radius$/,
      ],
      { message: (/** @type {string} */ prop) => `"${prop}" is a physical property. ${LOGICAL_HINT}.` },
    ],
    "declaration-property-value-disallowed-list": [
      {
        "text-align": ["left", "right"],
        float: ["left", "right"],
        clear: ["left", "right"],
      },
      { message: `Physical direction value. Use start/end or inline-start/inline-end. ${LOGICAL_HINT}.` },
    ],
  },
  overrides: [
    {
      files: ["**/*.astro", "**/*.html"],
      customSyntax: "postcss-html",
    },
  ],
};
