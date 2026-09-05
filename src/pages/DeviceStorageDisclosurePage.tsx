import { Link } from "react-router-dom";
import { usePermissions } from "../auth/PermissionsContext.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Alert } from "../components/Alert.js";
import { Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import { DEVICE_STORAGE_DISCLOSURE_ROWS, type DeviceStorageDisclosureRow } from "./deviceStorageDisclosure.js";

/**
 * `24-15`: the document a tenant reads to write their own cookie or privacy notice about this
 * widget - not a notice we write or inject for them (`adr/0076`, `16-04`'s own boundary: AGO supplies
 * the mechanism, the tenant owns the words). Gated the same way every other settings screen is
 * (`WidgetConfigPage`'s own doc comment has the full reasoning): `usePermissions()` decides whether
 * to render at all, client-side, UX only - the server's own `site:configure` check on every other
 * settings endpoint is the actual gate pattern this screen matches, even though this particular page
 * calls no endpoint at all (see below).
 *
 * **Why this screen fetches nothing.** Every row here describes what the widget's *code* does, which
 * is identical for every tenant - unlike `WidgetConfigPage`/`InstallSnippetPage` beside it in the nav,
 * there is no per-site value to load. `DEVICE_STORAGE_DISCLOSURE_ROWS` is the whole page; gating still
 * applies because the fact that a widget exists to write anything at all is itself something only an
 * operator configuring this site's widget needs to see, the same audience every neighbouring settings
 * screen already assumes.
 */
export function DeviceStorageDisclosurePage() {
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    return (
      <>
        <PageHead title={strings.navDeviceStorage} />
        <Alert tone="danger">{strings.deviceStorageForbidden}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  const columns: TableColumn<DeviceStorageDisclosureRow>[] = [
    { key: "key", header: strings.deviceStorageColumnKey, render: (row) => <code>{row.key}</code> },
    { key: "holds", header: strings.deviceStorageColumnHolds, render: (row) => strings[row.holdsKey] },
    { key: "why", header: strings.deviceStorageColumnWhy, render: (row) => strings[row.whyKey] },
    { key: "lifetime", header: strings.deviceStorageColumnLifetime, render: (row) => strings[row.lifetimeKey] },
    {
      key: "survivesTabClose",
      header: strings.deviceStorageColumnSurvivesTabClose,
      render: () => strings.deviceStorageSurvivesTabCloseYes,
    },
  ];

  return (
    <>
      <PageHead title={strings.deviceStorageTitle} description={strings.deviceStorageDescription} />

      <Panel>
        <Alert tone="info">{strings.deviceStorageNotCookies}</Alert>
        <p>{strings.deviceStorageIntro}</p>
        <p>{strings.deviceStorageEraseNote}</p>
      </Panel>

      <Panel title={strings.deviceStorageTitle}>
        <Table
          caption={strings.deviceStorageTitle}
          columns={columns}
          rows={DEVICE_STORAGE_DISCLOSURE_ROWS}
          rowKey={(row) => row.key}
        />
      </Panel>
    </>
  );
}
