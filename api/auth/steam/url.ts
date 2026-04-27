export default function handler(req, res) {
  try {
    const host = req.headers.host;
    const appUrl = `https://${host}`;

    const returnTo = `${appUrl}/api/auth/steam/callback`;

    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': appUrl,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
    });

    return res.status(200).json({
      url: `https://steamcommunity.com/openid/login?${params.toString()}`
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}