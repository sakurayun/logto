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
  tokenExpiry: number | undefined;
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
  tokenExpiry: number | undefined;
}): BilibiliTokenStatus => {
  if (!identity.hasToken) {
    return 'none';
  }

  const { tokenExpiry } = identity;
  if (tokenExpiry && tokenExpiry * 1000 < Date.now()) {
    return 'expired';
  }

  return 'active';
};
