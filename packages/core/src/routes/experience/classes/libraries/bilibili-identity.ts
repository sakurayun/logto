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

/** Build the consolidated row to persist. Kept separate to keep the hook simple. */
const toBilibiliUpsertData = (
  socialIdentity: SocialIdentity,
  { encryptedTokenSet }: SocialConnectorTokenSetSecret,
  connectorId: string
) => {
  const { userInfo } = socialIdentity;
  const parsed = bilibiliRawDataGuard.safeParse(userInfo.rawData ?? {});
  const rawData = parsed.success ? parsed.data : {};
  const { metadata, encryptedTokenSetBase64 } = encryptedTokenSet;

  return {
    connectorId,
    openid: userInfo.id,
    uid: rawData.uid ?? null,
    name: userInfo.name ?? null,
    face: userInfo.avatar ?? null,
    scopes: metadata.scope ?? null,
    tokenExpiresAt: rawData.biliExpiresIn ?? null,
    hasRefreshToken: metadata.hasRefreshToken,
    encryptedTokenSet: encryptedTokenSetBase64,
  };
};

/**
 * Persist (and refresh on every login) the Bilibili identity for a Logto user into the
 * dedicated `bilibili_social_identities` table.
 *
 * - Only runs for the `bilibili` social target when a token set secret is present (token
 *   storage enabled), which carries the connector id, scopes, expiry and the already-encrypted
 *   token set that we store as-is.
 * - Identity attributes (uid/openid/face/name) come from the connector's user info / `rawData`.
 * - Never throws: a failure here must not break the social authentication / link flow.
 */
export const upsertBilibiliIdentityFromProfile = async (
  queries: Queries,
  userId: string,
  profile: InteractionProfile,
  ctx: WithHooksAndLogsContext
): Promise<void> => {
  const { socialIdentity, socialConnectorTokenSetSecret } = profile;

  if (socialIdentity?.target !== bilibiliTarget || !socialConnectorTokenSetSecret) {
    return;
  }

  const { connectorId } = socialConnectorTokenSetSecret.socialConnectorRelationPayload;

  await trySafe(
    async () =>
      queries.bilibiliSocialIdentities.upsertByUserId(
        userId,
        toBilibiliUpsertData(socialIdentity, socialConnectorTokenSetSecret, connectorId)
      ),
    (error) => {
      void appInsights.trackException(error, buildAppInsightsTelemetry(ctx));
    }
  );
};
