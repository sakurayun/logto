const bilibili_users = {
  page_title: 'Bilibili users',
  title: 'Bilibili users',
  subtitle:
    'Manage users who signed in with Bilibili. View their uid, openid, avatar, scopes and stored tokens, and refresh or revoke tokens.',
  /** Table columns */
  user: 'User',
  uid: 'UID',
  openid: 'OpenID',
  name: 'Nickname',
  face: 'Avatar',
  scopes: 'Scopes',
  token_status: 'Token status',
  updated_at: 'Updated',
  token_statuses: {
    active: 'Active',
    expired: 'Expired',
    none: 'No token',
  },
  search_placeholder: 'Search by openid, uid or nickname',
  placeholder_title: 'No Bilibili users yet',
  placeholder_description:
    'Users who sign in with the Bilibili connector will appear here, with their profile and tokens refreshed on every login.',
  go_to_connectors: 'Configure Bilibili connector',
  /** Details page */
  details_page_title: 'Bilibili user details',
  identity_card_title: 'Bilibili identity',
  token_card_title: 'Tokens',
  expires_at: 'Access token expires at',
  access_token: 'Access token',
  refresh_token: 'Refresh token',
  token_secret: 'Token',
  show_token: 'Show plaintext',
  /** Actions */
  refresh_action: 'Refresh token',
  revoke_token: 'Revoke token',
  revoke: 'Revoke',
  delete_record: 'Delete record',
  /** Confirmations & toasts */
  revoke_token_confirm:
    'Are you sure you want to revoke the stored token for this user? The user will need to sign in with Bilibili again to store a new token.',
  delete_record_confirm:
    'Are you sure you want to delete this Bilibili record, including the stored tokens? This action cannot be undone.',
  token_refreshed: 'Token refreshed successfully.',
  token_revoked: 'Token revoked successfully.',
  record_deleted: 'Record deleted successfully.',
};

export default Object.freeze(bilibili_users);
