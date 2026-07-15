import { useGSAP } from '@gsap/react';
import { condArray } from '@silverhand/essentials';
import { gsap } from 'gsap';
import { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';

import Delete from '@/assets/icons/delete.svg?react';
import Eye from '@/assets/icons/eye.svg?react';
import Forbidden from '@/assets/icons/forbidden.svg?react';
import KeyIcon from '@/assets/icons/key.svg?react';
import { LocaleDate } from '@/components/DateTime';
import DetailsPage from '@/components/DetailsPage';
import DetailsPageHeader, { type MenuItem } from '@/components/DetailsPage/DetailsPageHeader';
import FormCard from '@/components/FormCard';
import PageMeta from '@/components/PageMeta';
import Button from '@/ds-components/Button';
import CopyToClipboard from '@/ds-components/CopyToClipboard';
import DynamicT from '@/ds-components/DynamicT';
import FormField from '@/ds-components/FormField';
import Tag, { type Props as TagProps } from '@/ds-components/Tag';
import useApi, { type RequestError } from '@/hooks/use-api';
import { useConfirmModal } from '@/hooks/use-confirm-modal';
import useTenantPathname from '@/hooks/use-tenant-pathname';
import {
  type BilibiliIdentity,
  type BilibiliTokenReveal,
  type BilibiliTokenStatus,
  getBilibiliTokenStatus,
} from '@/types/bilibili';

import styles from './index.module.scss';

gsap.registerPlugin(useGSAP);

const tokenStatusToTag: Record<BilibiliTokenStatus, TagProps['status']> = {
  active: 'success',
  expired: 'alert',
  none: 'info',
};

function BilibiliHeaderAvatar({
  face,
  name,
}: {
  readonly face: string | undefined;
  readonly name: string | undefined;
}) {
  if (!face) {
    return (
      <div aria-hidden className={styles.headerAvatarFallback}>
        {(name ?? 'B').charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img className={styles.headerAvatar} src={face} alt={name ?? ''} referrerPolicy="no-referrer" />
  );
}

function BilibiliUserDetails() {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { userId } = useParams();
  const { navigate } = useTenantPathname();
  const api = useApi();
  const { show } = useConfirmModal();
  const formRef = useRef<HTMLDivElement>(null);

  const { data, error, isLoading, mutate } = useSWR<BilibiliIdentity, RequestError>(
    userId && `api/bilibili-identities/${userId}`
  );

  const [revealed, setRevealed] = useState<BilibiliTokenReveal>();
  const [isRevealing, setIsRevealing] = useState(false);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-reveal]', {
          y: 14,
          opacity: 0,
          duration: 0.4,
          ease: 'power2.out',
          stagger: 0.1,
        });
      });
    },
    { scope: formRef, dependencies: [Boolean(data)] }
  );

  const onReveal = async () => {
    if (!userId) {
      return;
    }
    setIsRevealing(true);
    try {
      const tokens = await api
        .get(`api/bilibili-identities/${userId}/token`)
        .json<BilibiliTokenReveal>();
      setRevealed(tokens);
    } finally {
      setIsRevealing(false);
    }
  };

  const onRefresh = async () => {
    if (!userId) {
      return;
    }
    const updated = await api
      .post(`api/bilibili-identities/${userId}/refresh`)
      .json<BilibiliIdentity>();
    setRevealed(undefined);
    await mutate(updated);
    toast.success(t('bilibili_users.token_refreshed'));
  };

  const onRevoke = async () => {
    if (!userId) {
      return;
    }
    const [confirmed] = await show({
      title: 'bilibili_users.revoke_token',
      ModalContent: () => <DynamicT forKey="bilibili_users.revoke_token_confirm" />,
      confirmButtonText: 'bilibili_users.revoke',
    });
    if (!confirmed) {
      return;
    }
    await api.delete(`api/bilibili-identities/${userId}/token`);
    setRevealed(undefined);
    await mutate();
    toast.success(t('bilibili_users.token_revoked'));
  };

  const onDelete = async () => {
    if (!userId) {
      return;
    }
    const [confirmed] = await show({
      title: 'bilibili_users.delete_record',
      ModalContent: () => <DynamicT forKey="bilibili_users.delete_record_confirm" />,
      confirmButtonText: 'general.delete',
    });
    if (!confirmed) {
      return;
    }
    await api.delete(`api/bilibili-identities/${userId}`);
    toast.success(t('bilibili_users.record_deleted'));
    navigate('/bilibili-users');
  };

  const status = data ? getBilibiliTokenStatus(data) : 'none';
  const scopeList = data?.scopes?.split(' ').filter(Boolean) ?? [];

  return (
    <DetailsPage
      backLink="/bilibili-users"
      backLinkTitle="bilibili_users.title"
      isLoading={isLoading}
      error={error}
      onRetry={mutate}
    >
      <PageMeta titleKey="bilibili_users.details_page_title" />
      {data && (
        <DetailsPageHeader
          icon={<BilibiliHeaderAvatar face={data.face} name={data.name} />}
          title={<span>{data.name ?? data.openid}</span>}
          identifier={{ name: 'OpenID', value: data.openid }}
          actionMenuItems={condArray<MenuItem>(
            data.hasToken &&
              data.hasRefreshToken && {
                title: 'bilibili_users.refresh_action',
                icon: <KeyIcon />,
                onClick: onRefresh,
              },
            data.hasToken && {
              title: 'bilibili_users.revoke_token',
              icon: <Forbidden />,
              onClick: onRevoke,
              type: 'danger',
            },
            {
              title: 'bilibili_users.delete_record',
              icon: <Delete />,
              onClick: onDelete,
              type: 'danger',
            }
          )}
        />
      )}

      {data && (
        <div ref={formRef} className={styles.form}>
          <FormCard data-reveal title="bilibili_users.identity_card_title">
            <FormField title="bilibili_users.uid">
              <CopyToClipboard displayType="block" variant="border" value={data.uid ?? '-'} />
            </FormField>
            <FormField title="bilibili_users.openid">
              <CopyToClipboard displayType="block" variant="border" value={data.openid} />
            </FormField>
            <FormField title="bilibili_users.name">
              <CopyToClipboard displayType="block" variant="border" value={data.name ?? '-'} />
            </FormField>
            <FormField title="bilibili_users.face">
              <CopyToClipboard displayType="block" variant="border" value={data.face ?? '-'} />
            </FormField>
            <FormField title="bilibili_users.scopes">
              {scopeList.length > 0 ? (
                <div className={styles.scopes}>
                  {scopeList.map((scope) => (
                    <span key={scope} className={styles.scopeTag}>
                      {scope}
                    </span>
                  ))}
                </div>
              ) : (
                <div className={styles.placeholderText}>-</div>
              )}
            </FormField>
          </FormCard>

          <FormCard data-reveal title="bilibili_users.token_card_title">
            <FormField title="bilibili_users.token_status">
              <div className={styles.statusRow}>
                <Tag type="state" status={tokenStatusToTag[status]} variant="plain">
                  {t(`bilibili_users.token_statuses.${status}`)}
                </Tag>
              </div>
            </FormField>
            <FormField title="bilibili_users.expires_at">
              <div className={styles.mono}>
                {data.tokenExpiry ? <LocaleDate>{data.tokenExpiry * 1000}</LocaleDate> : '-'}
              </div>
            </FormField>
            {data.hasToken &&
              (revealed ? (
                <>
                  <FormField title="bilibili_users.access_token">
                    <CopyToClipboard
                      displayType="block"
                      variant="border"
                      value={revealed.accessToken ?? '-'}
                    />
                  </FormField>
                  <FormField title="bilibili_users.refresh_token">
                    <CopyToClipboard
                      displayType="block"
                      variant="border"
                      value={revealed.refreshToken ?? '-'}
                    />
                  </FormField>
                </>
              ) : (
                <FormField title="bilibili_users.token_secret">
                  <div className={styles.revealRow}>
                    <span className={styles.maskedToken}>••••••••••••••••••••••••</span>
                    <Button
                      icon={<Eye />}
                      title="bilibili_users.show_token"
                      isLoading={isRevealing}
                      onClick={onReveal}
                    />
                  </div>
                </FormField>
              ))}
          </FormCard>
        </div>
      )}
    </DetailsPage>
  );
}

export default BilibiliUserDetails;
