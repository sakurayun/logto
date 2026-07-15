import { LogResult, type LogContextPayload } from '@logto/schemas';
import { generateStandardId } from '@logto/shared';

/**
 * Bridge that writes Bilibili API call traces into the Logto audit log (`logs` table, key
 * `Bilibili.Api`). The isolated `connector-bilibili` package cannot import core, so core binds a
 * tenant's `insertLog` here at boot and exposes the recorder on `globalThis` for the connector's
 * `ky` hooks to call. Single-process only; intended for the OSS `default` tenant.
 *
 * This bridge intentionally holds late-bound singleton state (the tenant's `insertLog`), which the
 * functional-style lint rules disallow; the few mutations below are deliberate and localized.
 */

type LogInsert = (data: { id: string; key: string; payload: LogContextPayload }) => Promise<void>;

// eslint-disable-next-line @silverhand/fp/no-let
let insertLog: LogInsert | undefined;

/** Partially mask a secret so the audit log keeps it diagnosable without storing it in full. */
export const mask = (value: string | undefined, keep = 4): string | undefined => {
  if (!value) {
    return value;
  }
  return value.length <= keep * 2 ? '***' : `${value.slice(0, keep)}...${value.slice(-keep)}`;
};

/** Persist one Bilibili API call into the audit log. Best-effort: never throws into the flow. */
export const recordBilibiliApiCall = (trace: Record<string, unknown>): void => {
  const insert = insertLog;
  if (!insert) {
    return;
  }

  // Fire-and-forget: audit logging is best-effort and must never break the request flow.
  void (async () => {
    try {
      await insert({
        id: generateStandardId(),
        key: 'Bilibili.Api',
        payload: {
          key: 'Bilibili.Api',
          result: trace.ok === false ? LogResult.Error : LogResult.Success,
          bilibiliApi: trace,
        },
      });
    } catch {
      // Swallow: never let audit logging surface as a request error.
    }
  })();
};

/**
 * Bind the audit sink to a tenant's `insertLog` and expose the recorder to the (same-process)
 * `connector-bilibili` package via `globalThis`.
 */
export const registerBilibiliAuditSink = (logInsert: LogInsert): void => {
  // eslint-disable-next-line @silverhand/fp/no-mutation
  insertLog = logInsert;
  // Expose the recorder to the same-process, isolated connector-bilibili package via globalThis.
  // eslint-disable-next-line no-restricted-syntax, @silverhand/fp/no-mutation
  (globalThis as { __bilibiliAuditRecord?: typeof recordBilibiliApiCall }).__bilibiliAuditRecord =
    recordBilibiliApiCall;
};
