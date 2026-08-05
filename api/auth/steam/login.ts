export default function handler(req: any, res: any) {
  try {
    const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
    const baseUrl = (process.env.APP_URL || `${protocol}://${host}`).replace(/\/$/, '');
    
    const returnTo = `${baseUrl}/api/auth/steam/callback`;

    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': baseUrl,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
    });

    const steamLoginUrl = `https://steamcommunity.com/openid/login?${params.toString()}`;

    // Return JSON if requested, otherwise 302 redirect
    if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({ url: steamLoginUrl });
    }

    return res.redirect(302, steamLoginUrl);
  } catch (error: any) {
    console.error('Steam Auth Login Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate Steam login URL' });
  }
}
