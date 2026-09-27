import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ShapeMismatchError, assertArrayHasKeys, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `19-03`'s exact wire shape for `Ago.Chat.Api`'s new `GET`/`PUT /api/v1/sites/{siteId}/modules`
 * endpoints. Deliberately generic - `moduleKey`/`triggerWords`/`entryPoint` are the closed vocabulary
 * `adr/0065`'s own module contract already defines, and this file is `Ago.Chat.*`'s own "which
 * modules does this site have enabled" surface, not a FAQ-specific one. Nothing here ever imports or
 * names "FAQ": `ago-chat` gains no new knowledge of what any particular module means by registering
 * one, the identical constraint `20-07`'s own Calendar module already proved out
 * (`docs/backlog/19-03-ai-faq-module.md`'s "Done when" guard tests). The one place "FAQ" is allowed to
 * appear at all is UI copy - `FaqModulePage.tsx`'s own doc comment has the reasoning.
 */
export interface ModuleConfigDto {
  moduleKey: string;
  triggerWords: string[];
  entryPoint: string;
}

export interface ModulesListDto {
  modules: ModuleConfigDto[];
}

/**
 * Carries the server's stable `type` code alongside the human-readable `detail` text every
 * `ErrorExtensions.ToProblem` response already carries - the same split `WidgetConfigError`/
 * `OfflineAutoReplyError` already establish for their own neighbouring settings screens, kept
 * identical here rather than migrated to `problemDetails.ts`'s newer shared `ApiProblemError` for the
 * same reason `OfflineAutoReplyError`'s own doc comment gives: consistency with the sibling screen
 * this one sits beside, not a second precedent for a codebase that already carries two.
 */
export class ModulesError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ModulesError";
    this.code = code;
  }
}

interface ProblemDetailsBody {
  type?: string;
  detail?: string;
}

function isProblemDetailsBody(value: unknown): value is ProblemDetailsBody {
  return typeof value === "object" && value !== null;
}

async function buildError(response: Response, fallbackCode: string, fallbackDetail: string): Promise<ModulesError> {
  let code = fallbackCode;
  let detail = `${fallbackDetail}: ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (isProblemDetailsBody(body)) {
      code = body.type ?? code;
      detail = body.detail ?? detail;
    }
  } catch {
    // Not problem+json (a network-level failure or a proxy error page) - fall back to the status
    // code alone, matching `widgetConfigApi.ts`'s own precedent.
  }

  return new ModulesError(code, detail);
}

function url(siteId: string): string {
  return `${config.apiBaseUrl}/api/v1/sites/${siteId}/modules`;
}

/**
 * `23-118`/`23-99`: the runtime shapes this read promises. `fetchModules` returns a list wrapped in
 * `{ modules }`, and `FaqModulePage` renders "no modules enabled" from an empty one - so a dropped
 * `modules` key reads as a false empty, and a truncated element (a module row missing `triggerWords` or
 * `entryPoint`) reads as a module that has none, both the `23-99` case. Each element is checked, not
 * just the first. `updateModule` is a PUT echo acted on immediately, out of scope per the bound.
 */
const modulesListRequiredKeys = requiredKeysOf<ModulesListDto>({ modules: true });
const moduleConfigRequiredKeys = requiredKeysOf<ModuleConfigDto>({ moduleKey: true, triggerWords: true, entryPoint: true });

export async function fetchModules(accessToken: string, siteId: string): Promise<ModulesListDto> {
  const response = await fetch(url(siteId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await buildError(response, "Modules.Unknown", "Failed to load the site's modules");
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<ModulesListDto>(body, modulesListRequiredKeys, `GET /api/v1/sites/${siteId}/modules`);
    assertArrayHasKeys<ModuleConfigDto>(body.modules, moduleConfigRequiredKeys, `GET /api/v1/sites/${siteId}/modules (modules)`);
  } catch (reason) {
    if (reason instanceof ShapeMismatchError) {
      // The neutral endpoint+field diagnostic, surfaced localized by `apiErrorMessage.ts#shapeMismatchMessage`.
      throw new ModulesError("shape.mismatch", reason.diagnostic);
    }
    throw reason;
  }
  return body;
}

/** Registers or updates one module. The response mirrors `ModuleConfigDto` - one list item's own
 * shape, not the whole `ModulesListDto` - the same "PUT returns the thing it wrote" convention
 * `updateWidgetConfig`/`updateOfflineAutoReply` already use. */
export async function updateModule(
  accessToken: string,
  siteId: string,
  request: ModuleConfigDto,
): Promise<ModuleConfigDto> {
  const response = await fetch(url(siteId), {
    method: "PUT",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await buildError(response, "Modules.Unknown", "Failed to save the module");
  }

  return (await response.json()) as ModuleConfigDto;
}
