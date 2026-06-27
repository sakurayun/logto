import { type RouteObject } from 'react-router-dom';
import { safeLazy } from 'react-safe-lazy';

const BilibiliUsers = safeLazy(async () => import('@/pages/BilibiliUsers'));
const BilibiliUserDetails = safeLazy(
  async () => import('@/pages/BilibiliUsers/BilibiliUserDetails')
);

export const bilibiliUsers: RouteObject = {
  path: 'bilibili-users',
  children: [
    { index: true, element: <BilibiliUsers /> },
    { path: ':userId', element: <BilibiliUserDetails /> },
  ],
};
