import { z } from 'zod';

export const bilibiliConfigGuard = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  scope: z.string().optional(),
  searchUserAgent: z.string().optional(),
  searchCookie: z.string().optional(),
});

export type BilibiliConfig = z.infer<typeof bilibiliConfigGuard>;

/** The OAuth callback returns `code` (and `state`) as query parameters. */
export const authResponseGuard = z.object({ code: z.string() });

export type AuthResponse = z.infer<typeof authResponseGuard>;

/**
 * Response of the token & refresh_token endpoints.
 * Note: `data.expires_in` is an absolute UTC unix timestamp, not a relative duration.
 */
export const accessTokenResponseGuard = z.object({
  code: z.number(),
  message: z.string().optional(),
  ttl: z.number().optional(),
  data: z
    .object({
      access_token: z.string(),
      refresh_token: z.string().optional(),
      expires_in: z.number(),
      scopes: z.array(z.string()).optional(),
    })
    .optional(),
});

export type AccessTokenResponse = z.infer<typeof accessTokenResponseGuard>;

/** Response of the signed `user/account/info` endpoint. Does not include `uid`. */
export const userInfoResponseGuard = z.object({
  code: z.number(),
  message: z.string().optional(),
  request_id: z.string().optional(),
  data: z
    .object({
      name: z.string(),
      face: z.string().optional(),
      openid: z.string(),
    })
    .optional(),
});

export type UserInfoResponse = z.infer<typeof userInfoResponseGuard>;

/** Response of the unofficial live `search_user` endpoint used to resolve `uid`. */
export const searchUserResponseGuard = z.object({
  code: z.number(),
  data: z
    .object({
      items: z
        .array(
          z.object({
            uid: z.number(),
            face: z.string().optional(),
            uname: z.string(),
          })
        )
        .optional(),
    })
    .nullable()
    .optional(),
});

export type SearchUserResponse = z.infer<typeof searchUserResponseGuard>;
