import type { SVGProps } from "react";

/**
 * `25-47`: three inline Material Symbols Outlined glyphs for the user menu's own rows - the tenant
 * switcher, Appearance, and Sign out. `adr/0030`'s fourth amendment is the full reasoning for why
 * this is licensed and how narrowly; the short version is the same one that ADR's own third
 * amendment (the withdrawn nav lock glyph, `NavLockGlyph`) already established: a static,
 * decorative, `aria-hidden` SVG path is not a component in the sense that ADR's closed set answers
 * for - no focus management, no keyboard interaction, no ARIA state machine, only a shape - so three
 * of them here is not a fourth crack in that decision, it is the identical narrow answer given three
 * times over for one menu.
 *
 * **Path data is Google's own Material Symbols Outlined**, weight 400 / fill 0 / grade 0 (the
 * family's default, unfilled style), fetched verbatim from `google/material-design-icons` on GitHub
 * - `symbols/web/<name>/materialsymbolsoutlined/<name>_24px.svg` on `master`, retrieved 2026-09-12 -
 * never retyped from memory, which is the one way a hand-copied path silently corrupts into a shape
 * that renders but is not the glyph it claims to be.
 *
 * `fill="currentColor"` on every one of them, deliberately: each icon sits beside ordinary menu-item
 * text and inherits that text's own ink colour, a pair `tokens.css` already measures for contrast
 * everywhere else in this console. That is what lets three new glyphs enter a stylesheet built
 * entirely on measured pairs without becoming a fourth thing to measure.
 */
function MenuIcon({ path, ...rest }: { path: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
      <path d={path} />
    </svg>
  );
}

const TENANT_ICON_PATH =
  "M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-40-82v-78q-33 0-56.5-23.5T360-320v-40L168-552q-3 18-5.5 36t-2.5 36q0 121 79.5 212T440-162Zm276-102q20-22 36-47.5t26.5-53q10.5-27.5 16-56.5t5.5-59q0-98-54.5-179T600-776v16q0 33-23.5 56.5T520-680h-80v80q0 17-11.5 28.5T400-560h-80v80h240q17 0 28.5 11.5T600-440v120h40q26 0 47 15.5t29 40.5Z";

const APPEARANCE_ICON_PATH =
  "M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 32.5-156t88-127Q256-817 330-848.5T488-880q80 0 151 27.5t124.5 76q53.5 48.5 85 115T880-518q0 115-70 176.5T640-280h-74q-9 0-12.5 5t-3.5 11q0 12 15 34.5t15 51.5q0 50-27.5 74T480-80Zm0-400Zm-220 40q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120-160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm200 0q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120 160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17ZM480-160q9 0 14.5-5t5.5-13q0-14-15-33t-15-57q0-42 29-67t71-25h70q66 0 113-38.5T800-518q0-121-92.5-201.5T488-800q-136 0-232 93t-96 227q0 133 93.5 226.5T480-160Z";

const SIGN_OUT_ICON_PATH =
  "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h327L585-622l55-58 200 200-200 200Z";

/** "public" - the closest Material Symbol to the backlog item's own "a globe-equivalent icon"
 * beside each row of the tenant switcher. */
export function TenantIcon(props: SVGProps<SVGSVGElement>) {
  return <MenuIcon path={TENANT_ICON_PATH} {...props} />;
}

/** "palette" - beside the Appearance row. */
export function AppearanceIcon(props: SVGProps<SVGSVGElement>) {
  return <MenuIcon path={APPEARANCE_ICON_PATH} {...props} />;
}

/** "logout" - beside the Sign out row. */
export function SignOutIcon(props: SVGProps<SVGSVGElement>) {
  return <MenuIcon path={SIGN_OUT_ICON_PATH} {...props} />;
}
