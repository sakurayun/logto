import type { BilibiliConfig } from './types.js';

export const mockedConfig: BilibiliConfig = {
  clientId: 'client_id',
  clientSecret: 'app_secret',
  scope: 'USER_INFO',
  searchUserAgent: 'Mozilla/5.0 (Logto connector test)',
  searchCookie: 'SESSDATA=mock_sessdata',
};
