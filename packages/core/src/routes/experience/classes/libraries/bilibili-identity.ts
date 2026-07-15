import { appInsights } from '@logto/app-insights/node';
import { trySafe } from '@silverhand/essentials';
import { z } from 'zod';

import type Queries from '#src/tenants/Queries.js';
import { buildAppInsightsTelemetry } from '#src/utils/request.js';

import { type InteractionProfile, type WithHooksAndLogsContext } from '../../types.js';

const bilibiliTarget = 'bilibili';

type SocialIdentity = NonNullable<InteractionProfile['socialIdentity']>;
type SocialConnectorTokenSetSecret = NonNullable<
  InteractionProfile['socialConnectorTokenSetSecret']
>;

/**
 * The extra Bilibili fields the connector packs into `SocialUserInfo.rawData`.
 * `biliExpiresIn` is the absolute UTC timestamp returned by Bilibili.
 */
const bilibiliRawDataGuard = z
  .object({
    uid: z.string(),
    biliExpiresIn: z.number(),
  })
  .partial();

/**
 * Build the row to persist. Identity attributes (openid/uid/name/face) always come from the
 * connector user info; the token columns are only included when a token set secret is present
 * (token storage enabled), so a token-less login neither wipes a previously stored token nor
 * blocks the identity from being recorded.
 */
const toBilibiliUpsertData = (
  socialIdentity: SocialIdentity,
  connectorId: string,
  tokenSetSecret?: SocialConnectorTokenSetSecret
) => {
  const { userInfo } = socialIdentity;
  const parsed = bilibiliRawDataGuard.safeParse(userInfo.rawData ?? {});
  const rawData = parsed.success ? parsed.data : {};

  return {
    connectorId,
    openid: userInfo.id,
    uid: rawData.uid ?? null,
    name: userInfo.name ?? null,
    face: userInfo.avatar ?? null,
    tokenExpiresAt: rawData.biliExpiresIn ?? null,
    ...(tokenSetSecret && {
      scopes: tokenSetSecret.encryptedTokenSet.metadata.scope ?? null,
      hasRefreshToken: tokenSetSecret.encryptedTokenSet.metadata.hasRefreshToken,
      encryptedTokenSet: tokenSetSecret.encryptedTokenSet.encryptedTokenSetBase64,
    }),
  };
};

/**
 * Persist (and refresh on every login) the Bilibili identity for a Logto user into the dedicated
 * `bilibili_social_identities` table so it always shows up in the admin console — independent of
 * whether social token storage is enabled.
 *
 * - Runs for the `bilibili` social target. The connector instance id comes from the token set
 *   secret when token storage is on, otherwise from the social identity itself.
 * - Token columns are only written when a token set secret is present; a token-less login keeps
 *   any previously stored token intact.
 * - Never throws: a failure here must not break the social authentication / link flow.
 */
export const upsertBilibiliIdentityFromProfile = async (
  queries: Queries,
  userId: string,
  profile: InteractionProfile,
  ctx: WithHooksAndLogsContext
): Promise<void> => {
  const { socialIdentity, socialConnectorTokenSetSecret } = profile;

  if (socialIdentity?.target !== bilibiliTarget) {
    return;
  }

  // The token set secret's connector id is authoritative (present when token storage is on);
  // otherwise fall back to the id carried on the social identity. Without either we cannot fill
  // the NOT NULL `connector_id` column, so skip.
  const connectorId =
    socialConnectorTokenSetSecret?.socialConnectorRelationPayload.connectorId ??
    socialIdentity.connectorId;

  if (!connectorId) {
    return;
  }

  await trySafe(
    async () =>
      queries.bilibiliSocialIdentities.upsertByUserId(
        userId,
        toBilibiliUpsertData(socialIdentity, connectorId, socialConnectorTokenSetSecret)
      ),
    (error) => {
      void appInsights.trackException(error, buildAppInsightsTelemetry(ctx));
    }
  );
};
