import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  ApiProblemError,
  fetchSiteBranding,
  updateSiteBrandCompanyName,
  uploadSiteLogo,
  type SiteBrandingDto,
} from "../api/emailChannelApi.js";
import { logoValidationFailureMessage, validateLogoFileClientSide } from "./emailChannelLogoValidation.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `25-160`: the identical `site:configure` gate `WidgetConfigPage`/`InstallSnippetPage` already use for
 * a settings-only screen - Email has no per-tenant credential to connect (`docs/backlog/25-160-*.md`'s
 * own "What is actually true today": "a real 'Почта @' screen here is a settings form, not a
 * connect/verify flow like the other three channels' own screens"), so this page gates on the same
 * permission its own two endpoints (`GET`/`PUT`/`POST branding`) enforce, not `channel:manage` -
 * `TelegramChannelPage`'s own gate is the wrong precedent to copy here for exactly the reason that
 * item's own comment states it exists (a real connect/disconnect flow this channel does not have).
 */
export const EMAIL_CHANNEL_PERMISSION = "site:configure";

function logoStatusBadge(status: SiteBrandingDto["logoStatus"], strings: ConsoleStrings) {
  switch (status) {
    case "Ready":
      return (
        <Badge tone="success" dot>
          {strings.emailChannelLogoStatusReady}
        </Badge>
      );
    case "Pending":
      return (
        <Badge tone="neutral" dot>
          {strings.emailChannelLogoStatusPending}
        </Badge>
      );
    case "Rejected":
      return (
        <Badge tone="danger" dot>
          {strings.emailChannelLogoStatusRejected}
        </Badge>
      );
    case "None":
    default:
      return null;
  }
}

/**
 * `25-160`: `/channels/email` - "Почта @" promoted out of the "Другие каналы" catch-all
 * (`consoleNav.ts`'s own remarks), the fourth of `23-31`'s reserved channel places to become a real
 * screen and, unlike the three before it (Telegram/MAX/VK), a settings form rather than a
 * connect/disconnect flow - this channel has no per-tenant credential to manage at all.
 *
 * Two independent writes, two independent pending/error states - the company-name field (`PUT`) and
 * the logo upload (`POST`) do not share a save button, because they do not share a failure mode: a
 * name is accepted or rejected synchronously, while an uploaded logo's real outcome
 * (`SiteBrandingDto.logoStatus`) only exists after `Ago.Chat.Worker`'s validating consumer finishes -
 * this screen polls nothing for that; the tenant re-opens or reloads the page to see it settle, the
 * same "an async result the console does not push a live update for" gap this item's own report
 * states plainly rather than building a poll loop this item's own Scope never asked for.
 */
export function EmailChannelPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [branding, setBranding] = useState<SiteBrandingDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [companyNameInput, setCompanyNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSaveError, setNameSaveError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const accessToken = user?.access_token;

  const load = useCallback(() => {
    if (!accessToken || !siteId) {
      return;
    }

    fetchSiteBranding(accessToken, siteId)
      .then((response) => {
        setBranding(response);
        setCompanyNameInput(response.brandCompanyName ?? "");
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiProblemError ? err.message : strings.emailChannelLoadError));
  }, [accessToken, siteId, strings]);

  useEffect(() => {
    if (!hasPermission(EMAIL_CHANNEL_PERMISSION)) {
      return;
    }
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(EMAIL_CHANNEL_PERMISSION)) {
    return <AccessRefusal title={strings.emailChannelTitle} message={strings.emailChannelForbidden} strings={strings} />;
  }

  const saveCompanyName = async () => {
    if (!accessToken || !siteId) {
      return;
    }

    setSavingName(true);
    setNameSaveError(null);
    setNameSaved(false);
    try {
      const trimmed = companyNameInput.trim();
      await updateSiteBrandCompanyName(accessToken, siteId, trimmed.length > 0 ? trimmed : null);
      setNameSaved(true);
    } catch (err) {
      setNameSaveError(err instanceof ApiProblemError ? err.message : strings.emailChannelSaveError);
    } finally {
      setSavingName(false);
    }
  };

  const attemptUpload = async (file: File) => {
    if (!accessToken || !siteId) {
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const clientCheck = await validateLogoFileClientSide(file);
      if (!clientCheck.ok) {
        setUploadError(clientCheck.reason
          ? logoValidationFailureMessage(clientCheck.reason, strings)
          : strings.emailChannelUploadError);
        return;
      }

      await uploadSiteLogo(accessToken, siteId, file);
      load();
    } catch (err) {
      setUploadError(err instanceof ApiProblemError ? err.message : strings.emailChannelUploadError);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <PageHead title={strings.emailChannelTitle} description={strings.emailChannelDescription} />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {branding === null ? (
        loadError ? null : (
          <Panel>
            <Skeleton lines={3} label={strings.emailChannelLoadingLabel} />
          </Panel>
        )
      ) : (
        <Panel title={strings.emailChannelPanelTitle}>
          <div className="ago-stack">
            <Field label={strings.emailChannelCompanyNameFieldLabel} description={strings.emailChannelCompanyNameFieldDescription}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={companyNameInput}
                  onChange={(e) => { setCompanyNameInput(e.target.value); setNameSaved(false); }}
                  disabled={savingName}
                />
              )}
            </Field>

            {nameSaveError && <Alert tone="danger">{nameSaveError}</Alert>}
            {nameSaved && <Alert tone="success">{strings.emailChannelSaveSuccess}</Alert>}

            <div>
              <Button variant="primary" onClick={() => void saveCompanyName()} disabled={savingName}>
                {savingName ? strings.emailChannelSavingButton : strings.emailChannelSaveButton}
              </Button>
            </div>

            <hr />

            <Field label={strings.emailChannelLogoFieldLabel} description={strings.emailChannelLogoFieldDescription}>
              {(fieldProps) => (
                <input
                  {...fieldProps}
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void attemptUpload(file);
                    }
                  }}
                />
              )}
            </Field>

            {uploadError && <Alert tone="danger">{uploadError}</Alert>}
            {uploading && <Spinner label={strings.emailChannelLogoUploadingButton} />}

            <div className="ago-stack">
              {logoStatusBadge(branding.logoStatus, strings)}

              {branding.logoStatus === "Rejected" && branding.logoRejectionReason && (
                <Alert tone="danger" title={strings.emailChannelLogoStatusRejected}>
                  {strings.emailChannelLogoRejectedReasonPrefix} {branding.logoRejectionReason}
                </Alert>
              )}

              {branding.logoUrl && (
                // `25-160`: the plain public URL, pointed at directly - this item's own Scope, point 7:
                // "the same one item 2's client-side check already knows how to point an <img> at once
                // uploaded", no presign, no second mechanism.
                <img src={branding.logoUrl} alt={strings.emailChannelLogoPreviewAlt} width={100} height={100} />
              )}
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}
