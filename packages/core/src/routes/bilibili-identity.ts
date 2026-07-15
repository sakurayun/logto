import {
  BilibiliSocialIdentities,
  type BilibiliSocialIdentity,
  ConnectorType,
} from '@logto/schemas';
import { trySafe } from '@silverhand/essentials';
import { z } from 'zod';

import RequestError from '#src/errors/RequestError/index.js';
import koaGuard from '#src/middleware/koa-guard.js';
import koaPagination from '#src/middleware/koa-pagination.js';
import assertThat from '#src/utils/assert-that.js';
import {
  mask,
  recordBilibiliApiCall,
  registerBilibiliAuditSink,
} from '#src/utils/bilibili-audit.js';
import {
  decryptTokens,
  deserializeEncryptedSecret,
  encryptTokenResponse,
  isValidAccessTokenResponse,
  serializeEncryptedSecret,
} from '#src/utils/secret-encryption.js';

import { type ManagementApiRouter, type RouterInitArgs } from './types.js';

const bilibiliTarget = 'bilibili';

/** The connector config fields relevant to the live `search_user` (uid) lookup. */
const cookieConfigGuard = z.object({
  searchCookie: z.string().optional(),
  searchUserAgent: z.string().optional(),
});

/** Subset of the Bilibili `nav` response used to tell whether the cookie is logged in. */
const navResponseGuard = z.object({
  code: z.number(),
  data: z
    .object({
      isLogin: z.boolean().optional(),
      uname: z.string().optional(),
      mid: z.number().optional(),
    })
    .optional(),
});

const bilibiliNavEndpoint = 'https://api.bilibili.com/x/web-interface/nav';

/** Check whether a Bilibili cookie is still valid (logged in) via the public `nav` endpoint. */
const checkBilibiliCookie = async (
  cookie: string,
  userAgent: string
): Promise<{ valid: boolean; uname?: string; mid?: number }> => {
  try {
    const response = await fetch(bilibiliNavEndpoint, {
      headers: { Cookie: cookie, 'User-Agent': userAgent },
      signal: AbortSignal.timeout(8000),
    });
    const json: unknown = await response.json();
    recordBilibiliApiCall({
      phase: 'checkCookie',
      method: 'GET',
      url: bilibiliNavEndpoint,
      requestHeaders: { Cookie: mask(cookie), 'User-Agent': userAgent },
      status: response.status,
      ok: response.ok,
      responseBody: JSON.stringify(json).slice(0, 4000),
    });
    const parsed = navResponseGuard.safeParse(json);

    if (parsed.success && parsed.data.code === 0 && parsed.data.data?.isLogin) {
      return { valid: true, uname: parsed.data.data.uname, mid: parsed.data.data.mid };
    }

    return { valid: false };
  } catch (error) {
    recordBilibiliApiCall({
      phase: 'checkCookie',
      method: 'GET',
      url: bilibiliNavEndpoint,
      requestHeaders: { Cookie: mask(cookie), 'User-Agent': userAgent },
      ok: false,
      error: String(error),
    });
    return { valid: false };
  }
};

/** Response shape: omit the encrypted token blob, expose only whether a token is stored. */
const bilibiliIdentityResponseGuard = BilibiliSocialIdentities.guard
  .omit({ tenantId: true, encryptedTokenSet: true })
  .extend({
    // `bigint` columns are returned as strings by the query library; coerce to number.
    tokenExpiresAt: z.number().nullable(),
    hasToken: z.boolean(),
  });

type BilibiliIdentityResponse = z.infer<typeof bilibiliIdentityResponseGuard>;

const desensitize = (row: BilibiliSocialIdentity): BilibiliIdentityResponse => {
  const { tenantId, encryptedTokenSet, tokenExpiresAt, ...rest } = row;
  return {
    ...rest,
    tokenExpiresAt: tokenExpiresAt === null ? null : Number(tokenExpiresAt),
    hasToken: Boolean(encryptedTokenSet),
  };
};

export default function bilibiliIdentityRoutes<T extends ManagementApiRouter>(
  ...[router, tenant]: RouterInitArgs<T>
) {
  const { queries, libraries } = tenant;
  const { bilibiliSocialIdentities, secrets } = queries;
  const { socials } = libraries;
  const { getLogtoConnectors } = tenant.connectors;

  // Bridge Bilibili connector + route HTTP calls into the audit log (logs table, key `Bilibili.Api`).
  if (tenant.id === 'default') {
    registerBilibiliAuditSink(queries.logs.insertLog);
  }

  router.get(
    '/bilibili-identities',
    koaPagination(),
    koaGuard({
      query: z.object({ search: z.string().optional() }),
      response: bilibiliIdentityResponseGuard.array(),
      status: [200],
    }),
    async (ctx, next) => {
      const { limit, offset } = ctx.pagination;
      const { search } = ctx.guard.query;

      const [rows, totalCount] = await Promise.all([
        bilibiliSocialIdentities.findEntities({ limit, offset }, search),
        bilibiliSocialIdentities.countEntities(search),
      ]);

      ctx.pagination.totalCount = totalCount;
      ctx.body = rows.map((row) => desensitize(row));

      return next();
    }
  );

  // Check whether the configured Bilibili connector cookie (used for the uid lookup) is still valid.
  // Registered before `/:userId` so the literal path is not captured by the param route.
  router.get(
    '/bilibili-identities/cookie-status',
    koaGuard({
      response: z.object({
        configured: z.boolean(),
        valid: z.boolean(),
        uname: z.string().optional(),
        mid: z.number().optional(),
      }),
      status: [200],
    }),
    async (ctx, next) => {
      const logtoConnectors = await getLogtoConnectors();
      const biliConnector = logtoConnectors.find(
        ({ metadata }) => metadata.target === bilibiliTarget
      );
      const parsedConfig = cookieConfigGuard.safeParse(biliConnector?.dbEntry.config ?? {});
      const cookie = parsedConfig.success ? parsedConfig.data.searchCookie : undefined;
      const userAgent =
        (parsedConfig.success ? parsedConfig.data.searchUserAgent : undefined) ?? 'Mozilla/5.0';

      if (!cookie) {
        ctx.body = { configured: false, valid: false };
        return;
      }

      ctx.body = { configured: true, ...(await checkBilibiliCookie(cookie, userAgent)) };
    }
  );

  router.get(
    '/bilibili-identities/:userId',
    koaGuard({
      params: z.object({ userId: z.string().min(1) }),
      response: bilibiliIdentityResponseGuard,
      status: [200, 404],
    }),
    async (ctx, next) => {
      const row = await bilibiliSocialIdentities.findByUserId(ctx.guard.params.userId);
      assertThat(row, new RequestError({ code: 'entity.not_found', status: 404 }));

      ctx.body = desensitize(row);

      return next();
    }
  );

  // Reveal the decrypted tokens. Admin-only (management API auth) — used by the "show plaintext" action.
  router.get(
    '/bilibili-identities/:userId/token',
    koaGuard({
      params: z.object({ userId: z.string().min(1) }),
      response: z.object({
        accessToken: z.string().optional(),
        refreshToken: z.string().optional(),
        expiresAt: z.number().nullable(),
      }),
      status: [200, 404],
    }),
    async (ctx, next) => {
      const row = await bilibiliSocialIdentities.findByUserId(ctx.guard.params.userId);
      assertThat(row, new RequestError({ code: 'entity.not_found', status: 404 }));
      assertThat(
        row.encryptedTokenSet,
        new RequestError({ code: 'entity.not_found', status: 404 })
      );

      const tokenSet = decryptTokens(deserializeEncryptedSecret(row.encryptedTokenSet));

      ctx.body = {
        accessToken: tokenSet.access_token,
        refreshToken: tokenSet.refresh_token,
        expiresAt: row.tokenExpiresAt === null ? null : Number(row.tokenExpiresAt),
      };

      return next();
    }
  );

  // Manually refresh the access token using the stored refresh token.
  router.post(
    '/bilibili-identities/:userId/refresh',
    koaGuard({
      params: z.object({ userId: z.string().min(1) }),
      response: bilibiliIdentityResponseGuard,
      status: [200, 404, 422],
    }),
    async (ctx, next) => {
      const { userId } = ctx.guard.params;
      const row = await bilibiliSocialIdentities.findByUserId(userId);
      assertThat(row, new RequestError({ code: 'entity.not_found', status: 404 }));
      assertThat(
        row.encryptedTokenSet,
        new RequestError({ code: 'connector.token_storage_not_supported', status: 422 })
      );

      const tokenSet = decryptTokens(deserializeEncryptedSecret(row.encryptedTokenSet));
      assertThat(
        tokenSet.refresh_token,
        new RequestError({ code: 'connector.token_storage_not_supported', status: 422 })
      );

      const connector = await socials.getConnector(row.connectorId);
      assertThat(
        connector.type === ConnectorType.Social,
        new RequestError({ code: 'session.invalid_connector_id', status: 422 })
      );
      const { getAccessTokenByRefreshToken } = connector;
      assertThat(
        getAccessTokenByRefreshToken,
        new RequestError({ code: 'connector.token_storage_not_supported', status: 422 })
      );

      const tokenResponse = await getAccessTokenByRefreshToken(tokenSet.refresh_token);
      // Bilibili refresh tokens are single-use; keep the latest refresh token if a new one is absent.
      const updatedTokenResponse = { refresh_token: tokenSet.refresh_token, ...tokenResponse };
      assertThat(
        isValidAccessTokenResponse(updatedTokenResponse),
        new RequestError({ code: 'connector.invalid_response', status: 422 })
      );

      const { tokenSecret, metadata } = encryptTokenResponse(updatedTokenResponse);

      const updated = await bilibiliSocialIdentities.upsertByUserId(userId, {
        connectorId: row.connectorId,
        openid: row.openid,
        uid: row.uid,
        name: row.name,
        face: row.face,
        scopes: metadata.scope ?? row.scopes,
        tokenExpiresAt:
          metadata.expiresAt ?? (row.tokenExpiresAt === null ? null : Number(row.tokenExpiresAt)),
        hasRefreshToken: metadata.hasRefreshToken,
        encryptedTokenSet: serializeEncryptedSecret(tokenSecret),
      });

      // Best-effort: keep the native federated token secret in sync with the same fresh tokens.
      await trySafe(async () => {
        const nativeSecret = await secrets.findSocialTokenSetSecretByUserIdAndTarget(
          userId,
          bilibiliTarget
        );
        if (nativeSecret) {
          await secrets.updateById(nativeSecret.id, { ...tokenSecret, metadata });
        }
      });

      ctx.body = desensitize(updated);

      return next();
    }
  );

  // Revoke: clear the stored token set but keep the identity row.
  router.delete(
    '/bilibili-identities/:userId/token',
    koaGuard({
      params: z.object({ userId: z.string().min(1) }),
      status: [204, 404],
    }),
    async (ctx, next) => {
      const { userId } = ctx.guard.params;
      const row = await bilibiliSocialIdentities.findByUserId(userId);
      assertThat(row, new RequestError({ code: 'entity.not_found', status: 404 }));

      await bilibiliSocialIdentities.clearTokenByUserId(userId);
      await trySafe(secrets.deleteSocialTokenSetSecretByUserIdAndTarget(userId, bilibiliTarget));

      ctx.status = 204;

      return next();
    }
  );

  // Delete the whole identity record (and its federated token secret).
  router.delete(
    '/bilibili-identities/:userId',
    koaGuard({
      params: z.object({ userId: z.string().min(1) }),
      status: [204, 404],
    }),
    async (ctx, next) => {
      const { userId } = ctx.guard.params;
      const row = await bilibiliSocialIdentities.findByUserId(userId);
      assertThat(row, new RequestError({ code: 'entity.not_found', status: 404 }));

      await bilibiliSocialIdentities.deleteByUserId(userId);
      await trySafe(secrets.deleteSocialTokenSetSecretByUserIdAndTarget(userId, bilibiliTarget));

      ctx.status = 204;

      return next();
    }
  );
}
