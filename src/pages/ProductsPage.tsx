import { Link } from "react-router-dom";
import { usePermissions } from "../auth/PermissionsContext.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Badge } from "../components/Badge.js";
import { Alert } from "../components/Alert.js";
import { Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/** `23-25`: this screen's own gate - the same permission `BillingPage.BILLING_PERMISSION` already
 * uses. `decisions.md` §10: the buyer is the tenant's owner, who already holds the permissions in
 * question - there is no separate "owner" permission in `Ago.Chat.Domain.Permission` to gate on, and
 * `site:configure` is the one this console already treats as "may act for the tenant as a whole"
 * (it is what gates `/settings/billing`'s own checkout). Reusing it here is the same call, not a new
 * one. */
export const PRODUCTS_PERMISSION = "site:configure";

interface ProductRow {
  id: string;
  description: string;
  held: boolean;
  /** `null` for a product this workspace does not have - `decisions.md` §6: enabling a product is
   * not self-service today, so there is nothing true to link to. The cell renders
   * `productsContactNote` instead, never a control that looks like it provisions. */
  action: { label: string; to: string } | null;
}

function buildRows(strings: ConsoleStrings, enabledModules: readonly string[]): ProductRow[] {
  const hasCalendar = enabledModules.includes("calendar");
  const hasFaq = enabledModules.includes("faq");

  return [
    {
      // The base product - always held. Reaching this screen at all means an operator seat exists
      // on a site, and `vision.md` states the conversation substrate "is present in every
      // combination that has been described, without exception" - so there is no tenant state this
      // row could honestly report as "not yet".
      id: "chat",
      description: strings.productsChatDescription,
      held: true,
      action: { label: strings.productsChatActionLabel, to: "/" },
    },
    {
      // `23-21` put this workspace's enabled module keys on `GET /api/v1/operators/me`
      // (`usePermissions().enabledModules`) - this is the one place this file reads the raw key
      // "calendar"; the copy below it never does.
      id: "calendar",
      description: strings.productsCalendarDescription,
      held: hasCalendar,
      action: hasCalendar ? { label: strings.productsCalendarActionLabel, to: "/calendar" } : null,
    },
    {
      id: "faq",
      description: strings.productsFaqDescription,
      held: hasFaq,
      action: hasFaq ? { label: strings.productsFaqActionLabel, to: "/settings/faq" } : null,
    },
  ];
}

/**
 * `23-25`: `/settings/products` - "what else AGO does", addressed to the person who can buy it. Every
 * product this platform offers, marked with whether this workspace already has it, on a surface of
 * its own rather than as rows in the navigation - `decisions.md` §10 argues that directly: an entry
 * drawn for a capability the tenant has not bought is a price list the operator who sees it usually
 * cannot act on, while the owner who could act already sees the entries they hold. This screen is
 * the "same information needs an audience of its own" §10 promises.
 *
 * <b>No fetch of its own.</b> `23-21` already put this workspace's enabled module keys on
 * `GET /api/v1/operators/me`, alongside the caller's own permissions - the same response
 * `usePermissions()` already resolves once per session. Reading it a second, purpose-built way here
 * would be exactly the "second uncontrolled read" `23-21`'s own scope warned against; this screen
 * reuses the one that already exists instead.
 *
 * <b>The next step for a product this workspace lacks is "contact AGO", never a control that looks
 * like it provisions.</b> `decisions.md` §6: enabling a product is owner-only today, through a
 * runbook, not a console write - `22-17`'s grant API takes a deployment-wide secret no browser form
 * may hold. A "request access" button that writes nothing would be worse than plain prose: the tenant
 * would wait for something that never happens. So the not-held cells says only "Contact AGO to add
 * this to your workspace." - true today, and truthfully not a self-service flow.
 *
 * <b>The copy never shows a module key.</b> `"calendar"`/`"faq"` are words from this platform's own
 * schema (`Ago.Chat.Domain.ModuleKey`) - `buildRows` above is the one place either raw string is
 * read; every string a reader sees describes what the product does for their customers instead
 * ("Let customers book an appointment…", never "Calendar").
 *
 * <b>Gated on `PRODUCTS_PERMISSION`, not on the console's own three-state gated-nav treatment.</b>
 * `23-24` (open in parallel) decides the muted/locked look for an entry a colleague could grant but
 * this operator cannot; that treatment is for the navigation this screen deliberately stays out of
 * (§10, `23-25`'s own Out of scope). This screen answers a coarser question - "may this identity see
 * what the tenant could buy at all" - the same yes/no `BillingPage` already asks with the identical
 * permission, and the same danger-alert-plus-back-link shape that screen already uses for "no".
 *
 * <b>AGO Inbox's channels (Telegram, WhatsApp, …) are not a row here.</b> Not an oversight: there is
 * no equivalent single tenant-held fact for them on `GET /api/v1/operators/me` today - a connected
 * channel is a `ChannelCredential` row, not an `EnabledModule` entry, and the console has no screen
 * for them at all yet. Representing that honestly would need a new server read this item's own scope
 * does not authorise (`23-25`'s "if you conclude a new server read is genuinely needed, stop and say
 * so").
 */
export function ProductsPage() {
  const { permissions, enabledModules, hasPermission } = usePermissions();
  const strings = useStrings();

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(PRODUCTS_PERMISSION)) {
    return (
      <>
        <PageHead title={strings.productsTitle} />
        <Alert tone="danger">{strings.productsForbidden}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  const rows = buildRows(strings, enabledModules ?? []);

  const columns: TableColumn<ProductRow>[] = [
    {
      key: "product",
      header: strings.productsColumnWhatItDoes,
      render: (row) => row.description,
    },
    {
      key: "status",
      header: strings.productsColumnStatus,
      render: (row) => (
        <Badge tone={row.held ? "success" : "neutral"} dot={row.held}>
          {row.held ? strings.productsStatusHeld : strings.productsStatusNotHeld}
        </Badge>
      ),
    },
    {
      key: "action",
      header: strings.productsColumnNextStep,
      render: (row) => (row.action ? <Link to={row.action.to}>{row.action.label}</Link> : strings.productsContactNote),
    },
  ];

  return (
    <>
      <PageHead title={strings.productsTitle} description={strings.productsDescription} />
      <Panel>
        <Table caption={strings.productsTableCaption} columns={columns} rows={rows} rowKey={(row) => row.id} />
      </Panel>
    </>
  );
}
