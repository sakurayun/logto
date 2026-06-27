import {
  type BilibiliSocialIdentity,
  type BilibiliSocialIdentityKeys,
  type CreateBilibiliSocialIdentity,
  BilibiliSocialIdentities,
} from '@logto/schemas';
import { generateStandardId } from '@logto/shared';
import { type Nullable } from '@silverhand/essentials';
import { sql, type CommonQueryMethods } from '@silverhand/slonik';

import SchemaQueries from '#src/utils/SchemaQueries.js';
import { convertToIdentifiers, manyRows } from '#src/utils/sql.js';

const { table, fields } = convertToIdentifiers(BilibiliSocialIdentities);

/** Mutable columns updated on every Bilibili login. */
type UpsertableData = Pick<
  CreateBilibiliSocialIdentity,
  | 'connectorId'
  | 'openid'
  | 'uid'
  | 'name'
  | 'face'
  | 'scopes'
  | 'tokenExpiresAt'
  | 'hasRefreshToken'
  | 'encryptedTokenSet'
>;

export default class BilibiliSocialIdentityQueries extends SchemaQueries<
  BilibiliSocialIdentityKeys,
  CreateBilibiliSocialIdentity,
  BilibiliSocialIdentity
> {
  constructor(pool: CommonQueryMethods) {
    super(pool, BilibiliSocialIdentities, { field: 'updatedAt', order: 'desc' });
  }

  async findByUserId(userId: string): Promise<Nullable<BilibiliSocialIdentity>> {
    return this.pool.maybeOne<BilibiliSocialIdentity>(sql`
      select ${sql.join(Object.values(fields), sql`, `)}
      from ${table}
      where ${fields.userId} = ${userId}
    `);
  }

  /**
   * Insert or update the Bilibili identity for a Logto user. Called on every login so the
   * stored profile and tokens are always refreshed to the latest values.
   */
  async upsertByUserId(userId: string, data: UpsertableData): Promise<BilibiliSocialIdentity> {
    const existing = await this.findByUserId(userId);

    if (existing) {
      return this.updateById(existing.id, data);
    }

    return this.insert({ id: generateStandardId(), userId, ...data });
  }

  async findEntities(
    { limit, offset }: { limit: number; offset: number },
    search?: string
  ): Promise<readonly BilibiliSocialIdentity[]> {
    return manyRows(
      this.pool.query<BilibiliSocialIdentity>(sql`
        select ${sql.join(Object.values(fields), sql`, `)}
        from ${table}
        ${this.buildSearchWhere(search)}
        order by ${fields.updatedAt} desc
        limit ${limit}
        offset ${offset}
      `)
    );
  }

  async countEntities(search?: string): Promise<number> {
    const { count } = await this.pool.one<{ count: string }>(sql`
      select count(*) from ${table} ${this.buildSearchWhere(search)}
    `);
    return Number(count);
  }

  /** Clear the stored token set (revoke) while keeping the identity row. */
  async clearTokenByUserId(userId: string): Promise<void> {
    await this.pool.query(sql`
      update ${table}
      set ${fields.encryptedTokenSet} = null,
        ${fields.hasRefreshToken} = false,
        ${fields.tokenExpiresAt} = null
      where ${fields.userId} = ${userId}
    `);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.pool.query(sql`
      delete from ${table}
      where ${fields.userId} = ${userId}
    `);
  }

  private buildSearchWhere(search?: string) {
    if (!search) {
      return sql``;
    }

    const keyword = `%${search}%`;
    return sql`
      where (
        ${fields.openid} ilike ${keyword}
        or ${fields.uid} ilike ${keyword}
        or ${fields.name} ilike ${keyword}
      )
    `;
  }
}
