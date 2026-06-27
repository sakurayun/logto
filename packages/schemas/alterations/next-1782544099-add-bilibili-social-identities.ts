import { sql } from '@silverhand/slonik';

import type { AlterationScript } from '../lib/types/alteration.js';

const alteration: AlterationScript = {
  up: async (pool) => {
    await pool.query(sql`
      create table bilibili_social_identities (
        tenant_id varchar(21) not null
          references tenants (id) on update cascade on delete cascade,
        id varchar(21) not null primary key,
        user_id varchar(21) not null
          references users (id) on update cascade on delete cascade,
        connector_id varchar(128) not null,
        target varchar(256) not null default 'bilibili',
        openid varchar(256) not null,
        uid varchar(32),
        name varchar(256),
        face varchar(2048),
        scopes varchar(512),
        token_expires_at bigint,
        has_refresh_token boolean not null default false,
        encrypted_token_set text,
        created_at timestamptz not null default(now()),
        updated_at timestamptz not null default(now()),
        constraint bilibili_social_identities__tenant_user
          unique (tenant_id, user_id)
      );
    `);

    await pool.query(sql`
      create trigger set_updated_at
        before update on bilibili_social_identities
        for each row
        execute procedure set_updated_at();
    `);
  },
  down: async (pool) => {
    await pool.query(sql`
      drop table if exists bilibili_social_identities;
    `);
  },
};

export default alteration;
