import crypto from 'node:crypto';

import {
  ConnectorError,
  ConnectorErrorCodes,
  validateConfig,
  ConnectorType,
  jsonGuard,
} from '@logto/connector-kit';
import type {
  GetAuthorizationUri,
  GetUserInfo,
  SocialConnector,
  CreateConnector,
  GetConnectorConfig,
  GetTokenResponseAndUserInfo,
  GetAccessTokenByRefreshToken,
  SocialUserInfo,
  TokenResponse,
} from '@logto/connector-kit';
import ky, { HTTPError } from 'ky';

import {
  authorizationEndpoint,
  accessTokenEndpoint,
  refreshTokenEndpoint,
  userInfoEndpoint,
  searchUserEndpoint,
  defaultMetadata,
  defaultTimeout,
} from './constant.js';
import type { BilibiliConfig } from './types.js';
import {
  bilibiliConfigGuard,
  authResponseGuard,
  accessTokenResponseGuard,
  userInfoResponseGuard,
  searchUserResponseGuard,
} from './types.js';

const getAuthorizationUri =
  (getConfig: GetConnectorConfig): GetAuthorizationUri =>
  async ({ state, redirectUri }) => {
    const config = await getConfig(defaultMetadata.id);
    validateConfig(config, bilibiliConfigGuard);

    // Bilibili uses `gourl` for the callback (URL-encoded by URLSearchParams) and grants
    // scope on the app console rather than via the authorization URL.
    const queryParameters = new URLSearchParams({
      client_id: config.clientId,
      gourl: redirectUri,
      state,
    });

    return `${authorizationEndpoint}?${queryParameters.toString()}`;
  };

const authorizationCallbackHandler = async (parameterObject: unknown) => {
  const result = authResponseGuard.safeParse(parameterObject);

  if (!result.success) {
    throw new ConnectorError(ConnectorErrorCodes.General, JSON.stringify(parameterObject));
  }

  return result.data;
};

/**
 * Build the public request headers (signature version 2.0) required by the Bilibili open
 * platform signed APIs.
 *
 * Algorithm: collect the `x-bili-*` headers, sort by key, join as `key:value` with `\n`,
 * then HMAC-SHA256 the result with `app_secret` and put the hex digest in `Authorization`.
 * Docs: https://open.bilibili.com/doc/4/8673959e-f7bb-56e6-6e68-d225f971b81b
 */
const buildSignedHeaders = (
  clientId: string,
  appSecret: string,
  accessToken: string,
  body = ''
): Record<string, string> => {
  // For GET requests / empty body, MD5 the empty string (d41d8cd98f00b204e9800998ecf8427e).
  const contentMd5 = crypto.createHash('md5').update(body, 'utf8').digest('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();

  const headersToSign: Record<string, string> = {
    'x-bili-accesskeyid': clientId,
    'x-bili-content-md5': contentMd5,
    'x-bili-signature-method': 'HMAC-SHA256',
    'x-bili-signature-nonce': nonce,
    'x-bili-signature-version': '2.0',
    'x-bili-timestamp': timestamp,
  };

  const sortedString = Object.keys(headersToSign)
    .toSorted()
    .map((key) => `${key}:${headersToSign[key]}`)
    .join('\n');

  const signature = crypto
    .createHmac('sha256', appSecret)
    .update(sortedString, 'utf8')
    .digest('hex');

  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Access-Token': accessToken,
    Authorization: signature,
    'X-Bili-Accesskeyid': clientId,
    'X-Bili-Content-Md5': contentMd5,
    'X-Bili-Signature-Method': 'HMAC-SHA256',
    'X-Bili-Signature-Nonce': nonce,
    'X-Bili-Signature-Version': '2.0',
    'X-Bili-Timestamp': timestamp,
  };
};

export const getAccessToken = async (config: BilibiliConfig, code: string) => {
  const httpResponse = await ky
    .post(accessTokenEndpoint, {
      searchParams: {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: defaultTimeout,
    })
    .json();

  const result = accessTokenResponseGuard.safeParse(httpResponse);

  if (!result.success) {
    throw new ConnectorError(ConnectorErrorCodes.InvalidResponse, result.error);
  }

  if (result.data.code !== 0 || !result.data.data) {
    throw new ConnectorError(
      ConnectorErrorCodes.SocialAuthCodeInvalid,
      JSON.stringify(httpResponse)
    );
  }

  return result.data.data;
};

/** Call the signed `user/account/info` endpoint. Returns `{ name, face, openid }`. */
const getBilibiliUserInfo = async (config: BilibiliConfig, accessToken: string) => {
  const headers = buildSignedHeaders(config.clientId, config.clientSecret, accessToken);

  try {
    const httpResponse = await ky
      .get(userInfoEndpoint, { headers, timeout: defaultTimeout })
      .json();

    const result = userInfoResponseGuard.safeParse(httpResponse);

    if (!result.success) {
      throw new ConnectorError(ConnectorErrorCodes.InvalidResponse, result.error);
    }

    if (result.data.code !== 0 || !result.data.data) {
      // E.g. 4002 signature error, 4003 request expired, token invalid, etc.
      throw new ConnectorError(
        ConnectorErrorCodes.SocialAccessTokenInvalid,
        JSON.stringify(httpResponse)
      );
    }

    return result.data.data;
  } catch (error: unknown) {
    if (error instanceof HTTPError) {
      const { status, body: rawBody } = error.response;

      if (status === 401) {
        throw new ConnectorError(ConnectorErrorCodes.SocialAccessTokenInvalid);
      }

      throw new ConnectorError(ConnectorErrorCodes.General, JSON.stringify(rawBody));
    }

    throw error;
  }
};

/**
 * Best-effort resolution of the global `uid` from the nickname via the unofficial live
 * `search_user` endpoint. Returns `undefined` on any failure so login is never blocked.
 */
const searchUid = async (config: BilibiliConfig, name: string): Promise<string | undefined> => {
  if (!config.searchCookie || !config.searchUserAgent) {
    return undefined;
  }

  try {
    const httpResponse = await ky
      .get(searchUserEndpoint, {
        searchParams: { search: name },
        headers: {
          'User-Agent': config.searchUserAgent,
          Cookie: config.searchCookie,
        },
        timeout: defaultTimeout,
      })
      .json();

    const result = searchUserResponseGuard.safeParse(httpResponse);

    if (!result.success || result.data.code !== 0) {
      return undefined;
    }

    const items = result.data.data?.items ?? [];
    // The nickname is not guaranteed to be unique; take the first exact `uname` match.
    const matched = items.find((item) => item.uname === name);

    return matched ? String(matched.uid) : undefined;
  } catch {
    return undefined;
  }
};

const buildSocialUserInfo = async (
  config: BilibiliConfig,
  accessToken: string,
  scopes?: string[],
  biliExpiresIn?: number
): Promise<SocialUserInfo> => {
  const { name, face, openid } = await getBilibiliUserInfo(config, accessToken);
  const uid = await searchUid(config, name);

  return {
    // `openid` is stable per developer app, used as the social identity id.
    id: openid,
    name,
    avatar: face,
    // Omit `undefined` values: JSON (jsonGuard) only accepts defined/null values.
    rawData: jsonGuard.parse({
      openid,
      name,
      ...(uid === undefined ? {} : { uid }),
      ...(face === undefined ? {} : { face }),
      ...(scopes === undefined ? {} : { scopes }),
      // The absolute UTC timestamp as returned by Bilibili.
      ...(biliExpiresIn === undefined ? {} : { biliExpiresIn }),
    }),
  };
};

const handleAuthorizationCallback = async (getConfig: GetConnectorConfig, data: unknown) => {
  const { code } = await authorizationCallbackHandler(data);
  const config = await getConfig(defaultMetadata.id);
  validateConfig(config, bilibiliConfigGuard);
  const tokenData = await getAccessToken(config, code);
  return { config, tokenData };
};

const getUserInfo =
  (getConfig: GetConnectorConfig): GetUserInfo =>
  async (data) => {
    const { config, tokenData } = await handleAuthorizationCallback(getConfig, data);
    return buildSocialUserInfo(
      config,
      tokenData.access_token,
      tokenData.scopes,
      tokenData.expires_in
    );
  };

const getTokenResponseAndUserInfo =
  (getConfig: GetConnectorConfig): GetTokenResponseAndUserInfo =>
  async (data) => {
    const { config, tokenData } = await handleAuthorizationCallback(getConfig, data);
    const userInfo = await buildSocialUserInfo(
      config,
      tokenData.access_token,
      tokenData.scopes,
      tokenData.expires_in
    );

    // Bilibili returns `expires_in` as an absolute UTC timestamp; convert it to a relative
    // duration (seconds) so Logto computes the correct `expiresAt` for token storage.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tokenResponse: TokenResponse = {
      access_token: tokenData.access_token,
      ...(tokenData.refresh_token ? { refresh_token: tokenData.refresh_token } : {}),
      expires_in: Math.max(tokenData.expires_in - nowSeconds, 0),
      scope: (tokenData.scopes ?? []).join(' '),
      token_type: 'Bearer',
    };

    return { tokenResponse, userInfo };
  };

const getAccessTokenByRefreshToken =
  (getConfig: GetConnectorConfig): GetAccessTokenByRefreshToken =>
  async (refreshToken: string) => {
    const config = await getConfig(defaultMetadata.id);
    validateConfig(config, bilibiliConfigGuard);

    try {
      const httpResponse = await ky
        .post(refreshTokenEndpoint, {
          searchParams: {
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: defaultTimeout,
        })
        .json();

      const result = accessTokenResponseGuard.safeParse(httpResponse);

      if (!result.success) {
        throw new ConnectorError(ConnectorErrorCodes.InvalidResponse, result.error);
      }

      if (result.data.code !== 0 || !result.data.data) {
        throw new ConnectorError(
          ConnectorErrorCodes.SocialAccessTokenInvalid,
          JSON.stringify(httpResponse)
        );
      }

      const { access_token, refresh_token, expires_in } = result.data.data;
      const nowSeconds = Math.floor(Date.now() / 1000);

      return {
        access_token,
        // Keep the original refresh token if a new one is not returned.
        refresh_token: refresh_token ?? refreshToken,
        expires_in: Math.max(expires_in - nowSeconds, 0),
        token_type: 'Bearer',
      };
    } catch (error: unknown) {
      if (error instanceof ConnectorError) {
        throw error;
      }

      if (error instanceof HTTPError) {
        throw new ConnectorError(ConnectorErrorCodes.General, JSON.stringify(error.response.body));
      }

      throw error;
    }
  };

const createBilibiliConnector: CreateConnector<SocialConnector> = async ({ getConfig }) => {
  return {
    metadata: defaultMetadata,
    type: ConnectorType.Social,
    configGuard: bilibiliConfigGuard,
    getAuthorizationUri: getAuthorizationUri(getConfig),
    getUserInfo: getUserInfo(getConfig),
    getTokenResponseAndUserInfo: getTokenResponseAndUserInfo(getConfig),
    getAccessTokenByRefreshToken: getAccessTokenByRefreshToken(getConfig),
  };
};

export default createBilibiliConnector;
