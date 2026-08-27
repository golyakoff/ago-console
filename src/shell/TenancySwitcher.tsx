import type { TenancyDto } from "../api/tenanciesApi.js";
import { Select } from "../components/Select.js";
import { useStrings } from "../i18n/StringsContext.js";

export interface TenancySwitcherProps {
  tenancies: TenancyDto[];
  activeSiteId: string | null;
  onSwitch: (siteId: string) => void;
}

/**
 * `13-07`/`adr/0068`: rendered by `OperatorShell` only when `tenancies.length > 1` - a single-tenant
 * operator's console renders with no switcher at all, byte-for-byte the shell it already had
 * (`OperatorShell`'s own render, which does not mount this component unless there is a real choice
 * to offer).
 *
 * The shared `Select` (`components/Select.tsx`), not a custom dropdown: this is exactly the
 * "minimal-but-real" territory the item's own time-box calls out - reusing the one styled native
 * control this codebase already has is both less code and more consistent than a bespoke component,
 * and `Select`'s own doc comment already argues why a real combobox would be over-building for a
 * short, closed list. `onSwitch` is `PermissionsContext`'s own `switchTenancy` - see that context's
 * doc comment for why picking a value here ends in a full page reload rather than an in-place update.
 */
export function TenancySwitcher({ tenancies, activeSiteId, onSwitch }: TenancySwitcherProps) {
  // `11-11`: the *active* tenant's own language, the same `StringsProvider` `OperatorShell` already
  // wraps this component in - not each listed tenancy's own locale, which would have no coherent
  // rendering for a single control's chrome anyway. Switching tenants reloads the page (this
  // component's own longer-standing remarks), so the label simply re-resolves on the next render.
  const strings = useStrings();
  return (
    <label className="ago-shell__tenancy-switcher">
      <span className="ago-shell__tenancy-switcher-label">{strings.tenancySwitcherLabel}</span>
      <Select
        aria-label={strings.activeSiteAriaLabel}
        value={activeSiteId ?? ""}
        onChange={(event) => {
          const nextSiteId = event.target.value;
          if (nextSiteId && nextSiteId !== activeSiteId) {
            onSwitch(nextSiteId);
          }
        }}
      >
        {tenancies.map((tenancy) => (
          <option key={tenancy.siteId} value={tenancy.siteId}>
            {/* A site's name really can be the empty string - OwnerSitesPage's own "Site" column
                already handles this (a seeded demo tenant predates `10-02`'s registration flow,
                which requires one). An <option> can't nest a <span>, so this is a plain string
                rather than that column's styled "Unnamed" badge - but it needs the same
                disambiguation for the same reason: two blank options in one dropdown would be
                indistinguishable without the id suffix. */}
            {tenancy.siteName.trim().length > 0 ? tenancy.siteName : `${strings.unnamedSite} (${tenancy.siteId.slice(0, 8)})`}
          </option>
        ))}
      </Select>
    </label>
  );
}
