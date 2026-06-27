export type BilibiliIdentity = {
  id: string;
  userId: string;
  connectorId: string;
  target: string;
  openid: string;
  uid: string | undefined;
  name: string | undefined;
  face: string | undefined;
  /** Space-joined scopes, e.g. 'USER_INFO ATC_BASE'. */
  scopes: string | undefined;
  /** Absolute UTC unix timestamp (seconds) when the access token expires. */
  tokenExpiresAt: number | undefined;
  hasRefreshToken: boolean;
  hasToken: boolean;
  createdAt: number;
  updatedAt: number;
};

export type BilibiliTokenReveal = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt: number | undefined;
};

export type BilibiliTokenStatus = 'active' | 'expired' | 'none';

export const getBilibiliTokenStatus = (identity: {
  hasToken: boolean;
  tokenExpiresAt: number | undefined;
}): BilibiliTokenStatus => {
  if (!identity.hasToken) {
    return 'none';
  }

  const { tokenExpiresAt } = identity;
  if (tokenExpiresAt && tokenExpiresAt * 1000 < Date.now()) {
    return 'expired';
  }

  return 'active';
};
