import ky from 'ky';

/**
 * Audit instrumentation for every Bilibili connector HTTP call.
 *
 * The connector package is isolated (no DB access). Core registers a sink on
 * `globalThis.__bilibiliAuditRecord` at boot; these hooks push a sanitized trace of each
 * request/response into it, which core then writes to the Logto audit log (`logs` table).
 * Sensitive values are partially masked so the audit log never stores full credentials.
 */

const sensitiveHeader = /^(access-token|authorization|cookie)$/i;
const sensitiveQuery = new Set(['client_secret', 'access_token', 'refresh_token', 'code']);

const mask = (value: string, keep = 4): string => {
  if (!value) {
    return value;
  }
  return value.length <= keep * 2 ? '***' : `${value.slice(0, keep)}...${value.slice(-keep)}`;
};

const maskUrl = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl);
    for (const key of url.searchParams.keys()) {
      if (sensitiveQuery.has(key)) {
        url.searchParams.set(key, mask(url.searchParams.get(key) ?? ''));
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
};

const maskHeaders = (headers: Headers): Record<string, string> =>
  Object.fromEntries(
    [...headers].map(([key, value]) => [key, sensitiveHeader.test(key) ? mask(value) : value])
  );

const phaseFromUrl = (rawUrl: string): string => {
  if (rawUrl.includes('grant_type=refresh_token')) {
    return 'refreshToken';
  }
  if (rawUrl.includes('account-oauth2/v1/token')) {
    return 'getAccessToken';
  }
  if (rawUrl.includes('user/account/info')) {
    return 'getUserInfo';
  }
  if (rawUrl.includes('search')) {
    return 'searchUid';
  }
  return 'bilibili';
};

type Trace = Record<string, unknown>;

const emit = (trace: Trace): void => {
  // The core process binds the sink on globalThis; the isolated connector has no import path to it.
  // eslint-disable-next-line no-restricted-syntax
  const sink = (globalThis as { __bilibiliAuditRecord?: (value: Trace) => unknown })
    .__bilibiliAuditRecord;
  if (sink) {
    try {
      void sink(trace);
    } catch {
      // Audit logging must never break the connector flow.
    }
  }
};

const readBody = async (source: {
  clone: () => { text: () => Promise<string> };
}): Promise<string | undefined> => {
  try {
    const text = await source.clone().text();
    return text.slice(0, 4000);
  } catch {
    return undefined;
  }
};

/** A `ky` instance that mirrors every request/response into the Bilibili audit sink. */
export const auditedKy = ky.extend({
  hooks: {
    afterResponse: [
      async (request, _options, response) => {
        emit({
          phase: phaseFromUrl(request.url),
          method: request.method,
          url: maskUrl(request.url),
          requestHeaders: maskHeaders(request.headers),
          requestBody: await readBody(request),
          status: response.status,
          ok: response.ok,
          responseBody: await readBody(response),
        });
        return response;
      },
    ],
    beforeError: [
      (error) => {
        const { request, response } = error;
        emit({
          phase: phaseFromUrl(request.url),
          method: request.method,
          url: maskUrl(request.url),
          requestHeaders: maskHeaders(request.headers),
          status: response.status,
          ok: false,
          error: error.message,
        });
        return error;
      },
    ],
  },
});
