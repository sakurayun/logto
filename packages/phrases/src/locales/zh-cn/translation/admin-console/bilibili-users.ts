const bilibili_users = {
  page_title: 'B站用户',
  title: 'B站用户',
  subtitle:
    '管理通过哔哩哔哩登录的用户。查看其 uid、openid、头像、scopes 与已存储的令牌，并可刷新或撤销令牌。',
  /** 表格列 */
  user: '用户',
  uid: 'UID',
  openid: 'OpenID',
  name: '昵称',
  face: '头像',
  scopes: '权限范围',
  token_status: '令牌状态',
  updated_at: '更新时间',
  token_statuses: {
    active: '有效',
    expired: '已过期',
    none: '无令牌',
  },
  search_placeholder: '按 openid、uid 或昵称搜索',
  placeholder_title: '暂无 B站用户',
  placeholder_description: '通过 B站连接器登录的用户会显示在此处，其资料与令牌会在每次登录时刷新。',
  go_to_connectors: '配置 B站连接器',
  /** Cookie 有效性检测 */
  check_cookie: '检测 Cookie',
  cookie_valid: 'B站 Cookie 有效（已登录：{{uname}}）',
  cookie_invalid: 'B站 Cookie 无效或已过期',
  cookie_not_configured: 'B站连接器尚未配置 Cookie',
  /** 详情页 */
  details_page_title: 'B站用户详情',
  identity_card_title: 'B站身份',
  token_card_title: '令牌',
  expires_at: '访问令牌过期时间',
  access_token: '访问令牌 (access_token)',
  refresh_token: '刷新令牌 (refresh_token)',
  token_secret: '令牌',
  show_token: '显示明文',
  /** 操作 */
  refresh_action: '刷新令牌',
  revoke_token: '撤销令牌',
  revoke: '撤销',
  delete_record: '删除记录',
  /** 确认与提示 */
  revoke_token_confirm:
    '确定要撤销该用户已存储的令牌吗？该用户需要重新通过 B站登录才能再次存储令牌。',
  delete_record_confirm: '确定要删除这条 B站记录（含已存储的令牌）吗？此操作无法撤销。',
  token_refreshed: '令牌刷新成功。',
  token_revoked: '令牌撤销成功。',
  record_deleted: '记录删除成功。',
};

export default Object.freeze(bilibili_users);
