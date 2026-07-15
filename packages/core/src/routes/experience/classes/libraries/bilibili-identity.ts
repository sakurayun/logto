import { appInsights } from '@logto/app-insights/node';
import { type SocialUserInfo } from '@logto/connector-kit';
import { trySafe } from '@silverhand/essentials';
import { z } from 'zod';

import type Queries from '#src/tenants/Queries.js';
import { buildAppInsightsTelemetry } from '#src/utils/request.js';

import { type InteractionProfile, type WithHooksAndLogsContext } from '../../types.js';

const bilibiliTarget = 'bilibili';

type SocialConnectorTokenSetSecret = NonNullable<
  InteractionProfile['socialConnectorTokenSetSecret']
>;

/**
 * The extra Bilibili fields the connector packs into `SocialUserInfo.rawData`.
 * `biliExpiresIn` is the absolute UTC unix timestamp (seconds) at which the token expires.
 */
const bilibiliRawDataGuard = z
  .object({
    uid: z.string(),
    biliExpiresIn: z.number(),
  })
  .partial();

/** The stored social identity `details` are the connector's `SocialUserInfo` serialized as JSON. */
const storedUserInfoGuard = z.object({
  id: z.string(),
  name: z.string().nullish(),
  avatar: z.string().nullish(),
  rawData: z.unknown().optional(),
});

type BilibiliUserInfoLike = z.infer<typeof storedUserInfoGuard>;

/**
 * On a plain sign-in the interaction profile carries the token set secret but NOT the fresh social
 * identity (Logto only attaches it when registering or linking). Fall back to the Bilibili identity
 * already stored on the user so the `bilibili_social_identities` row is still refreshed.
 */
const getStoredBilibiliUserInfo = async (
  queries: Queries,
  userId: string
): Promise<BilibiliUserInfoLike | undefined> => {
  const user = await queries.users.findUserById(userId);
  const parsed = storedUserInfoGuard.safeParse(user.identities[bilibiliTarget]?.details);
  return parsed.success ? parsed.data : undefined;
};

/**
 * Build the row to persist. Identity attributes always come from the (fresh or stored) user info;
 * the token columns are only included when a token set secret is present (token storage enabled),
 * so a token-less login records the profile without wiping a previously stored token.
 */
const toBilibiliUpsertData = (
  userInfo: BilibiliUserInfoLike | SocialUserInfo,
  connectorId: string,
  tokenSetSecret?: SocialConnectorTokenSetSecret
) => {
  const parsed = bilibiliRawDataGuard.safeParse(userInfo.rawData ?? {});
  const rawData = parsed.success ? parsed.data : {};

  return {
    connectorId,
    openid: userInfo.id,
    uid: rawData.uid ?? null,
    name: userInfo.name ?? null,
    face: userInfo.avatar ?? null,
    // Unix seconds; the column is deliberately NOT named `*_at` so Logto's SQL builder does not
    // coerce this number into a `timestamptz` (see `convertToPrimitiveOrSql`).
    tokenExpiry: rawData.biliExpiresIn ?? null,
    ...(tokenSetSecret && {
      scopes: tokenSetSecret.encryptedTokenSet.metadata.scope ?? null,
      hasRefreshToken: tokenSetSecret.encryptedTokenSet.metadata.hasRefreshToken,
      encryptedTokenSet: tokenSetSecret.encryptedTokenSet.encryptedTokenSetBase64,
    }),
  };
};

/**
 * Persist (and refresh on every login) the Bilibili identity for a Logto user into the dedicated
 * `bilibili_social_identities` table so it always shows up in the admin console — for register,
 * link, and plain sign-in alike, and regardless of whether social token storage is enabled.
 *
 * - A Bilibili interaction is detected either from the fresh social identity (register / link) or
 *   from the token set secret's relation payload (plain sign-in).
 * - The user info comes from the fresh social identity when present, otherwise from the Bilibili
 *   identity already stored on the user.
 * - The connector instance id comes from the token set secret when token storage is on, otherwise
 *   from the social identity. Token columns are written only when a token set secret is present.
 * - Never throws: a failure here must not break the social authentication / link flow.
 */
export const upsertBilibiliIdentityFromProfile = async (
  queries: Queries,
  userId: string,
  profile: InteractionProfile,
  ctx: WithHooksAndLogsContext
): Promise<void> => {
  const { socialIdentity, socialConnectorTokenSetSecret } = profile;

  const isBilibili =
    socialIdentity?.target === bilibiliTarget ||
    socialConnectorTokenSetSecret?.socialConnectorRelationPayload.target === bilibiliTarget;

  if (!isBilibili) {
    return;
  }

  // The token set secret's connector id is authoritative (present when token storage is on);
  // otherwise fall back to the id carried on the social identity. Without either we cannot fill
  // the NOT NULL `connector_id` column, so skip.
  const connectorId =
    socialConnectorTokenSetSecret?.socialConnectorRelationPayload.connectorId ??
    socialIdentity?.connectorId;

  if (!connectorId) {
    return;
  }

  await trySafe(
    async () => {
      const userInfo =
        socialIdentity?.userInfo ?? (await getStoredBilibiliUserInfo(queries, userId));

      if (!userInfo) {
        return;
      }

      await queries.bilibiliSocialIdentities.upsertByUserId(
        userId,
        toBilibiliUpsertData(userInfo, connectorId, socialConnectorTokenSetSecret)
      );
    },
    (error) => {
      void appInsights.trackException(error, buildAppInsightsTelemetry(ctx));
    }
  );
};
