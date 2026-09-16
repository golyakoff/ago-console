import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  addOwnerRolePermissions,
  extendOwnerSuspension,
  fetchOwnerSiteDetail,
  grantOwnerModule,
  grantOwnerModuleQuantity,
  removeOwnerRolePermissions,
  restoreOwnerOperatorSeat,
  revokeOwnerModule,
  suspendOwnerSite,
  unblockOwnerSuspension,
  updateOwnerSiteAllowedOrigins,
  type OwnerSiteDetail,
  type OwnerSiteModule,
  type OwnerSiteOperator,
  type OwnerSiteRole,
} from "../api/ownerApi.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { buildTenantNavSections } from "../shell/consoleNav.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Panel } from "../components/Panel.js";
import { Select } from "../components/Select.js";
import { Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Textarea } from "../components/Textarea.js";
import { parseTriggerWords } from "../pages/moduleConfigValidation.js";
import { generateModuleCredential } from "./generateModuleCredential.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import {
  describeRecentWindow,
  formatByteSize,
  formatCount,
  formatModuleExpiry,
  formatModuleQuantity,
  formatModuleStatus,
  formatNoRecentActivity,
  formatRecentMessagesHeader,
  moduleStatusTone,
} from "./ownerSites.js";

/** `23-65`: whether the grant form's expiry has been chosen at all. `"unset"` is the form's own
 * initial state and blocks submission - `adr/0150`'s own "a grant with no expiry is a discount
 * nobody remembers giving" applies to the screen exactly as it did to the runbook's own required-
 * and-nullable wire field, so this screen must not default to either "never" or a date; the platform
 * owner has to pick one. */
type ExpiryChoice = "unset" | "never" | "date";

/**
 * `25-19`: the grant form's own module-key options, replacing the free-text input a typo used to
 * slip through unnoticed - `EnableModuleForSiteAsOwnerHandler` only ever fails a typo'd key late
 * (a 404-shaped `Module.EntryPointNotConfigured`), and the caption this dropdown replaces existed
 * only to compensate for that: once the control cannot produce a value the server would reject on
 * shape alone, the caption has nothing left to explain.
 *
 * **A stated interim answer, not a real source of truth.** `IModuleEntryPointProvider` (the port the
 * handler actually resolves a key against) is deliberately opaque - keyed by whatever `ModuleKey` a
 * caller supplies, never a fixed set Chat enumerates (`adr/0065` decision 2) - so there is no endpoint
 * this page could call to ask "what module keys exist". This list is instead a small, hand-maintained
 * mirror of the product's own known module vocabulary: the same two keys `ProductsPage.tsx` already
 * hardcodes as the product's real, sellable modules (`"calendar"`, `"faq"`), and the same set
 * `Ago.Chat.Architecture.Tests/KnownModuleKeys.cs` maintains server-side for its own literal-guard.
 *
 * **Deliberately not narrowed to what this one deployment has configured `ModuleEntryPoints:` for.**
 * Only `calendar` is configured on the current cluster (`ago-deploy/k8s/base/api.yaml`) - `faq` is a
 * real, shipped module (`19-03`, `FaqModulePage.tsx`) that simply is not deployed on this particular
 * stand yet. Narrowing this list to "what happens to be configured right now" would make the dropdown
 * *stricter than the API* on a deployment that has configured `faq` - exactly the regression this
 * item's own "where this is likely to go wrong" note warns against. A key the current deployment has
 * not configured an entry point for is still refused server-side, by name
 * (`Module.EntryPointNotConfigured`) - the same legible refusal an unconfigured key already got before
 * this change, not a new failure mode.
 *
 * **Update this list by hand when a third real module ships**, exactly the same maintenance cost
 * `KnownModuleKeys.cs`'s own remarks accept for its server-side twin - there is no runtime discovery
 * to keep it honest automatically.
 */
const KNOWN_MODULE_KEYS: readonly string[] = ["calendar", "faq"];

/**
 * `25-114`: the `ModuleKey` a channel entitlement is granted under - `ChannelEntitlement.
 * IsEntitledAsync` resolves a channel kind (Telegram today) to this exact literal through
 * `IBillingOptionEntitlementProvider.TryGet("channel-telegram")`, which the live deployment
 * configures as `"channel"` (`ago-deploy/k8s/base/{api,worker}.yaml`, `25-113`). Unlike
 * `KNOWN_MODULE_KEYS` above, this is not a menu of choices this screen offers - there is exactly one
 * channel-quantity grant per site today, so this constant names the one key `handleChannelQuantitySubmit`
 * below always sends, never a value the platform owner picks.
 */
const CHANNEL_MODULE_KEY = "channel";

/** What the server has said so far about this caller's access to `23-14`'s endpoint, and whether the
 * named site exists at all - the same `OwnerAccess` shape `OwnerSitesPage` uses, plus `"not-found"`
 * for a real 404 (the platform owner may legitimately name a site that does not exist, which is a
 * different fact from "you may not see this"). */
type OwnerDetailAccess = "unknown" | "granted" | "refused" | "not-found";

/**
 * `23-14`: the platform owner's per-tenant detail read - `GET /api/v1/owner/sites/{siteId}`. The
 * drill-down `ui-inventory.md` §8.1 recorded as absent from `/owner`: the same eight facts
 * `OwnerSitesPage`'s table already shows for a page of sites, for exactly the one a row was clicked
 * for, plus that tenant's entitlements - which module it holds, whether the platform owner granted it
 * or the tenant enabled it themselves, and when each grant ends (or that it never does).
 *
 * **Read-only, exactly like its sibling.** `decisions.md` §6: granting or revoking stays a runbook
 * for now (`23-15`), because both writes need the deployment-wide provisioning secret in the request
 * body and a console form would put that secret in a browser. This screen adds no button that acts.
 *
 * **Mounted outside the operator layout**, the identical reasoning `OwnerSitesPage`'s own doc comment
 * gives: the platform owner may hold no `operators` row at all, so nothing here may assume one.
 *
 * **`25-89`: no longer hardcoded English.** This page used to say, in these words, "`/owner` is not
 * scoped to one tenant, so it cannot follow one tenant's language" and pass the built-in `en` table
 * for its nav while writing every other string as a plain English literal - the same call
 * `OwnerSitesPage.tsx`'s own doc comment made and the same one `25-89` supersedes there. This page now
 * reads `useStrings()` throughout, inside the identical `OwnerStringsProvider` `App.tsx`'s
 * `/owner/sites/:siteId` route wraps around it - see that provider's own doc comment for the fuller
 * reasoning (unchanged from `OwnerSitesPage.tsx`'s: there is still no *tenant* locale for a
 * cross-tenant screen to follow, which is why this stays an explicit provider rather than a route
 * reading `StringsContext`'s bare default).
 */
export function OwnerSiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const { user, logout } = useAuth();
  const { siteId: ownSiteId, hasPermission, enabledModules } = usePermissions();
  const strings = useStrings();
  const accessToken = user?.access_token;

  const [access, setAccess] = useState<OwnerDetailAccess>("unknown");
  const [site, setSite] = useState<OwnerSiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `23-48`: the allowed-origins editor's own state - a plain textarea draft (one origin per line)
  // rather than a dynamic list of text inputs, matching `OfflineAutoReplyPage`'s own "simplest
  // control that can hold the value" judgement for a small, rarely-edited list.
  const [originsDraft, setOriginsDraft] = useState("");
  const [originsError, setOriginsError] = useState<string | null>(null);
  const [originsSaved, setOriginsSaved] = useState(false);
  const [originsSaving, setOriginsSaving] = useState(false);

  // `23-65`: the grant form's own state. `expiryChoice` starts `"unset"` - neither "never" nor a real
  // date - so the platform owner has to pick one before this form can submit at all; see this file's
  // own `ExpiryChoice` remarks.
  // `25-19`: defaults to the first known key rather than an empty/unset state - unlike `expiryChoice`
  // just below, picking the wrong module from a short, fully-enumerated dropdown is a mistake the
  // platform owner notices immediately on the same screen, not a silent business decision the way an
  // un-chosen expiry would be, so there is no need to force an explicit first choice here.
  const [moduleKeyInput, setModuleKeyInput] = useState<string>(KNOWN_MODULE_KEYS[0]);
  const [triggerWordsInput, setTriggerWordsInput] = useState("");
  const [credentialInput, setCredentialInput] = useState("");
  // `23-94`: whether the credential field currently shows its value in the clear. Starts hidden
  // (`type="password"`, matching the field's own "never shown again once saved" description) and
  // switches to visible only once a value has actually been generated - typing one's own credential by
  // hand keeps the field masked, exactly as before this item.
  const [credentialRevealed, setCredentialRevealed] = useState(false);
  const [credentialCopied, setCredentialCopied] = useState(false);
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>("unset");
  const [expiryDateInput, setExpiryDateInput] = useState("");
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSaved, setGrantSaved] = useState(false);
  const [grantSubmitting, setGrantSubmitting] = useState(false);

  // `23-65`: the revoke confirmation's own state - which module (if any) the dialog is open for,
  // and the reason draft it collects when that module is a tenant's own purchase
  // (`module.grantedByOwner === false`). `revokingModule` doubles as the dialog's `open` flag, the
  // same "the row being acted on is the state" shape `RemoveOperatorButton`'s own confirmation uses,
  // adapted here because the trigger is one column of a shared table rather than a component with its
  // own row.
  const [revokingModule, setRevokingModule] = useState<OwnerSiteModule | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);

  // `23-66`: the quantity dialog's own state - `quantityModule` doubles as the dialog's `open` flag,
  // the same shape `revokingModule` already establishes above. `quantityStage` is what makes lowering
  // a different act from raising one (this item's own Scope): "edit" is the ordinary form, and a
  // submit that would lower an already-granted quantity moves to "confirm" instead of submitting -
  // the impact is stated before the request is sent, never after.
  const [quantityModule, setQuantityModule] = useState<OwnerSiteModule | null>(null);
  const [quantityInput, setQuantityInput] = useState("");
  const [quantityStage, setQuantityStage] = useState<"edit" | "confirm">("edit");
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [quantitySaved, setQuantitySaved] = useState<{ moduleKey: string; quantity: number } | null>(null);
  const [quantitySubmitting, setQuantitySubmitting] = useState(false);

  // `25-114`: the channel entitlement's own state - a dedicated section below, not a row spliced
  // into `moduleColumns`/`quantityModule` above. `"channel"` never gets an `enabled_modules` row
  // (`ChannelEntitlement.cs`'s own remarks: a billing-driven grant with no entry point and no
  // credential would make chat believe a real module is registered when nothing routes to it), so
  // there is no row in `site.modules` this section could reuse the existing dialog for without first
  // faking one - exactly the confusion that class's own comment warns against. `channelQuantitySaved`
  // starts `null` and stays `null` across a page reload: `OwnerSiteDetailResponse` only ever surfaces
  // `IModuleQuantityGrantStore`'s quantities as enrichment of a `modules` row that already exists
  // (`GetSiteForOwnerHandler.ToModuleDto`), so a quantity granted for a moduleless pseudo-module never
  // reaches this screen's own read at all - this section can show only what it itself just granted in
  // this browser session, not the site's actual standing entitlement. See this file's own report for
  // `25-114` for the read-side field this leaves genuinely missing, deliberately not added here.
  const [channelQuantityInput, setChannelQuantityInput] = useState("");
  const [channelQuantityError, setChannelQuantityError] = useState<string | null>(null);
  const [channelQuantitySaved, setChannelQuantitySaved] = useState<number | null>(null);
  const [channelQuantitySubmitting, setChannelQuantitySubmitting] = useState(false);

  // `23-68`: the operator roster's own restore-seat action. `restoringOperatorId` is which row's own
  // button shows a busy state, not a dialog flag - the ordinary restore (within the seat limit, this
  // item's own headline scenario) needs no dialog at all, matching `handleGenerateCredential`'s own
  // "the simplest control that can hold the value" judgement. `forceDialogOperator` opens only once
  // the server itself says the seat limit would be exceeded (`"requires-force"`) - the identical
  // "try first, escalate only once the server says so" shape `handleRevokeConfirm`'s own force/reason
  // asymmetry uses, except there the asymmetry is known up front from `grantedByOwner` and here it is
  // not knowable client-side at all (this screen has no seat-count arithmetic of its own - `CLAUDE.md`
  // rule 8: a compare-and-set read belongs to the database, not a browser guess).
  const [restoringOperatorId, setRestoringOperatorId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSaved, setRestoreSaved] = useState<{ operatorId: string; overrodeSeatLimit: boolean } | null>(null);
  const [forceDialogOperator, setForceDialogOperator] = useState<OwnerSiteOperator | null>(null);
  const [forceDialogMessage, setForceDialogMessage] = useState<string | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [forceError, setForceError] = useState<string | null>(null);
  const [forceSubmitting, setForceSubmitting] = useState(false);

  // `25-76`: the role-permission tool's own state. `permissionSelections` is keyed by role name
  // rather than a single value, because more than one role's own picker is on screen at once
  // (`"Operator"` and `"Admin"`, `site.roles`) and choosing one must not clear the other.
  // `addingPermissionForRole` is which row's own button shows a busy state, the identical
  // `restoringOperatorId` shape above - no dialog at all, since adding a permission is a safe,
  // additive act with nothing to confirm (this item's own scope: ADD only, and there is no
  // consequential override here the way a seat-limit or a revoke has).
  const [permissionSelections, setPermissionSelections] = useState<Record<string, string>>({});
  const [addingPermissionForRole, setAddingPermissionForRole] = useState<string | null>(null);
  const [addPermissionError, setAddPermissionError] = useState<string | null>(null);
  const [addPermissionSaved, setAddPermissionSaved] = useState<{ roleName: string; permission: string } | null>(null);

  // `25-77`: the removal mirror - "no magic roles" (docs/backlog/25-77-*.md's own "Answered": any
  // permission, Admin's own defining ones included, may be removed). Unlike adding, removing always
  // opens a dialog - `removingPermission` doubles as the dialog's own open flag, the same shape
  // `revokingModule`/`forceDialogOperator` already establish above - because a reason is required on
  // every removal (`adr/0118`'s own forced-revoke discipline, restated for this act), so there is
  // always something to collect before the request can even be sent.
  const [removingPermission, setRemovingPermission] = useState<{ roleName: string; permission: string } | null>(null);
  const [removePermissionReason, setRemovePermissionReason] = useState("");
  const [removePermissionError, setRemovePermissionError] = useState<string | null>(null);
  const [removePermissionSaved, setRemovePermissionSaved] = useState<{ roleName: string; permission: string } | null>(null);
  const [removePermissionSubmitting, setRemovePermissionSubmitting] = useState(false);

  // `22-08`/`adr/0166`: the account-wide freeze's own dialog state - `suspendDialogOpen` doubles as
  // the dialog's own open flag, the same shape `revokingModule`/`forceDialogOperator` already
  // establish above. One shared `minutesInput`/`reasonInput` pair for all three acts (suspend,
  // extend, lift) - `suspendDialogMode` is what tells `handleSuspensionConfirm` which call to make
  // and what `minutesInput` even means (a fresh duration, or an addition to the existing one).
  const [suspendDialogMode, setSuspendDialogMode] = useState<"suspend" | "extend" | "lift" | null>(null);
  const [suspendMinutesInput, setSuspendMinutesInput] = useState("60");
  const [suspendReasonInput, setSuspendReasonInput] = useState("");
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [suspendSubmitting, setSuspendSubmitting] = useState(false);

  const timeZone = useMemo(() => resolveTimeZone(), []);

  // `23-65`: extracted out of the load effect below so a successful grant or revoke can re-run the
  // identical read rather than splice a locally-built row into `site.modules` - `GrantModuleResponse`
  // does not even carry `status`/`grantedByOwner`, and this screen's own Done-when requires
  // `status` to come from the server's own live comparison, never be recomputed here (`buildModuleColumns`'s
  // own remarks below).
  const loadSiteDetail = useCallback(() => {
    if (!accessToken || !siteId) {
      return;
    }

    fetchOwnerSiteDetail(accessToken, siteId)
      .then((outcome) => {
        if (outcome.status === "not-authorized") {
          setAccess("refused");
          return;
        }

        if (outcome.status === "not-found") {
          setAccess("not-found");
          return;
        }

        setAccess("granted");
        setSite(outcome.site);
        setOriginsDraft(outcome.site.allowedOrigins.join("\n"));
      })
      .catch((err: unknown) => {
        // Same "the API is broken" vs. "you may not see this" split every owner screen makes.
        setError(err instanceof Error ? err.message : strings.ownerSiteDetailLoadFailed);
      });
  }, [accessToken, siteId, strings]);

  useEffect(() => {
    if (!accessToken || !siteId) {
      // `RequireAuth` guarantees a signed-in user, and this route only ever mounts with a `:siteId`
      // segment (`App.tsx`) - the same "reaching here without one is a wiring bug" reasoning the
      // other pages state for their own preconditions.
      return;
    }

    loadSiteDetail();
    // `loadSiteDetail` is recreated only when `accessToken`/`siteId` change, so this still runs
    // exactly once per those - the identical effect this file had before extracting the loader, minus
    // the `cancelled` guard a single mount-time call never needed once `loadSiteDetail` itself is the
    // thing re-invoked deliberately (by the grant/revoke handlers below), not raced by an unmount.
  }, [accessToken, siteId, loadSiteDetail]);

  const moduleColumns = useMemo(
    () =>
      buildModuleColumns(
        timeZone,
        strings,
        (module) => {
          setRevokingModule(module);
          setRevokeReason("");
          setRevokeError(null);
        },
        (module) => {
          setQuantityModule(module);
          // Pre-filled with the current value (or blank when never granted) - the platform owner is
          // changing a number, not starting from zero every time.
          setQuantityInput(module.quantity === null ? "" : String(module.quantity));
          setQuantityStage("edit");
          setQuantityError(null);
          setQuantitySaved(null);
        },
      ),
    [timeZone, strings],
  );

  const handleSaveOrigins = () => {
    if (!accessToken || !siteId) {
      return;
    }

    // Blank lines are a typing artifact (an extra Enter at the end), not a value to send - dropped
    // client-side so the common case (paste, hit save) does not first bounce off the server's own
    // "an entry cannot be empty" guard for a line the person never meant as a real entry.
    const origins = originsDraft
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    setOriginsSaving(true);
    setOriginsError(null);
    setOriginsSaved(false);

    updateOwnerSiteAllowedOrigins(accessToken, siteId, origins)
      .then((outcome) => {
        if (outcome.status === "ok") {
          setSite((current) => (current ? { ...current, allowedOrigins: outcome.allowedOrigins } : current));
          setOriginsDraft(outcome.allowedOrigins.join("\n"));
          setOriginsSaved(true);
          return;
        }

        if (outcome.status === "invalid") {
          setOriginsError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session: the token expired, or the tenant was removed
        // while this screen was open - both genuinely unexpected here (the page itself already
        // proved `granted` and a real site to reach this form at all), so this is reported the same
        // plain way the page's own load-time `error` state is, not folded into the field-level
        // `originsError` a caller can fix by retyping.
        setError(strings.ownerCouldNotBeReached);
      })
      .catch((err: unknown) => {
        setOriginsError(err instanceof Error ? err.message : strings.ownerSiteDetailOriginsSaveFailed);
      })
      .finally(() => {
        setOriginsSaving(false);
      });
  };

  // `23-94`: mints a fresh, high-entropy value and puts it straight into the field the form will
  // actually submit - the same `credentialInput` state `handleGrantSubmit` below reads, never a
  // separate "generated value" the form has to be told to adopt. That is what keeps generating and
  // saving the same act: there is no second place for the two to drift apart.
  const handleGenerateCredential = () => {
    setCredentialInput(generateModuleCredential());
    setCredentialRevealed(true);
    setCredentialCopied(false);
  };

  // `23-94`: this is the one moment the value can be seen at all - the field is masked again the
  // instant the page is left or the grant succeeds, and the server never echoes a credential back
  // (`OwnerModuleEndpoints.GrantModuleRequest`'s own remarks). Copying it here is the platform owner's
  // only chance to record it somewhere else, if they need to.
  const handleCopyCredential = () => {
    void navigator.clipboard.writeText(credentialInput);
    setCredentialCopied(true);
  };

  // `23-65`: the grant form's own submit. Client-side validation mirrors
  // `moduleConfigValidation.ts`'s own floor (well-formed, non-empty) - the server is still the real
  // gate on everything else (reserved/conflicting trigger words, entry-point reachability, expiry
  // bounds), the identical split every other form on this console already keeps.
  const handleGrantSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setGrantSaved(false);
    setGrantError(null);

    // `25-19`: no "empty module key" guard here any more - `moduleKeyInput` now comes from a `<select>`
    // whose options are `KNOWN_MODULE_KEYS`, so it is never empty in the first place, unlike the free
    // text this replaced. `.trim()` stays for symmetry with the two fields below it, not because a
    // select value can carry whitespace.
    const trimmedKey = moduleKeyInput.trim();
    const triggerWords = parseTriggerWords(triggerWordsInput);
    const trimmedCredential = credentialInput.trim();

    if (triggerWords.length === 0) {
      setGrantError(strings.ownerSiteDetailTriggerWordsRequired);
      return;
    }
    if (trimmedCredential.length === 0) {
      setGrantError(strings.ownerSiteDetailCredentialRequired);
      return;
    }

    // `adr/0150`'s own "a grant with no expiry is a discount nobody remembers giving": this form
    // will not submit at all until the platform owner has actively chosen one of the two options
    // below - there is no default that reaches the request body.
    let expiresAt: string | null;
    if (expiryChoice === "unset") {
      setGrantError(strings.ownerSiteDetailExpiryChoiceRequired);
      return;
    } else if (expiryChoice === "never") {
      expiresAt = null;
    } else {
      if (expiryDateInput.trim().length === 0) {
        setGrantError(strings.ownerSiteDetailExpiryDateRequired);
        return;
      }
      const parsed = new Date(expiryDateInput);
      if (Number.isNaN(parsed.getTime())) {
        setGrantError(strings.ownerSiteDetailExpiryDateUnreadable);
        return;
      }
      expiresAt = parsed.toISOString();
    }

    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setGrantSubmitting(true);
    grantOwnerModule(accessToken, siteId, {
      moduleKey: trimmedKey,
      triggerWords,
      credential: trimmedCredential,
      expiresAt,
    })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setGrantSaved(true);
          setModuleKeyInput("");
          setTriggerWordsInput("");
          setCredentialInput("");
          setCredentialRevealed(false);
          setCredentialCopied(false);
          setExpiryChoice("unset");
          setExpiryDateInput("");
          // Re-read rather than splice a locally-built row in - `outcome.module` carries no
          // `status`/`grantedByOwner` (`GrantOwnerModuleOutcome`'s own remarks), and this table
          // renders only what the server itself computed.
          loadSiteDetail();
          return;
        }

        if (outcome.status === "invalid" || outcome.status === "unavailable") {
          setGrantError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session - the same genuinely-unexpected-here handling
        // `handleSaveOrigins` above gives its own equivalent outcomes.
        setError(strings.ownerCouldNotBeReached);
      })
      .catch((err: unknown) => {
        setGrantError(err instanceof Error ? err.message : strings.ownerSiteDetailGrantModuleFailed);
      })
      .finally(() => {
        setGrantSubmitting(false);
      });
  };

  // `23-65`/`adr/0118`: the revoke dialog's own confirm. `force`/`reason` are derived from
  // `revokingModule.grantedByOwner`, never typed by the platform owner directly - the dialog already
  // shows which case this is (`renderRevokeDialogBody` below), so asking them to also tick a "force"
  // box would be asking them to restate a fact the screen already told them, the same redundancy
  // `RemoveOperatorButton`'s own confirm avoids by not exposing mechanics the caller cannot change.
  const handleRevokeConfirm = () => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || !revokingModule) {
      return;
    }

    const isPurchase = !revokingModule.grantedByOwner;
    const trimmedReason = revokeReason.trim();
    if (isPurchase && trimmedReason.length === 0) {
      setRevokeError(strings.ownerReasonRequiredValidation);
      return;
    }

    setRevokeSubmitting(true);
    setRevokeError(null);

    revokeOwnerModule(accessToken, siteId, revokingModule.moduleKey, {
      force: isPurchase,
      reason: isPurchase ? trimmedReason : null,
    })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setRevokingModule(null);
          setRevokeReason("");
          loadSiteDetail();
          return;
        }

        if (
          outcome.status === "requires-force" ||
          outcome.status === "invalid" ||
          outcome.status === "unavailable"
        ) {
          setRevokeError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session - the module (or the site) is gone by the time
        // this was confirmed. Reported the same page-level way `handleSaveOrigins`'s own equivalent
        // case is.
        setRevokingModule(null);
        setError(strings.ownerCouldNotBeReached);
      })
      .catch((err: unknown) => {
        setRevokeError(err instanceof Error ? err.message : strings.ownerSiteDetailRevokeModuleFailed);
      })
      .finally(() => {
        setRevokeSubmitting(false);
      });
  };

  // `23-66`: the quantity dialog's own submit. Parses and validates the input, then - the one thing
  // that makes lowering a different act from raising one - checks whether the new number is below
  // what is currently granted; if it is, and the caller has not already confirmed, this stops short
  // of the network call and moves the dialog to its "confirm" stage instead. The actual request is
  // identical either way; only whether the impact was stated first differs.
  const handleQuantitySubmit = () => {
    if (!quantityModule) {
      return;
    }

    setQuantityError(null);

    const trimmed = quantityInput.trim();
    if (trimmed.length === 0) {
      setQuantityError(strings.ownerSiteDetailQuantityRequired);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setQuantityError(strings.ownerSiteDetailQuantityInvalid);
      return;
    }

    const current = quantityModule.quantity;
    const isLowering = current !== null && parsed < current;
    if (isLowering && quantityStage === "edit") {
      setQuantityStage("confirm");
      return;
    }

    submitQuantity(quantityModule.moduleKey, parsed);
  };

  const submitQuantity = (moduleKey: string, quantity: number) => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setQuantitySubmitting(true);
    setQuantityError(null);

    grantOwnerModuleQuantity(accessToken, siteId, moduleKey, quantity)
      .then((outcome) => {
        if (outcome.status === "ok") {
          setQuantityModule(null);
          setQuantityStage("edit");
          setQuantitySaved({ moduleKey: outcome.moduleKey, quantity: outcome.quantity });
          // Re-read rather than splice a locally-built row in - the same "the server's own read is
          // the only source for this table" reasoning `handleGrantSubmit`'s own remarks give. Chat's
          // own row reflects the grant immediately; the calendar's own projection of it does not
          // (the success message above states that bound), so this reload shows what chat now holds,
          // not yet what the calendar has applied.
          loadSiteDetail();
          return;
        }

        if (outcome.status === "invalid") {
          setQuantityError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session - the same genuinely-unexpected-here handling
        // every other write on this page gives its own equivalent outcomes.
        setQuantityModule(null);
        setError(strings.ownerCouldNotBeReached);
      })
      .catch((err: unknown) => {
        setQuantityError(err instanceof Error ? err.message : strings.ownerSiteDetailGrantQuantityFailed);
      })
      .finally(() => {
        setQuantitySubmitting(false);
      });
  };

  // `25-114`: the channel entitlement's own submit - always `CHANNEL_MODULE_KEY`, never a value read
  // from the form the way `moduleKeyInput`/`quantityModule.moduleKey` are for a real module. No
  // "lowering" confirm stage the way `handleQuantitySubmit` has: that stage compares the new number
  // against `quantityModule.quantity`, a value this screen actually holds because the row it came from
  // is real; there is no equivalent trustworthy "current" value here to compare against (this file's
  // own remarks on `channelQuantitySaved` above), so a smaller, honest one-step form is what the
  // available data supports rather than a dialog that would imply a comparison this screen cannot
  // actually make.
  const handleChannelQuantitySubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setChannelQuantityError(null);

    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    const trimmed = channelQuantityInput.trim();
    if (trimmed.length === 0) {
      setChannelQuantityError(strings.ownerSiteDetailQuantityRequired);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setChannelQuantityError(strings.ownerSiteDetailQuantityInvalid);
      return;
    }

    setChannelQuantitySubmitting(true);

    grantOwnerModuleQuantity(accessToken, siteId, CHANNEL_MODULE_KEY, parsed)
      .then((outcome) => {
        if (outcome.status === "ok") {
          setChannelQuantitySaved(outcome.quantity);
          setChannelQuantityInput(String(outcome.quantity));
          return;
        }

        if (outcome.status === "invalid") {
          setChannelQuantityError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session - the same genuinely-unexpected-here handling
        // every other write on this page gives its own equivalent outcomes.
        setError(strings.ownerCouldNotBeReached);
      })
      .catch((err: unknown) => {
        setChannelQuantityError(err instanceof Error ? err.message : strings.ownerSiteDetailGrantQuantityFailed);
      })
      .finally(() => {
        setChannelQuantitySubmitting(false);
      });
  };

  // `23-68`: the ordinary restore - tried with `force: false` first, always. Success and "already
  // held it" both land here as a plain confirmation; only "requires-force" branches into the dialog
  // below, and only that dialog ever sends `force: true`.
  const handleRestoreSeat = (operator: OwnerSiteOperator) => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setRestoringOperatorId(operator.operatorId);
    setRestoreError(null);
    setRestoreSaved(null);

    restoreOwnerOperatorSeat(accessToken, siteId, operator.operatorId, { force: false, reason: null })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setRestoreSaved({ operatorId: operator.operatorId, overrodeSeatLimit: outcome.result.overrodeSeatLimit });
          // Re-read rather than splice a locally-built row in - the same "the server's own read is
          // the only source for this table" reasoning `handleGrantSubmit`'s own remarks give, applied
          // to the operator roster this item adds alongside the module table.
          loadSiteDetail();
          return;
        }

        if (outcome.status === "requires-force") {
          setForceDialogOperator(operator);
          setForceDialogMessage(outcome.message);
          setForceReason("");
          setForceError(null);
          return;
        }

        if (outcome.status === "invalid") {
          // Not reachable with `force: false` (the server only asks for a reason once `force` is
          // set), but handled rather than silently swallowed - a refusal a person can act on, the
          // same posture every other outcome branch on this page keeps.
          setRestoreError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session - the same genuinely-unexpected-here handling
        // every other write on this page gives its own equivalent outcomes.
        setError(strings.ownerCouldNotBeReached);
      })
      .catch((err: unknown) => {
        setRestoreError(err instanceof Error ? err.message : strings.ownerSiteDetailRestoreSeatFailed);
      })
      .finally(() => {
        setRestoringOperatorId(null);
      });
  };

  // `23-68`: the seat-limit override, exercised only once the platform owner has read the server's
  // own message and typed why - `adr/0118`'s own "state plainly that you mean to override this and
  // say why" asymmetry, restated for a seat limit instead of a tenant's own purchase.
  const handleForceConfirm = () => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || !forceDialogOperator) {
      return;
    }

    const trimmedReason = forceReason.trim();
    if (trimmedReason.length === 0) {
      setForceError(strings.ownerReasonRequiredValidation);
      return;
    }

    setForceSubmitting(true);
    setForceError(null);

    restoreOwnerOperatorSeat(accessToken, siteId, forceDialogOperator.operatorId, { force: true, reason: trimmedReason })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setRestoreSaved({ operatorId: forceDialogOperator.operatorId, overrodeSeatLimit: outcome.result.overrodeSeatLimit });
          setForceDialogOperator(null);
          setForceReason("");
          loadSiteDetail();
          return;
        }

        if (outcome.status === "invalid" || outcome.status === "requires-force") {
          setForceError(outcome.message);
          return;
        }

        setForceDialogOperator(null);
        setError(strings.ownerCouldNotBeReached);
      })
      .catch((err: unknown) => {
        setForceError(err instanceof Error ? err.message : strings.ownerSiteDetailRestoreSeatFailed);
      })
      .finally(() => {
        setForceSubmitting(false);
      });
  };

  // `25-76`: the role-permission tool's own submit - one permission at a time, the picker's own
  // current selection for this role. No client-side vocabulary check: `site.allKnownPermissions` is
  // exactly what populates the picker's own options (`buildMissingPermissionOptions` below), so a
  // value this form could even submit is already real by construction; the server's own
  // `Role.PermissionUnknown` refusal stays the real gate, the same "the server is still the real
  // gate on everything else" split `handleGrantSubmit`'s own remarks state for its own form.
  const handleAddPermission = (role: OwnerSiteRole) => {
    const accessToken = user?.access_token;
    const permission = permissionSelections[role.name];
    if (!accessToken || !siteId || !permission) {
      return;
    }

    setAddingPermissionForRole(role.name);
    setAddPermissionError(null);
    setAddPermissionSaved(null);

    addOwnerRolePermissions(accessToken, siteId, role.name, { permissions: [permission] })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setAddPermissionSaved({ roleName: role.name, permission });
          setPermissionSelections((current) => ({ ...current, [role.name]: "" }));
          // Re-read rather than splice a locally-built permission list in - the same "the server's
          // own read is the only source for this table" reasoning `handleRestoreSeat`'s own remarks
          // give for the operator roster on this same screen.
          loadSiteDetail();
          return;
        }

        if (outcome.status === "invalid") {
          setAddPermissionError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session - the same genuinely-unexpected-here handling
        // every other write on this page gives its own equivalent outcomes.
        setError(strings.ownerCouldNotBeReached);
      })
      .catch((err: unknown) => {
        setAddPermissionError(err instanceof Error ? err.message : strings.ownerSiteDetailAddPermissionFailed);
      })
      .finally(() => {
        setAddingPermissionForRole(null);
      });
  };

  // `25-77`: opens the removal dialog for one (role, permission) pair - "no magic roles", so this is
  // offered for every permission a role currently holds, `Admin`'s own defining ones included, with no
  // carve-out on this screen either.
  const openRemovePermissionDialog = (roleName: string, permission: string) => {
    setRemovingPermission({ roleName, permission });
    setRemovePermissionReason("");
    setRemovePermissionError(null);
  };

  // `25-77`: the removal dialog's own confirm - a reason is required every time (never optional the
  // way the module-revoke dialog's own reason only applies to a tenant's own purchase), so this is the
  // one place the request can be refused client-side before it is even sent, the identical "write the
  // reason you would be willing to show this tenant" wording `handleForceConfirm`'s own guard already
  // uses for a different override.
  const handleRemovePermissionConfirm = () => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || !removingPermission) {
      return;
    }

    const trimmedReason = removePermissionReason.trim();
    if (trimmedReason.length === 0) {
      setRemovePermissionError(strings.ownerReasonRequiredValidation);
      return;
    }

    setRemovePermissionSubmitting(true);
    setRemovePermissionError(null);

    removeOwnerRolePermissions(accessToken, siteId, removingPermission.roleName, {
      permissions: [removingPermission.permission],
      reason: trimmedReason,
    })
      .then((outcome) => {
        if (outcome.status === "ok") {
          setRemovePermissionSaved({ roleName: removingPermission.roleName, permission: removingPermission.permission });
          setRemovingPermission(null);
          setRemovePermissionReason("");
          // Re-read rather than splice a locally-built permission list out - the same "the server's
          // own read is the only source for this table" reasoning `handleAddPermission`'s own remarks
          // give a few lines up, for the identical reason.
          loadSiteDetail();
          return;
        }

        if (outcome.status === "invalid") {
          setRemovePermissionError(outcome.message);
          return;
        }

        setRemovingPermission(null);
        setError(strings.ownerCouldNotBeReached);
      })
      .catch((err: unknown) => {
        setRemovePermissionError(err instanceof Error ? err.message : strings.ownerSiteDetailRemovePermissionFailed);
      })
      .finally(() => {
        setRemovePermissionSubmitting(false);
      });
  };

  // `22-08`/`adr/0166`: the account-wide freeze's own single confirm handler, shared by all three
  // acts (suspend/extend/lift) - `suspendDialogMode` decides which call to make, the same "one
  // dialog, one confirm, the mode decides the request" shape this page keeps small rather than three
  // near-identical handlers.
  const handleSuspensionConfirm = () => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || !suspendDialogMode) {
      return;
    }

    const trimmedReason = suspendReasonInput.trim();
    if (trimmedReason.length === 0) {
      setSuspendError(strings.ownerSiteDetailSuspensionReasonRequired);
      return;
    }

    let minutes = 0;
    if (suspendDialogMode !== "lift") {
      minutes = Number.parseInt(suspendMinutesInput, 10);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setSuspendError(strings.ownerMinutesInvalid);
        return;
      }
    }

    setSuspendSubmitting(true);
    setSuspendError(null);

    const onSettled = (ok: boolean, message?: string) => {
      if (ok) {
        setSuspendDialogMode(null);
        setSuspendReasonInput("");
        setSuspendMinutesInput("60");
        loadSiteDetail();
        return;
      }

      if (message) {
        setSuspendError(message);
        return;
      }

      setSuspendDialogMode(null);
      setError(strings.ownerCouldNotBeReached);
    };

    const request =
      suspendDialogMode === "suspend"
        ? suspendOwnerSite(accessToken, siteId, minutes, trimmedReason)
        : suspendDialogMode === "extend"
          ? extendOwnerSuspension(accessToken, siteId, minutes, trimmedReason)
          : unblockOwnerSuspension(accessToken, siteId, trimmedReason);

    request
      .then((outcome) => {
        if (outcome.status === "ok") {
          onSettled(true);
          return;
        }

        if (outcome.status === "conflict" || outcome.status === "invalid") {
          onSettled(false, outcome.message);
          return;
        }

        onSettled(false);
      })
      .catch((err: unknown) => {
        setSuspendError(err instanceof Error ? err.message : strings.ownerSiteDetailSuspensionUpdateFailed);
      })
      .finally(() => {
        setSuspendSubmitting(false);
      });
  };

  return (
    <AppShell
      // The identical sections `OwnerSitesPage` builds - "Platform sites" stays present as
      // `pinnedItem` and, unlike that page's own `end: true`, is highlighted while on this sub-route
      // too (`end: false`): this screen is still part of the platform-sites section, one tenant deep
      // into it.
      sections={ownSiteId ? buildTenantNavSections(hasPermission, strings, enabledModules ?? []) : []}
      // `23-43`: only once the server has actually accepted this caller, exactly as
      // `demoNoticeAudience` below already is. The demo console's operator login is published,
      // so anyone can sign in and type `/owner`; drawing a rail link to a view they were just
      // refused tells a stranger that a platform-operations view exists and where it lives.
      // "unknown" draws nothing either - a link that appears for a moment and then vanishes on
      // the refusal has already said it.
      pinnedItem={access === "granted" ? { to: "/owner", label: strings.navPlatformSites, end: false } : undefined}
      // `23-45`: as OwnerSitesPage - see that file, and `PublicDemoNotice`'s own remarks.
      credentialsArePublished={false}
      wide
      identity={
        <ShellIdentity operator={operatorDisplayName(user)} siteId={ownSiteId} onSignOut={() => void logout()} />
      }
    >
      {access === "unknown" && error === null && <Spinner label={strings.ownerSiteDetailOpeningLabel} />}

      {access === "refused" && (
        <>
          <PageHead title={strings.ownerOperationsTitle} />
          {/* `23-43`: says that the caller was refused, and no longer says by what. "Restricted to
              the platform owner" told a reader who is not one that such a role exists on this
              deployment - which on a console whose operator login is published means telling
              anybody. Refusing without naming the thing refused is the smaller disclosure and is
              equally true; the reader who *is* the owner never sees this branch. */}
          <Alert tone="danger" title={strings.ownerNotAuthorizedTitle}>
            {strings.ownerSiteAccessRefusedBody}
          </Alert>
        </>
      )}

      {access === "not-found" && (
        <>
          <PageHead title={strings.navPlatformSites} />
          <Alert tone="danger" title={strings.ownerSiteDetailNoSuchSiteTitle}>
            {strings.ownerSiteDetailNoSuchSiteBody}
          </Alert>
          <p>
            <Link to="/owner">{strings.ownerSiteDetailBackToList}</Link>
          </p>
        </>
      )}

      {error !== null && access !== "refused" && access !== "not-found" && (
        <>
          {access === "unknown" && <PageHead title={strings.navPlatformSites} />}
          <Alert tone="danger">{error}</Alert>
        </>
      )}

      {access === "granted" && site !== null && (
        <>
          <PageHead
            title={site.name.trim().length > 0 ? site.name : strings.ownerUnnamedSite}
            description={`${strings.ownerSiteDetailDescriptionPrefix}${describeRecentWindow(site.recentWindowDays, strings)}${strings.ownerSitesDescriptionWindowedSuffix}`}
          />

          <dl className="ago-owner-detail-facts">
            <div>
              <dt>{strings.ownerSiteDetailFactSiteId}</dt>
              <dd>
                <Badge tone="neutral" mono>
                  {site.siteId}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>{strings.ownerSitesColumnTier}</dt>
              <dd>
                <Badge tone="neutral">{site.tier}</Badge>
              </dd>
            </div>
            <div>
              <dt>{strings.ownerSitesColumnSeats}</dt>
              <dd>{formatCount(site.seatCount)}</dd>
            </div>
            <div>
              <dt>{strings.ownerSitesColumnConversations}</dt>
              <dd>{formatCount(site.conversationCount)}</dd>
            </div>
            <div>
              <dt>{formatRecentMessagesHeader(site.recentWindowDays, strings)}</dt>
              <dd>{formatCount(site.recentMessageCount)}</dd>
            </div>
            <div>
              <dt>{strings.ownerSitesColumnAttachments}</dt>
              <dd>
                <span title={`${formatCount(site.attachmentBytes)}${strings.ownerBytesSuffix}`}>
                  {formatByteSize(site.attachmentBytes)}
                </span>
              </dd>
            </div>
            <div>
              <dt>{strings.ownerSitesColumnCreated}</dt>
              <dd>
                {renderDateFact(
                  site.createdAt,
                  timeZone,
                  strings.ownerSitesNotRecorded,
                  strings.ownerSitesNotRecordedTitle,
                )}
              </dd>
            </div>
            <div>
              <dt>{strings.ownerSitesColumnLastActivity}</dt>
              <dd>
                {renderDateFact(
                  site.lastMessageAt,
                  timeZone,
                  formatNoRecentActivity(site.recentWindowDays, strings),
                  `${strings.ownerSitesLastActivityTitlePrefix}${describeRecentWindow(site.recentWindowDays, strings)}${strings.ownerSitesLastActivityTitleSuffix}`,
                )}
              </dd>
            </div>
          </dl>

          {/* `23-48`: the platform owner's own editor - the only place any of it may be changed at
              all. Neither the tenant's own console nor this screen's read-only entitlements table
              below gets a form; this is the one field on this page that writes anything. */}
          <Panel
            title={strings.ownerSiteDetailOriginsTitle}
            description={strings.ownerSiteDetailOriginsDescription}
          >
            <Field
              label={strings.ownerSiteDetailOriginsFieldLabel}
              description={strings.ownerSiteDetailOriginsFieldDescription}
              error={originsError}
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  rows={4}
                  value={originsDraft}
                  onChange={(event) => {
                    setOriginsDraft(event.target.value);
                    setOriginsSaved(false);
                  }}
                />
              )}
            </Field>
            <p>
              <Button onClick={handleSaveOrigins} disabled={originsSaving}>
                {originsSaving ? strings.ownerSavingLabel : strings.ownerSiteDetailOriginsSaveButton}
              </Button>
            </p>
            {originsSaved && !originsError && (
              <Alert tone="success">{strings.ownerSiteDetailOriginsSaved}</Alert>
            )}
          </Panel>

          {/* `22-08`/`adr/0166`: the account-wide enforcement freeze - a suspected violation, never
              a commercial lever. Account-wide: suspending here stops the calendar accepting a new
              booking and stops the widget being served for a new chat session alike; a conversation
              already open is untouched and a booking already made stands. */}
          <Panel
            title={strings.ownerSiteDetailSuspensionTitle}
            description={strings.ownerSiteDetailSuspensionDescription}
          >
            {isCurrentlySuspended(site) ? (
              <>
                <Alert tone="danger" title={strings.ownerSiteDetailSuspendedTitle}>
                  {strings.ownerSiteDetailSuspendedUntilPrefix}
                  {formatAbsolute(parseInstant(site.suspendedUntil), timeZone)}
                  {strings.ownerSiteDetailSuspendedUntilSuffix}
                </Alert>
                <p className="ago-row">
                  <Button
                    onClick={() => {
                      setSuspendDialogMode("extend");
                      setSuspendMinutesInput("60");
                      setSuspendReasonInput("");
                      setSuspendError(null);
                    }}
                  >
                    {strings.ownerExtendButton}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSuspendDialogMode("lift");
                      setSuspendReasonInput("");
                      setSuspendError(null);
                    }}
                  >
                    {strings.ownerSiteDetailUnblockNowButton}
                  </Button>
                </p>
              </>
            ) : (
              <>
                <Alert tone="info">{strings.ownerSiteDetailNotSuspended}</Alert>
                <p>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setSuspendDialogMode("suspend");
                      setSuspendMinutesInput("60");
                      setSuspendReasonInput("");
                      setSuspendError(null);
                    }}
                  >
                    {strings.ownerSiteDetailSuspendButton}
                  </Button>
                </p>
              </>
            )}
          </Panel>

          {/* `23-68`: "a locked-out tenant can be let back in without a database" - the recovery this
              item exists to build, reached from the same screen `23-65`'s own module grant/revoke
              already lives on, not a new one. */}
          <h2>{strings.ownerSiteDetailOperatorsHeading}</h2>

          <Alert tone="info">{strings.ownerSiteDetailOperatorsNote}</Alert>

          {restoreSaved && !restoreError && (
            <Alert tone="success">
              {strings.ownerSiteDetailSeatRestoredPrefix}
              {restoreSaved.overrodeSeatLimit
                ? strings.ownerSiteDetailSeatRestoredOverLimit
                : strings.ownerSiteDetailSeatRestoredOk}
            </Alert>
          )}
          {restoreError && <Alert tone="danger">{restoreError}</Alert>}

          {site.operators.length === 0 ? (
            <p className="ago-empty">{strings.ownerSiteDetailNoOperators}</p>
          ) : (
            <Table
              caption={strings.ownerSiteDetailOperatorsCaption}
              columns={buildOperatorColumns(strings, restoringOperatorId, handleRestoreSeat)}
              rows={site.operators}
              rowKey={(operator) => operator.operatorId}
            />
          )}

          {/* `25-76`/`25-77`: "the owner can see and fix a tenant's actual role permissions" -
              `RegisterSiteHandler`/`MintDemoTenantHandler` write a site's roles once, at registration,
              with whatever permission list that handler's own source happened to name that day;
              nothing since ever revisits an already-created row. This section shows what a role
              actually holds right now, never a template, and lets the owner add whatever it is
              missing or remove whatever it should not have - "no magic roles"
              (`docs/backlog/25-77-*.md`'s own "Answered"): any permission, `Admin`'s own defining ones
              included, may be removed, no carve-out on this screen either. */}
          <h2>{strings.ownerSiteDetailRolePermissionsHeading}</h2>

          <Alert tone="info">{strings.ownerSiteDetailRolePermissionsNote}</Alert>

          {addPermissionSaved && !addPermissionError && (
            <Alert tone="success">
              {strings.ownerSiteDetailAddedPrefix}
              <code>{addPermissionSaved.permission}</code>
              {strings.ownerSiteDetailAddedToInfix}
              {addPermissionSaved.roleName}.
            </Alert>
          )}
          {addPermissionError && <Alert tone="danger">{addPermissionError}</Alert>}
          {removePermissionSaved && !removePermissionError && (
            <Alert tone="success">
              {strings.ownerSiteDetailRemovedPrefix}
              <code>{removePermissionSaved.permission}</code>
              {strings.ownerSiteDetailRemovedFromInfix}
              {removePermissionSaved.roleName}.
            </Alert>
          )}

          {site.roles.length === 0 ? (
            <p className="ago-empty">{strings.ownerSiteDetailNoRoles}</p>
          ) : (
            site.roles.map((role) => {
              const missingPermissions = site.allKnownPermissions
                .filter((permission) => !role.permissions.includes(permission))
                .sort();
              const selected = permissionSelections[role.name] ?? "";
              const busy = addingPermissionForRole === role.name;

              return (
                <Panel key={role.name} title={role.name} quiet>
                  {role.permissions.length === 0 ? (
                    <p className="ago-empty">{strings.ownerSiteDetailNoPermissions}</p>
                  ) : (
                    <p className="ago-row">
                      {role.permissions
                        .slice()
                        .sort()
                        .map((permission) => (
                          <span key={permission} className="ago-row">
                            <Badge tone="neutral" mono>
                              {permission}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`${strings.ownerSiteDetailRemoveAriaPrefix}${permission}${strings.ownerSiteDetailRemoveAriaFromInfix}${role.name}`}
                              onClick={() => openRemovePermissionDialog(role.name, permission)}
                            >
                              {strings.ownerSiteDetailRemoveButton}
                            </Button>
                          </span>
                        ))}
                    </p>
                  )}

                  {missingPermissions.length === 0 ? (
                    <p className="ago-empty">{strings.ownerSiteDetailAllPermissionsHeld}</p>
                  ) : (
                    <p className="ago-row">
                      <Select
                        aria-label={`${strings.ownerSiteDetailAddPermissionAriaPrefix}${role.name}`}
                        value={selected}
                        onChange={(event) =>
                          setPermissionSelections((current) => ({ ...current, [role.name]: event.target.value }))
                        }
                        disabled={busy}
                      >
                        <option value="">{strings.ownerSiteDetailChoosePermission}</option>
                        {missingPermissions.map((permission) => (
                          <option key={permission} value={permission}>
                            {permission}
                          </option>
                        ))}
                      </Select>
                      <Button onClick={() => handleAddPermission(role)} disabled={!selected || busy}>
                        {busy ? strings.ownerSiteDetailAddingLabel : strings.ownerSiteDetailAddPermissionButton}
                      </Button>
                    </p>
                  )}
                </Panel>
              );
            })
          )}

          <h2>{strings.ownerSiteDetailEntitlementsHeading}</h2>

          {/* The expiry warning, in words (`flows.md` 5.2, this item's own Done-when): `expiresAt`
              binds the granting side only. Chat stops offering a lapsed module the instant it
              expires, but the module itself is never told - so a screen presenting expiry as a clean
              end date would be lying to its own author. Shown once, above the table, rather than
              repeated per row. */}
          <Alert tone="info">{strings.ownerSiteDetailExpiryWarning}</Alert>

          {/* `23-66`: a quantity's own read only ever comes from this row, never from the module -
              this screen shows what was granted, not what the module has caught up to applying.
              `23-89`: the wording used to point at "the outbox's own poll interval" as though that
              were the actual mechanism - it is only the dispatcher's fallback for a missed wake-up
              (`Ago.Chat.Worker.OutboxDispatcherOptions.PollInterval`'s own remarks). The number below
              ("a minute or so") is that fallback plus one publish retry
              (`OutboxDispatcherOptions.PublishTimeout`), not a guess - see this item's report for the
              exact constants. What this alert cannot promise is a bound during a genuine broker
              outage, which is why it says "running behind" rather than naming a hard ceiling. */}
          <Alert tone="info">{strings.ownerSiteDetailQuantityAsyncNote}</Alert>

          {quantitySaved && (
            <Alert tone="success">
              {strings.ownerSiteDetailQuantityGrantedPrefix}
              {formatModuleQuantity(quantitySaved.quantity, strings)}
              {strings.ownerSiteDetailQuantityGrantedForInfix}
              {quantitySaved.moduleKey}
              {strings.ownerSiteDetailQuantityGrantedSuffix}
            </Alert>
          )}

          {site.modules.length === 0 ? (
            <p className="ago-empty">{strings.ownerSiteDetailNoModules}</p>
          ) : (
            <Table
              caption={strings.ownerSiteDetailModulesCaption}
              columns={moduleColumns}
              rows={site.modules}
              rowKey={(module) => module.id}
            />
          )}

          {/* `23-65`/`adr/0150`: the grant form itself. No `provisioningSecret` field anywhere on
              this page - the browser never holds `adr/0095`'s deployment-wide secret, `Ago.Chat.Api`
              supplies it from its own configuration, and this form's own request body has no field
              to carry one even if someone tried.

              `23-92`/`adr/0154`: no "Entry point" field either, for the identical reason - the
              platform owner can already read a declared module's address from the cluster, so asking
              them to retype it here was a second inconvenience, not a second safeguard. A module this
              deployment has not declared an entry point for is refused server-side, naming the missing
              key, the same as an unconfigured provisioning secret is. */}
          <Panel
            title={strings.ownerSiteDetailGrantModuleTitle}
            description={strings.ownerSiteDetailGrantModuleDescription}
          >
            <form className="ago-stack" onSubmit={handleGrantSubmit}>
              <Field label={strings.ownerSiteDetailModuleKeyLabel}>
                {(controlProps) => (
                  <Select
                    {...controlProps}
                    value={moduleKeyInput}
                    onChange={(event) => setModuleKeyInput(event.target.value)}
                    disabled={grantSubmitting}
                  >
                    {KNOWN_MODULE_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label={strings.ownerSiteDetailTriggerWordsLabel} description={strings.ownerSiteDetailTriggerWordsDescription}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    value={triggerWordsInput}
                    onChange={(event) => setTriggerWordsInput(event.target.value)}
                    placeholder="/booking"
                    disabled={grantSubmitting}
                  />
                )}
              </Field>

              <Field
                label={strings.ownerSiteDetailCredentialLabel}
                description={strings.ownerSiteDetailCredentialDescription}
                adornment={
                  <>
                    <Button onClick={handleGenerateCredential} disabled={grantSubmitting}>
                      {strings.ownerSiteDetailGenerateButton}
                    </Button>
                    {credentialRevealed && credentialInput.length > 0 && (
                      <Button onClick={handleCopyCredential} disabled={grantSubmitting}>
                        {credentialCopied ? strings.ownerSiteDetailCopiedLabel : strings.ownerSiteDetailCopyButton}
                      </Button>
                    )}
                  </>
                }
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type={credentialRevealed ? "text" : "password"}
                    autoComplete="off"
                    value={credentialInput}
                    onChange={(event) => {
                      setCredentialInput(event.target.value);
                      setCredentialCopied(false);
                    }}
                    disabled={grantSubmitting}
                  />
                )}
              </Field>

              {/* `adr/0150`'s own "a grant with no expiry is a discount nobody remembers giving":
                  neither radio starts selected, so submitting with neither chosen is the one thing
                  this form refuses before it ever reaches the server - see handleGrantSubmit's own
                  check. */}
              <fieldset>
                <legend>{strings.ownerSiteDetailExpiryLegend}</legend>
                <label className="ago-row">
                  <input
                    type="radio"
                    name="owner-module-expiry"
                    checked={expiryChoice === "never"}
                    onChange={() => setExpiryChoice("never")}
                    disabled={grantSubmitting}
                  />
                  <span>{strings.ownerSiteDetailNeverExpiresLabel}</span>
                </label>
                <label className="ago-row">
                  <input
                    type="radio"
                    name="owner-module-expiry"
                    checked={expiryChoice === "date"}
                    onChange={() => setExpiryChoice("date")}
                    disabled={grantSubmitting}
                  />
                  <span>{strings.ownerSiteDetailExpiresOnLabel}</span>
                  <input
                    type="datetime-local"
                    value={expiryDateInput}
                    onFocus={() => setExpiryChoice("date")}
                    onChange={(event) => {
                      setExpiryChoice("date");
                      setExpiryDateInput(event.target.value);
                    }}
                    disabled={grantSubmitting}
                  />
                </label>
              </fieldset>

              {grantError && <Alert tone="danger">{grantError}</Alert>}
              {grantSaved && !grantError && <Alert tone="success">{strings.ownerSiteDetailGrantSaved}</Alert>}

              <div className="ago-row">
                <Button type="submit" variant="primary" disabled={grantSubmitting}>
                  {grantSubmitting ? strings.ownerSiteDetailGrantingLabel : strings.ownerSiteDetailGrantModuleButton}
                </Button>
              </div>
            </form>
          </Panel>

          {/* `25-114`: a dedicated section, deliberately not a row in the Entitlements table above -
              "channel" is not a module the way `calendar`/`faq` are (no entry point, no
              `enabled_modules` row - `ChannelEntitlement.cs`'s own remarks), and giving it a
              module-shaped row just to reuse the table/dialog above would tell a reader it is
              registered the same way a real module is, which is exactly the confusion that class's
              own comment warns a real row would cause. This still calls the identical
              `grantOwnerModuleQuantity`/`GrantModuleQuantityAsOwnerHandler` (`23-66`) the table's own
              quantity dialog calls - the write is the same act, only the surface reaching it differs. */}
          <h2>{strings.ownerSiteDetailChannelEntitlementHeading}</h2>

          <Panel
            title={strings.ownerSiteDetailChannelEntitlementTitle}
            description={strings.ownerSiteDetailChannelEntitlementDescription}
          >
            <Alert tone="info">{strings.ownerSiteDetailChannelEntitlementNote}</Alert>

            {/* `25-114`'s own honest limitation, stated here rather than guessed at: this screen was
                never sent this tenant's actual standing channel quantity (see this file's own remarks
                on `channelQuantitySaved` above) - it can only report what was granted in this
                browser's current session, not "the truth" the way the Entitlements table above can for
                a real module row. */}
            <p className="ago-meta">
              {channelQuantitySaved === null
                ? strings.ownerSiteDetailChannelQuantityUnknown
                : `${strings.ownerSiteDetailChannelQuantityGrantedThisSessionPrefix}${formatModuleQuantity(channelQuantitySaved, strings)}`}
            </p>

            <form className="ago-stack" onSubmit={handleChannelQuantitySubmit}>
              <Field
                label={strings.ownerSiteDetailQuantityFieldLabel}
                description={strings.ownerSiteDetailQuantityFieldDescription}
                error={channelQuantityError}
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type="number"
                    min={0}
                    step={1}
                    value={channelQuantityInput}
                    onChange={(event) => setChannelQuantityInput(event.target.value)}
                    disabled={channelQuantitySubmitting}
                  />
                )}
              </Field>

              <div className="ago-row">
                <Button type="submit" variant="primary" disabled={channelQuantitySubmitting}>
                  {channelQuantitySubmitting
                    ? strings.ownerSiteDetailGrantingLabel
                    : strings.ownerSiteDetailChannelQuantityButton}
                </Button>
              </div>
            </form>
          </Panel>
        </>
      )}

      {/* `23-65`/`adr/0118`: provenance is shown here, before the confirm - never left for after,
          since it is not recoverable once the row is gone (this item's own Done-when). */}
      <Dialog
        open={revokingModule !== null}
        title={
          revokingModule
            ? `${strings.ownerSiteDetailRevokeDialogTitlePrefix}${revokingModule.moduleKey}`
            : strings.ownerSiteDetailRevokeDialogTitleFallback
        }
        onClose={() => {
          if (!revokeSubmitting) {
            setRevokingModule(null);
          }
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokingModule(null)} disabled={revokeSubmitting}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={handleRevokeConfirm} disabled={revokeSubmitting}>
              {revokeSubmitting ? strings.ownerSiteDetailRevokingLabel : strings.ownerSiteDetailRevokeButton}
            </Button>
          </>
        }
      >
        {revokingModule && (
          <>
            {revokingModule.grantedByOwner ? (
              <p>
                <Badge tone="accent">{strings.ownerSiteDetailGrantedByOwner}</Badge>
                {strings.ownerSiteDetailRevokeOwnerGrantedNote}
              </p>
            ) : (
              <>
                <p>
                  <Badge tone="neutral">{strings.ownerSiteDetailGrantedByTenant}</Badge>
                  {strings.ownerSiteDetailRevokeTenantPurchasedNote}
                </p>
                <Field
                  label={strings.ownerReasonFieldLabel}
                  description={strings.ownerReasonFieldDescription}
                  error={revokeError}
                >
                  {(controlProps) => (
                    <Textarea
                      {...controlProps}
                      rows={3}
                      value={revokeReason}
                      onChange={(event) => setRevokeReason(event.target.value)}
                      disabled={revokeSubmitting}
                    />
                  )}
                </Field>
              </>
            )}
            {revokingModule.grantedByOwner && revokeError && <Alert tone="danger">{revokeError}</Alert>}
          </>
        )}
      </Dialog>

      {/* `25-77`: "no magic roles" - this dialog offers the exact same removal for `Admin`'s own
          defining permissions as for any other; nothing here narrows what may be removed. A reason is
          required unconditionally (`adr/0118`'s own forced-revoke discipline), unlike the module-revoke
          dialog above where a reason only applies to a tenant's own purchase - so this dialog always
          shows the reason field, never conditionally. */}
      <Dialog
        open={removingPermission !== null}
        title={
          removingPermission
            ? `${strings.ownerSiteDetailRemoveDialogTitlePrefix}${removingPermission.permission}`
            : strings.ownerSiteDetailRemoveDialogTitleFallback
        }
        onClose={() => {
          if (!removePermissionSubmitting) {
            setRemovingPermission(null);
          }
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemovingPermission(null)} disabled={removePermissionSubmitting}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={handleRemovePermissionConfirm} disabled={removePermissionSubmitting}>
              {removePermissionSubmitting ? strings.ownerSiteDetailRemovingLabel : strings.ownerSiteDetailRemoveDialogTitleFallback}
            </Button>
          </>
        }
      >
        {removingPermission && (
          <>
            <p>
              {strings.ownerSiteDetailRemovingFromRolePrefix}
              <code>{removingPermission.permission}</code>
              {strings.ownerSiteDetailRemovingFromRoleInfix}
              <strong>{removingPermission.roleName}</strong>
              {strings.ownerSiteDetailRemovingFromRoleSuffix}
            </p>
            <Field
              label={strings.ownerReasonFieldLabel}
              description={strings.ownerReasonFieldDescription}
              error={removePermissionError}
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  rows={3}
                  value={removePermissionReason}
                  onChange={(event) => setRemovePermissionReason(event.target.value)}
                  disabled={removePermissionSubmitting}
                />
              )}
            </Field>
          </>
        )}
      </Dialog>

      {/* `23-66`: lowering a quantity is not the same act as raising one (this item's own Scope) -
          `quantityStage === "confirm"` is reached only when the new number is below what is currently
          granted, and it states the impact before the request that would cause it is ever sent. */}
      <Dialog
        open={quantityModule !== null}
        title={
          quantityModule
            ? `${strings.ownerSiteDetailQuantityDialogTitlePrefix}${quantityModule.moduleKey}`
            : strings.ownerSiteDetailQuantityDialogTitleFallback
        }
        onClose={() => {
          if (!quantitySubmitting) {
            setQuantityModule(null);
          }
        }}
        footer={
          quantityStage === "confirm" ? (
            <>
              <Button variant="ghost" onClick={() => setQuantityStage("edit")} disabled={quantitySubmitting}>
                {strings.ownerSiteDetailBackButton}
              </Button>
              <Button variant="danger" onClick={handleQuantitySubmit} disabled={quantitySubmitting}>
                {quantitySubmitting ? strings.ownerSiteDetailGrantingLabel : strings.ownerSiteDetailConfirmLowerQuantityButton}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setQuantityModule(null)} disabled={quantitySubmitting}>
                {strings.cancelButton}
              </Button>
              <Button variant="primary" onClick={handleQuantitySubmit} disabled={quantitySubmitting}>
                {quantitySubmitting ? strings.ownerSiteDetailGrantingLabel : strings.ownerSiteDetailGrantQuantityButton}
              </Button>
            </>
          )
        }
      >
        {quantityModule && quantityStage === "edit" && (
          <>
            <p>
              {strings.ownerSiteDetailCurrentlyPrefix}
              {quantityModule.quantity === null
                ? strings.ownerSiteDetailCurrentlyNotGranted
                : `${strings.ownerSiteDetailCurrentlyGrantedPrefix}${formatModuleQuantity(quantityModule.quantity, strings)}.`}
            </p>
            <Field
              label={strings.ownerSiteDetailQuantityFieldLabel}
              description={strings.ownerSiteDetailQuantityFieldDescription}
              error={quantityError}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="number"
                  min={0}
                  step={1}
                  value={quantityInput}
                  onChange={(event) => setQuantityInput(event.target.value)}
                  disabled={quantitySubmitting}
                />
              )}
            </Field>
          </>
        )}

        {quantityModule && quantityStage === "confirm" && (
          <>
            <p>
              {strings.ownerSiteDetailLoweringPrefix}
              {quantityModule.moduleKey}
              {strings.ownerSiteDetailLoweringFromInfix}
              {formatModuleQuantity(quantityModule.quantity, strings)}
              {strings.ownerSiteDetailLoweringToInfix}
              {quantityInput}
              {strings.ownerSiteDetailLoweringSuffix}
              {(quantityModule.quantity ?? 0) - Number(quantityInput)}
              {strings.ownerSiteDetailLoweringSuffix2}
            </p>
            {quantityError && <Alert tone="danger">{quantityError}</Alert>}
          </>
        )}
      </Dialog>

      {/* `23-68`: the seat-limit override - opened only once the server itself says the ordinary
          restore would exceed this tenant's own seat limit, never guessed at client-side
          (`handleRestoreSeat`'s own remarks). `adr/0118`'s own "state plainly that you mean to
          override this and say why", restated for a seat limit instead of a tenant's own purchase. */}
      <Dialog
        open={forceDialogOperator !== null}
        title={
          forceDialogOperator
            ? `${strings.ownerSiteDetailForceDialogTitlePrefix}${operatorLabel(forceDialogOperator, strings)}${strings.ownerSiteDetailForceDialogTitleInfix}`
            : strings.ownerSiteDetailForceDialogTitleFallback
        }
        onClose={() => {
          if (!forceSubmitting) {
            setForceDialogOperator(null);
          }
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForceDialogOperator(null)} disabled={forceSubmitting}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={handleForceConfirm} disabled={forceSubmitting}>
              {forceSubmitting ? strings.ownerSiteDetailRestoringLabel : strings.ownerSiteDetailOverrideSeatLimitButton}
            </Button>
          </>
        }
      >
        {forceDialogOperator && (
          <>
            <p>{forceDialogMessage}</p>
            <Field
              label={strings.ownerReasonFieldLabel}
              description={strings.ownerReasonFieldDescription}
              error={forceError}
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  rows={3}
                  value={forceReason}
                  onChange={(event) => setForceReason(event.target.value)}
                  disabled={forceSubmitting}
                />
              )}
            </Field>
          </>
        )}
      </Dialog>

      {/* `22-08`/`adr/0166`: one dialog, shared by suspend/extend/lift - `suspendDialogMode` decides
          the title, whether the minutes field is shown at all (lift needs none), and which call
          `handleSuspensionConfirm` makes. */}
      <Dialog
        open={suspendDialogMode !== null}
        title={
          suspendDialogMode === "suspend"
            ? strings.ownerSiteDetailSuspendButton
            : suspendDialogMode === "extend"
              ? strings.ownerExtendDialogTitle
              : strings.ownerUnblockDialogTitle
        }
        onClose={() => {
          if (!suspendSubmitting) {
            setSuspendDialogMode(null);
          }
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSuspendDialogMode(null)} disabled={suspendSubmitting}>
              {strings.cancelButton}
            </Button>
            <Button
              variant={suspendDialogMode === "lift" ? "secondary" : "danger"}
              onClick={handleSuspensionConfirm}
              disabled={suspendSubmitting}
            >
              {suspendSubmitting
                ? strings.ownerSavingLabel
                : suspendDialogMode === "suspend"
                  ? strings.ownerSiteDetailSuspendConfirmLabel
                  : suspendDialogMode === "extend"
                    ? strings.ownerExtendButton
                    : strings.ownerUnblockButton}
            </Button>
          </>
        }
      >
        {suspendDialogMode !== null && (
          <>
            {suspendDialogMode !== "lift" && (
              <Field
                label={suspendDialogMode === "suspend" ? strings.ownerSiteDetailDurationMinutesLabel : strings.ownerAdditionalMinutesLabel}
                description={
                  suspendDialogMode === "suspend"
                    ? strings.ownerSiteDetailDurationFromNowDescription
                    : strings.ownerAdditionalMinutesDescription
                }
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type="number"
                    min={1}
                    step={1}
                    value={suspendMinutesInput}
                    onChange={(event) => setSuspendMinutesInput(event.target.value)}
                    disabled={suspendSubmitting}
                  />
                )}
              </Field>
            )}
            <Field
              label={strings.ownerReasonFieldLabel}
              description={strings.ownerReasonFieldDescription}
              error={suspendError}
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  rows={3}
                  value={suspendReasonInput}
                  onChange={(event) => setSuspendReasonInput(event.target.value)}
                  disabled={suspendSubmitting}
                />
              )}
            </Field>
          </>
        )}
      </Dialog>
    </AppShell>
  );
}

/** `22-08`: whether this screen should show "currently suspended" - a plain client-side comparison
 * against the browser's own clock, for display only. The actual enforcement is entirely server-side
 * (`Ago.Chat.Application.Abstractions.ISiteSuspensionReadStore`'s own live comparison); this only
 * decides which of the two panels above to draw, so a few seconds of client clock skew costs nothing
 * more than a stale-looking button for a moment. */
function isCurrentlySuspended(site: OwnerSiteDetail): boolean {
  if (site.suspendedUntil === null) {
    return false;
  }

  const until = new Date(site.suspendedUntil).getTime();
  return Number.isFinite(until) && until > Date.now();
}

/** `createdAt`/`lastMessageAt` share the identical "null means something specific, say what" shape
 * `OwnerSitesPage`'s own table columns already establish for these two fields - reused here rather
 * than re-derived, since drilling into a row must not disagree with what the row itself said.
 *
 * `25-89`: `emptyLabel`/`emptyTitle` arrive pre-translated from the caller (both call sites already
 * had a `strings` value in scope) rather than this function taking `strings` itself - the same
 * "the caller resolves the words, this function only decides which branch" shape `renderDateFact`
 * always had, now carried through to translated text instead of fixed English. */
function renderDateFact(
  value: string | null,
  timeZone: string | null,
  emptyLabel: string,
  emptyTitle: string,
) {
  const parsed = parseInstant(value);
  if (parsed === null) {
    return (
      <span className="ago-meta" title={emptyTitle}>
        {emptyLabel}
      </span>
    );
  }

  return <span title={formatAbsolute(parsed, timeZone)}>{formatDateStamp(parsed, timeZone)}</span>;
}

function buildModuleColumns(
  timeZone: string | null,
  strings: ConsoleStrings,
  onRevoke: (module: OwnerSiteModule) => void,
  onSetQuantity: (module: OwnerSiteModule) => void,
): TableColumn<OwnerSiteModule>[] {
  return [
    {
      key: "module",
      header: strings.ownerSiteDetailColumnModule,
      render: (module) => <Badge tone="neutral">{module.moduleKey}</Badge>,
    },
    {
      key: "triggerWords",
      header: strings.ownerSiteDetailColumnTriggerWords,
      render: (module) => module.triggerWords.join(", "),
    },
    {
      key: "grantedBy",
      header: strings.ownerSiteDetailColumnGrantedBy,
      render: (module) => (
        // `23-14`'s own Done-when: a module the tenant enabled is distinguishable from one the owner
        // granted - never the same badge, never left to a tooltip alone to say the difference.
        <Badge tone={module.grantedByOwner ? "accent" : "neutral"}>
          {module.grantedByOwner ? strings.ownerSiteDetailGrantedByOwner : strings.ownerSiteDetailGrantedByTenant}
        </Badge>
      ),
    },
    {
      key: "expires",
      header: strings.ownerSiteDetailColumnExpires,
      render: (module) => {
        const explicit = formatModuleExpiry(module.expiresAt, strings);
        if (explicit !== null) {
          // A grant with no expiry renders as an explicit statement, never a blank cell.
          return <span className="ago-meta">{explicit}</span>;
        }

        const parsed = parseInstant(module.expiresAt);
        if (parsed === null) {
          // Unreachable in practice (formatModuleExpiry already handled null), but a garbled value
          // has nothing truthful to render either - the same defensive shape the site list's own
          // date columns use.
          return <span className="ago-meta">{strings.ownerSiteDetailUnknown}</span>;
        }

        return <span title={formatAbsolute(parsed, timeZone)}>{formatDateStamp(parsed, timeZone)}</span>;
      },
    },
    {
      key: "status",
      header: strings.ownerSiteDetailColumnStatus,
      render: (module) => (
        // `23-103`: rendered directly from the server's own `status` - matching what the live
        // read-store query already decided, never recomputed here by comparing
        // `expiresAt`/`revokedAt` against this browser's own clock (this item's own Done-when).
        <Badge tone={moduleStatusTone(module.status)}>{formatModuleStatus(module.status, strings)}</Badge>
      ),
    },
    {
      key: "quantity",
      header: strings.ownerSiteDetailColumnQuantity,
      render: (module) => (
        // `23-66`'s own warning: `formatModuleQuantity` renders `null` and `0` differently - "Not
        // granted" is never shown for a module explicitly granted zero.
        <span className="ago-meta">{formatModuleQuantity(module.quantity, strings)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      // `23-65`: revoke reads provenance off `module.grantedByOwner` before anything is sent - the
      // confirmation dialog this opens is where the reason/force asymmetry actually lives, not here.
      // `23-66`: the quantity dialog opens the same way, alongside it - which stage it opens in
      // (edit vs. the lowering confirm) is decided once a number is actually typed, not here.
      render: (module) => (
        <div className="ago-row">
          <Button size="sm" variant="ghost" onClick={() => onSetQuantity(module)}>
            {strings.ownerSiteDetailSetQuantityButton}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onRevoke(module)}>
            {strings.ownerSiteDetailRevokeButton}
          </Button>
        </div>
      ),
    },
  ];
}

/** `23-68`: the name to show for an operator with no `displayName` - the identical "state the fact,
 * don't fabricate one" shape `OwnerSitesPage`'s own `Unnamed site` label already uses, restated for
 * an operator (`OperatorTeamMemberItem`'s own remarks: a minted demo tenant's operator has no claims
 * to copy). Exported only for this file's own `buildOperatorColumns`/dialog title, not a general
 * formatter - a real caller-facing display-name policy lives in `operatorDisplayName.ts` and this
 * screen deliberately does not import it, since that helper reads the *signed-in* operator's own
 * token claims, not an arbitrary row from a cross-tenant list. */
function operatorLabel(operator: OwnerSiteOperator, strings: ConsoleStrings): string {
  return operator.displayName && operator.displayName.trim().length > 0
    ? operator.displayName
    : strings.ownerSiteDetailUnnamedOperator;
}

function buildOperatorColumns(
  strings: ConsoleStrings,
  restoringOperatorId: string | null,
  onRestoreSeat: (operator: OwnerSiteOperator) => void,
): TableColumn<OwnerSiteOperator>[] {
  return [
    {
      key: "operator",
      header: strings.ownerSiteDetailColumnOperator,
      render: (operator) => (
        <div className="ago-row ago-row--tight">
          {operator.displayName && operator.displayName.trim().length > 0 ? (
            <strong>{operator.displayName}</strong>
          ) : (
            <span className="ago-meta">{strings.ownerSiteDetailUnnamedOperator}</span>
          )}
          {operator.email && <span className="ago-meta">{operator.email}</span>}
        </div>
      ),
    },
    {
      key: "roles",
      header: strings.ownerSiteDetailColumnRoles,
      render: (operator) =>
        operator.roleNames.length === 0 ? (
          // `23-68`'s own warning made visible: an empty role list is the "stripped their own last
          // role" case this item names but does not fix - never rendered as a blank cell.
          <span className="ago-meta" title={strings.ownerSiteDetailNoRoleTitle}>
            {strings.ownerSiteDetailNoRoleLabel}
          </span>
        ) : (
          operator.roleNames.join(", ")
        ),
    },
    {
      key: "seat",
      header: strings.ownerSiteDetailColumnSeat,
      render: (operator) => (
        <Badge tone={operator.holdsSeat ? "success" : "danger"}>
          {operator.holdsSeat ? strings.ownerSiteDetailHoldsSeat : strings.ownerSiteDetailNoSeat}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (operator) =>
        operator.holdsSeat ? null : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRestoreSeat(operator)}
            disabled={restoringOperatorId === operator.operatorId}
          >
            {restoringOperatorId === operator.operatorId ? strings.ownerSiteDetailRestoringLabel : strings.ownerSiteDetailRestoreSeatButton}
          </Button>
        ),
    },
  ];
}
