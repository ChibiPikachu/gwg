import type { VercelRequest, VercelResponse } from '@vercel/node';

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const host = req.headers.host || 'localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const returnUrl = `${protocol}://${host}/api/auth/steam-callback`;

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl,
    'openid.realm': `${protocol}://${host}`,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  return res.redirect(`${STEAM_OPENID_URL}?${params.toString()}`);
}