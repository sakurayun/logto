# Bilibili connector

The official Bilibili (哔哩哔哩) open-platform **account authorization** social connector for Logto.

It implements the Bilibili OAuth 2.0 flow:

1. Redirect the user to the Bilibili authorization page.
2. Exchange the returned `code` for `access_token` / `refresh_token`.
3. Call the signed (HMAC-SHA256, signature version 2.0) `user/account/info` endpoint to read `name`, `face` and `openid`.
4. Best-effort resolve the global `uid` from the nickname via the unofficial live `search_user` endpoint.

## Set up a Bilibili app

1. Register and create an application on the [Bilibili open platform](https://open.bilibili.com/).
2. Obtain the `client_id` (Access Key ID) and `app_secret`.
3. Configure the **授权回调域 (authorization callback domain)** to match your Logto social callback domain.
4. Apply for the `USER_INFO` scope so the user-info endpoint can be called.

## Configuration

| Field | Required | Description |
| --- | --- | --- |
| `clientId` | Yes | The `client_id` (Access Key ID) of the Bilibili app. |
| `clientSecret` | Yes | The `app_secret`, used to sign API requests. |
| `scope` | No | Informational only; Bilibili grants scopes in the app console. |
| `searchUserAgent` | No | User-Agent used for the best-effort `uid` lookup. |
| `searchCookie` | No | A logged-in Bilibili cookie for the best-effort `uid` lookup. |

> [!NOTE]
> The Bilibili open platform only returns `openid`, not the global `uid`. The `uid` is resolved
> best-effort via an **unofficial** live endpoint that requires a logged-in cookie. If the cookie
> is missing/expired or no exact nickname match is found, `uid` is left blank and login still
> succeeds. The avatar (`face`) URL is hot-link protected by Bilibili and should be cached before
> being displayed directly.

## References

- [Account authorization](https://open.bilibili.com/doc/4/eaf0e2b5-bde9-b9a0-9be1-019bb455701c)
- [API signature & status codes](https://open.bilibili.com/doc/4/8673959e-f7bb-56e6-6e68-d225f971b81b)
- [Get user public info](https://open.bilibili.com/doc/4/feb66f99-7d87-c206-00e7-d84164cd701c)
