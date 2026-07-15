/* init_order = 2 */

create table bilibili_social_identities (
  tenant_id varchar(21) not null
    references tenants (id) on update cascade on delete cascade,
  id varchar(21) not null primary key,
  user_id varchar(21) not null
    references users (id) on update cascade on delete cascade,
  /** The Logto social connector instance id, used to refresh the token later. */
  connector_id varchar(128) not null,
  /** The social connector target, always 'bilibili'. */
  target varchar(256) not null default 'bilibili',
  /** Bilibili open platform openid (unique per developer app). Used as the social identity id. */
  openid varchar(256) not null,
  /** Bilibili global uid, best-effort resolved from the nickname. May be null. */
  uid varchar(32),
  /** Bilibili nickname. */
  name varchar(256),
  /** Bilibili avatar URL (hot-link protected, cache before display). */
  face varchar(2048),
  /** Space-joined authorized scopes, e.g. 'USER_INFO ATC_BASE'. */
  scopes varchar(512),
  /** Absolute UTC unix timestamp (seconds) when the access token expires. Deliberately not named with an _at suffix so the SQL builder keeps it a bigint instead of coercing it to a timestamp. */
  token_expiry bigint,
  /** Whether a refresh token is stored. */
  has_refresh_token boolean not null default false,
  /** Base64-serialized encrypted token set ({ access_token, refresh_token }). */
  encrypted_token_set text,
  created_at timestamptz not null default(now()),
  updated_at timestamptz not null default(now()),
  constraint bilibili_social_identities__tenant_user
    unique (tenant_id, user_id)
);

create trigger set_updated_at
  before update on bilibili_social_identities
  for each row
  execute procedure set_updated_at();
