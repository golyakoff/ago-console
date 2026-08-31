import { config } from "../config.js";

/**
 * `19-03`'s exact wire shape for `Ago.Faq.Api`'s own `GET`/`PUT /api/v1/sites/{siteId}/knowledge-base`
 * endpoints - a genuinely different backend than every other `src/api/*.ts` module in this console,
 * on its own repository's own deploy (`ago-faq`, not `ago-chat`). `config.ts`'s own `faqApiBaseUrl`
 * remarks and `docs/backlog/19-03-ai-faq-module.md`'s "Decided" section have the full reasoning for
 * why: the knowledge-base text is this module's own data, and `Ago.Chat.*` never proxies or
 * understands it, the same "the platform must never reference a product"-shaped boundary
 * `CLAUDE.md` draws for the backend, applied here to a second product's own module instead.
 *
 * **Not routed through `activeSite.ts`'s `withActiveSiteHeader`.** `X-Ago-Active-Site` is
 * `Ago.Chat.Api`'s own multi-tenancy convenience signal (`adr/0068`) - `OperatorIdentityClaimsTransformation`
 * is the only reader of it, and `ago-faq` has no such mechanism and no reason to grow one: this
 * endpoint already takes `siteId` directly in the URL path, which is the only site-scoping fact
 * `ago-faq` needs. Sending it a header from a contract it does not participate in would be pure noise
 * against a *different* CORS policy than `Ago.Chat.Api`'s own.
 *
 * **Auth**: the identical operator bearer token every other call in this console already carries
 * (`useAuth().user.access_token`) - a deliberate, recorded decision (the backlog item's own "Decided"
 * section): `ago-faq` validates the same Keycloak-issued token, so there is no second login and no
 * second token source here, only a second `Authorization: Bearer` header built from the same value.
 */
export interface KnowledgeBaseDto {
  text: string;
  updatedAt: string | null;
}

/** The same `{code, message}` split `ModulesError`/`WidgetConfigError` already establish for their
 * own neighbouring settings screens. `KnowledgeBaseError.NotConfigured` is this module's own
 * addition, thrown locally rather than by any server response - see `requireBaseUrl` below. */
export class KnowledgeBaseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "KnowledgeBaseError";
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

async function buildError(
  response: Response,
  fallbackCode: string,
  fallbackDetail: string,
): Promise<KnowledgeBaseError> {
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

  return new KnowledgeBaseError(code, detail);
}

/**
 * `config.faqApiBaseUrl` is `string | null` (`config.ts`'s own remarks: unlike this console's other
 * base URL, nothing but this one screen depends on it, so an unconfigured deployment must not fail
 * the whole app's boot). Every call below checks it first and throws the identical error shape a
 * failed HTTP call would, so `FaqModulePage.tsx`'s existing `err instanceof KnowledgeBaseError` catch
 * handles "never configured" and "server said no" the same way, with a message that tells the two
 * apart.
 */
function requireBaseUrl(): string {
  if (config.faqApiBaseUrl === null) {
    throw new KnowledgeBaseError(
      "KnowledgeBase.NotConfigured",
      "The AI FAQ backend is not configured for this deployment yet.",
    );
  }

  return config.faqApiBaseUrl;
}

function url(baseUrl: string, siteId: string): string {
  return `${baseUrl}/api/v1/sites/${siteId}/knowledge-base`;
}

export async function fetchKnowledgeBase(accessToken: string, siteId: string): Promise<KnowledgeBaseDto> {
  const baseUrl = requireBaseUrl();
  const response = await fetch(url(baseUrl, siteId), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw await buildError(response, "KnowledgeBase.Unknown", "Failed to load the knowledge base");
  }

  return (await response.json()) as KnowledgeBaseDto;
}

export async function updateKnowledgeBase(
  accessToken: string,
  siteId: string,
  text: string,
): Promise<KnowledgeBaseDto> {
  const baseUrl = requireBaseUrl();
  const response = await fetch(url(baseUrl, siteId), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw await buildError(response, "KnowledgeBase.Unknown", "Failed to save the knowledge base");
  }

  return (await response.json()) as KnowledgeBaseDto;
}
