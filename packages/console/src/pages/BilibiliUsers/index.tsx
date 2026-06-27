import { useGSAP } from '@gsap/react';
import { conditional } from '@silverhand/essentials';
import { gsap } from 'gsap';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import BilibiliIcon from '@/assets/icons/bilibili.svg?react';
import { LocaleDate } from '@/components/DateTime';
import EmptyDataPlaceholder from '@/components/EmptyDataPlaceholder';
import ItemPreview from '@/components/ItemPreview';
import PageMeta from '@/components/PageMeta';
import { defaultPageSize } from '@/consts';
import Button from '@/ds-components/Button';
import CardTitle from '@/ds-components/CardTitle';
import Search from '@/ds-components/Search';
import Table from '@/ds-components/Table';
import TablePlaceholder from '@/ds-components/Table/TablePlaceholder';
import Tag, { type Props as TagProps } from '@/ds-components/Tag';
import type { RequestError } from '@/hooks/use-api';
import useSearchParametersWatcher from '@/hooks/use-search-parameters-watcher';
import useTenantPathname from '@/hooks/use-tenant-pathname';
import pageLayout from '@/scss/page-layout.module.scss';
import {
  type BilibiliIdentity,
  type BilibiliTokenStatus,
  getBilibiliTokenStatus,
} from '@/types/bilibili';
import { buildUrl, formatSearchKeyword } from '@/utils/url';

import styles from './index.module.scss';

gsap.registerPlugin(useGSAP);

const pageSize = defaultPageSize;
const bilibiliUsersPathname = '/bilibili-users';
const buildDetailsPathname = (userId: string) => `${bilibiliUsersPathname}/${userId}`;

const tokenStatusToTag: Record<BilibiliTokenStatus, TagProps['status']> = {
  active: 'success',
  expired: 'alert',
  none: 'info',
};

function BilibiliAvatar({
  face,
  name,
}: {
  readonly face: string | undefined;
  readonly name: string | undefined;
}) {
  if (!face) {
    return (
      <div aria-hidden className={styles.avatarFallback}>
        {(name ?? 'B').charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    // `referrerPolicy="no-referrer"` bypasses Bilibili's avatar hot-link protection.
    <img className={styles.avatar} src={face} alt={name ?? ''} referrerPolicy="no-referrer" />
  );
}

function BilibiliUsers() {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { navigate } = useTenantPathname();
  const containerRef = useRef<HTMLDivElement>(null);

  const [{ page, keyword }, updateSearchParameters] = useSearchParametersWatcher({
    page: 1,
    keyword: '',
  });

  const url = buildUrl('api/bilibili-identities', {
    page: String(page),
    page_size: String(pageSize),
    ...conditional(keyword && { search: formatSearchKeyword(keyword) }),
  });

  const { data, error, mutate } = useSWR<[BilibiliIdentity[], number], RequestError>(url);
  const isLoading = !data && !error;
  const [identities, totalCount] = data ?? [];

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-reveal]', {
          y: 12,
          opacity: 0,
          duration: 0.4,
          ease: 'power2.out',
          stagger: 0.08,
        });
      });
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className={pageLayout.container}>
      <PageMeta titleKey="bilibili_users.page_title" />
      <div data-reveal className={pageLayout.headline}>
        <CardTitle title="bilibili_users.title" subtitle="bilibili_users.subtitle" />
      </div>
      <div data-reveal className={styles.tableWrapper}>
        <Table
          className={pageLayout.table}
          rowGroups={[{ key: 'bilibiliIdentities', data: identities }]}
          rowIndexKey="id"
          isLoading={isLoading}
          errorMessage={error?.body?.message ?? error?.message}
          columns={[
            {
              title: t('bilibili_users.user'),
              dataIndex: 'user',
              colSpan: 6,
              render: (identity) => (
                <ItemPreview
                  title={identity.name ?? identity.openid}
                  subtitle={identity.openid}
                  icon={<BilibiliAvatar face={identity.face} name={identity.name} />}
                  to={buildDetailsPathname(identity.userId)}
                />
              ),
            },
            {
              title: t('bilibili_users.uid'),
              dataIndex: 'uid',
              colSpan: 3,
              render: ({ uid }) =>
                uid ? <span className={styles.mono}>{uid}</span> : <span>-</span>,
            },
            {
              title: t('bilibili_users.scopes'),
              dataIndex: 'scopes',
              colSpan: 5,
              render: ({ scopes }) => {
                const list = scopes?.split(' ').filter(Boolean) ?? [];
                return list.length > 0 ? (
                  <div className={styles.scopes}>
                    {list.map((scope) => (
                      <span key={scope} className={styles.scopeTag}>
                        {scope}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span>-</span>
                );
              },
            },
            {
              title: t('bilibili_users.token_status'),
              dataIndex: 'tokenStatus',
              colSpan: 3,
              render: (identity) => {
                const status = getBilibiliTokenStatus(identity);
                return (
                  <Tag type="state" status={tokenStatusToTag[status]} variant="plain">
                    {t(`bilibili_users.token_statuses.${status}`)}
                  </Tag>
                );
              },
            },
            {
              title: t('bilibili_users.updated_at'),
              dataIndex: 'updatedAt',
              colSpan: 3,
              render: ({ updatedAt }) => (
                <span className={styles.mono}>
                  <LocaleDate>{updatedAt}</LocaleDate>
                </span>
              ),
            },
          ]}
          filter={
            <Search
              placeholder={t('bilibili_users.search_placeholder')}
              defaultValue={keyword}
              isClearable={Boolean(keyword)}
              onSearch={(value) => {
                updateSearchParameters({ keyword: value, page: 1 });
              }}
              onClearSearch={() => {
                updateSearchParameters({ keyword: '', page: 1 });
              }}
            />
          }
          placeholder={
            keyword ? (
              <EmptyDataPlaceholder />
            ) : (
              <TablePlaceholder
                image={<BilibiliIcon />}
                imageDark={<BilibiliIcon />}
                title="bilibili_users.placeholder_title"
                description="bilibili_users.placeholder_description"
                action={
                  <Button
                    title="bilibili_users.go_to_connectors"
                    type="primary"
                    size="large"
                    onClick={() => {
                      navigate('/connectors/social');
                    }}
                  />
                }
              />
            )
          }
          rowClickHandler={({ userId }) => {
            navigate(buildDetailsPathname(userId));
          }}
          pagination={{
            page,
            pageSize,
            totalCount,
            onChange: (page) => {
              updateSearchParameters({ page });
            },
          }}
          onRetry={async () => mutate(undefined, true)}
        />
      </div>
    </div>
  );
}

export default BilibiliUsers;
