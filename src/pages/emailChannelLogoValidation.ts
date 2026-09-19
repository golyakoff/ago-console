/**
 * `25-160`: the console's own courtesy check - "accept `image/png,image/jpeg,image/gif`, decode
 * locally to check real pixel dimensions (≤100×100) before ever uploading, and reject fast with a
 * clear message - a courtesy check only, never the authority" (this item's own Scope, point 2). The
 * real, authoritative checks (format, real dimensions, not animated) live entirely in
 * `Ago.Chat.Worker.SiteLogoValidator`, which never trusts anything this module decides - a rejected
 * file here never even reaches `uploadSiteLogo`, but a file this module accepts can still come back
 * `Rejected` from the server (an animated GIF, most likely - this module has no way to detect that
 * client-side without a real decode of every frame, which is exactly the "no new package" line this
 * item's own Design decisions draw for the server side too).
 */
export const MAX_LOGO_DIMENSION_PIXELS = 100;
export const MAX_LOGO_SIZE_BYTES = 200 * 1024;
export const ALLOWED_LOGO_CONTENT_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/gif"];

/**
 * A plain interface with an optional `reason`, not a `{ ok: true } | { ok: false; reason }`
 * discriminated union - this project's own `tsconfig.app.json` does not set `strict`, and without
 * `strictNullChecks` on, TypeScript's control-flow narrowing on a boolean discriminant does not
 * reliably narrow the `reason` field back in (found live, compiling this very module: `tsc` reported
 * `Property 'reason' does not exist` inside an `if (!result.ok)` guard). `reason` typed
 * `LogoValidationFailureReason | undefined` on every result and read with a plain truthiness check
 * needs no narrowing at all, so it compiles correctly under this project's actual configuration rather
 * than one this file assumed it had.
 */
export interface LogoValidationResult {
  ok: boolean;
  reason?: LogoValidationFailureReason;
}

export type LogoValidationFailureReason = "invalid-format" | "too-large" | "invalid-dimensions" | "undecodable";

export async function validateLogoFileClientSide(file: File): Promise<LogoValidationResult> {
  if (!ALLOWED_LOGO_CONTENT_TYPES.includes(file.type)) {
    return { ok: false, reason: "invalid-format" };
  }

  if (file.size <= 0 || file.size > MAX_LOGO_SIZE_BYTES) {
    return { ok: false, reason: "too-large" };
  }

  const dimensions = await readImageDimensions(file);
  if (dimensions === null) {
    return { ok: false, reason: "undecodable" };
  }

  if (dimensions.width > MAX_LOGO_DIMENSION_PIXELS || dimensions.height > MAX_LOGO_DIMENSION_PIXELS) {
    return { ok: false, reason: "invalid-dimensions" };
  }

  return { ok: true };
}

/** Every failure reason's own message key, in `ConsoleStrings` - a plain lookup, not a `switch`, so a
 * new `LogoValidationFailureReason` member that forgets to extend this object is a compile error
 * (an object literal typed `Record<LogoValidationFailureReason, ...>` must be exhaustive) rather than
 * a `switch` with no `default` silently falling through. */
export function logoValidationFailureMessage(
  reason: LogoValidationFailureReason,
  strings: { emailChannelLogoInvalidFormatClientError: string; emailChannelLogoTooLargeClientError: string; emailChannelLogoInvalidDimensionsClientError: string },
): string {
  const messages: Record<LogoValidationFailureReason, string> = {
    "invalid-format": strings.emailChannelLogoInvalidFormatClientError,
    "too-large": strings.emailChannelLogoTooLargeClientError,
    "invalid-dimensions": strings.emailChannelLogoInvalidDimensionsClientError,
    undecodable: strings.emailChannelLogoInvalidFormatClientError,
  };
  return messages[reason];
}

function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}
