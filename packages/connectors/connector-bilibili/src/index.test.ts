import nock from 'nock';

import { ConnectorError, ConnectorErrorCodes } from '@logto/connector-kit';

import {
  accessTokenEndpoint,
  authorizationEndpoint,
  searchUserEndpoint,
  userInfoEndpoint,
} from './constant.js';
import createConnector, { getAccessToken } from './index.js';
import { mockedConfig } from './mock.js';

const getConfig = vi.fn().mockResolvedValue(mockedConfig);

const accessTokenHost = new URL(accessTokenEndpoint).origin;
const accessTokenPath = new URL(accessTokenEndpoint).pathname;
const userInfoHost = new URL(userInfoEndpoint).origin;
const userInfoPath = new URL(userInfoEndpoint).pathname;
const searchHost = new URL(searchUserEndpoint).origin;
const searchPath = new URL(searchUserEndpoint).pathname;

const mockedTokenData = {
  access_token: 'access_token_value',
  refresh_token: 'refresh_token_value',
  // Absolute UTC timestamp far in the future.
  expires_in: 9_999_999_999,
  scopes: ['USER_INFO', 'ATC_BASE'],
};

const mockedUserData = {
  name: '田所こうじ',
  face: 'https://i0.hdslb.com/bfs/face/mock.jpg',
  openid: 'fc9899b46ff443cea38190d355d49f3a',
};

const nockTokenAndUser = () => {
  nock(accessTokenHost)
    .post(accessTokenPath)
    .query(true)
    .reply(200, { code: 0, message: '0', ttl: 1, data: mockedTokenData });
  nock(userInfoHost)
    .get(userInfoPath)
    .reply(200, { code: 0, message: '0', request_id: 'rid', data: mockedUserData });
};

describe('getAuthorizationUri', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should build a valid authorization uri with gourl and state', async () => {
    const connector = await createConnector({ getConfig });
    const authorizationUri = await connector.getAuthorizationUri(
      {
        state: 'some_state',
        redirectUri: 'http://localhost:3001/callback',
        connectorId: 'some_connector_id',
        connectorFactoryId: 'bilibili-universal',
        jti: 'some_jti',
        headers: {},
      },
      vi.fn()
    );

    expect(authorizationUri).toContain(`${authorizationEndpoint}?`);
    expect(authorizationUri).toContain('client_id=client_id');
    expect(authorizationUri).toContain('gourl=http%3A%2F%2Flocalhost%3A3001%2Fcallback');
    expect(authorizationUri).toContain('state=some_state');
  });
});

describe('getAccessToken', () => {
  afterEach(() => {
    nock.cleanAll();
    vi.clearAllMocks();
  });

  it('should exchange the code for a token', async () => {
    nock(accessTokenHost)
      .post(accessTokenPath)
      .query(true)
      .reply(200, { code: 0, message: '0', ttl: 1, data: mockedTokenData });

    const data = await getAccessToken(mockedConfig, 'auth_code');
    expect(data.access_token).toBe('access_token_value');
    expect(data.refresh_token).toBe('refresh_token_value');
  });

  it('should throw SocialAuthCodeInvalid when the business code is not 0', async () => {
    nock(accessTokenHost)
      .post(accessTokenPath)
      .query(true)
      .reply(200, { code: 122_000, message: 'client_id error' });

    await expect(getAccessToken(mockedConfig, 'auth_code')).rejects.toMatchObject({
      code: ConnectorErrorCodes.SocialAuthCodeInvalid,
    });
  });
});

describe('getUserInfo', () => {
  afterEach(() => {
    nock.cleanAll();
    vi.clearAllMocks();
  });

  it('should resolve id/name/avatar and best-effort uid', async () => {
    nockTokenAndUser();
    nock(searchHost)
      .get(searchPath)
      .query(true)
      .reply(200, {
        code: 0,
        data: { items: [{ uid: 114_514, uname: '田所こうじ', face: 'x' }] },
      });

    const connector = await createConnector({ getConfig });
    const userInfo = await connector.getUserInfo({ code: 'auth_code' }, vi.fn());

    expect(userInfo.id).toBe(mockedUserData.openid);
    expect(userInfo.name).toBe(mockedUserData.name);
    expect(userInfo.avatar).toBe(mockedUserData.face);
    // @ts-expect-error -- rawData is loosely typed Json
    expect(userInfo.rawData.uid).toBe('114514');
    // @ts-expect-error -- rawData is loosely typed Json
    expect(userInfo.rawData.openid).toBe(mockedUserData.openid);
  });

  it('should not block login when uid lookup fails', async () => {
    nockTokenAndUser();
    nock(searchHost).get(searchPath).query(true).reply(500);

    const connector = await createConnector({ getConfig });
    const userInfo = await connector.getUserInfo({ code: 'auth_code' }, vi.fn());

    expect(userInfo.id).toBe(mockedUserData.openid);
    // @ts-expect-error -- rawData is loosely typed Json
    expect(userInfo.rawData.uid).toBeUndefined();
  });

  it('should throw SocialAccessTokenInvalid when the signed user info call fails', async () => {
    nock(accessTokenHost)
      .post(accessTokenPath)
      .query(true)
      .reply(200, { code: 0, message: '0', ttl: 1, data: mockedTokenData });
    nock(userInfoHost).get(userInfoPath).reply(200, { code: 4002, message: 'signature error' });

    const connector = await createConnector({ getConfig });
    await expect(connector.getUserInfo({ code: 'auth_code' }, vi.fn())).rejects.toBeInstanceOf(
      ConnectorError
    );
  });
});
