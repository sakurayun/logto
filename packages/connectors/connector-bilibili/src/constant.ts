import type { ConnectorMetadata } from '@logto/connector-kit';
import { ConnectorPlatform, ConnectorConfigFormItemType } from '@logto/connector-kit';

/**
 * Bilibili open platform OAuth 2.0 (account authorization).
 * Docs: https://open.bilibili.com/doc/4/eaf0e2b5-bde9-b9a0-9be1-019bb455701c
 */

/** The web authorization page users are redirected to. Uses `gourl` instead of `redirect_uri`. */
export const authorizationEndpoint = 'https://account.bilibili.com/pc/account-pc/auth/oauth';
/** Exchange the authorization `code` for an access token. No signature required. */
export const accessTokenEndpoint = 'https://api.bilibili.com/x/account-oauth2/v1/token';
/** Refresh the access token with a refresh token. No signature required. */
export const refreshTokenEndpoint = 'https://api.bilibili.com/x/account-oauth2/v1/refresh_token';
/** Get the authorized user's public info (name, face, openid). Requires v2.0 signature. */
export const userInfoEndpoint = 'https://member.bilibili.com/arcopen/fn/user/account/info';
/**
 * Unofficial Bilibili live endpoint used to resolve the global `uid` from a nickname.
 * The open platform only returns `openid`, not `uid`, so this is a best-effort lookup.
 */
export const searchUserEndpoint =
  'https://api.live.bilibili.com/banned_service/v2/Silent/search_user';

export const defaultTimeout = 5000;

export const defaultMetadata: ConnectorMetadata = {
  id: 'bilibili-universal',
  target: 'bilibili',
  platform: ConnectorPlatform.Universal,
  name: {
    en: 'Bilibili',
    'zh-CN': '哔哩哔哩',
    'zh-HK': '嗶哩嗶哩',
    'zh-TW': '嗶哩嗶哩',
  },
  logo: './logo.svg',
  logoDark: null,
  description: {
    en: 'Bilibili is a leading Chinese video-sharing and live-streaming community.',
    'zh-CN': '哔哩哔哩（B站）是国内领先的视频弹幕与直播社区。',
    'zh-HK': '嗶哩嗶哩（B站）是中國領先的影片彈幕與直播社區。',
    'zh-TW': '嗶哩嗶哩（B站）是中國領先的影片彈幕與直播社群。',
  },
  readme: './README.md',
  formItems: [
    {
      key: 'clientId',
      type: ConnectorConfigFormItemType.Text,
      label: 'Client ID',
      required: true,
      placeholder: '<client-id>',
      description: 'The `client_id` (Access Key ID) assigned when creating the Bilibili app.',
    },
    {
      key: 'clientSecret',
      type: ConnectorConfigFormItemType.Text,
      label: 'App Secret',
      required: true,
      placeholder: '<app-secret>',
      isConfidential: true,
      description: 'The `app_secret` assigned to the Bilibili app, used to sign API requests.',
    },
    {
      key: 'scope',
      type: ConnectorConfigFormItemType.MultilineText,
      label: 'Scope',
      required: false,
      placeholder: 'USER_INFO',
      description:
        'Optional. Bilibili scopes are granted in the app console; this field is informational only.',
    },
    {
      key: 'searchUserAgent',
      type: ConnectorConfigFormItemType.Text,
      label: 'UID lookup User-Agent',
      required: false,
      placeholder: 'Mozilla/5.0 ...',
      description:
        'User-Agent used for the best-effort `uid` lookup against the Bilibili live search API.',
    },
    {
      key: 'searchCookie',
      type: ConnectorConfigFormItemType.MultilineText,
      label: 'UID lookup Cookie',
      required: false,
      placeholder: 'SESSDATA=...; bili_jct=...',
      isConfidential: true,
      description:
        'A logged-in Bilibili cookie for the best-effort `uid` lookup. If empty or invalid, `uid` is left blank and login still succeeds.',
    },
  ],
  isTokenStorageSupported: true,
};
