/** The primary navigation of the home site, in header order. */
export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export const NAV: readonly NavItem[] = [
  { href: "/about/", label: "About the Mashgiach" },
  { href: "/essays/", label: "Essays" },
  { href: "/sefarim/", label: "Sefarim" },
  { href: "/weekly-devar-torah/", label: "Weekly Devar Torah" },
  { href: "/contact/", label: "Contact" },
];

export interface Crumb {
  readonly href?: string;
  readonly label: string;
}
