import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const getSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

// --- DISCORD OAUTH HANDLER ---
async function handleDiscordAuth(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string;
  const steamid = req.query.state as string;

  if (!code) {
    return res.status(400).json({ error: 'Missing OAuth code' });
  }

  const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
  const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/discord';

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(tokenData.error_description || 'Failed token exchange');

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` },
    });
    const discordUser = await userResponse.json();

    const supabase = getSupabaseAdmin();
    if (steamid && supabase) {
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null;

      await supabase
        .from('profiles')
        .update({
          discord_id: discordUser.id,
          discord_name: `${discordUser.username}${discordUser.discriminator && discordUser.discriminator !== '0' ? '#' + discordUser.discriminator : ''}`,
          discord_avatar: avatarUrl,
        })
        .eq('steamid', steamid);
    }

    return res.redirect('/?discord_connected=true');
  } catch (err: any) {
    console.error('Discord Auth Error:', err);
    return res.redirect('/?discord_error=' + encodeURIComponent(err.message));
  }
}

// --- STEAM OPENID HANDLERS ---
async function handleSteamLogin(req: VercelRequest, res: VercelResponse) {
  try {
    const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
    const baseUrl = (process.env.APP_URL || `${protocol}://${host}`).replace(/\/$/, '');
    
    const returnTo = `${baseUrl}/api/auth/steam?action=callback`;

    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': baseUrl,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
    });

    const steamLoginUrl = `https://steamcommunity.com/openid/login?${params.toString()}`;

    if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({ url: steamLoginUrl });
    }

    return res.redirect(302, steamLoginUrl);
  } catch (error: any) {
    console.error('Steam Auth Login Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate Steam login URL' });
  }
}

async function handleSteamCallback(req: VercelRequest, res: VercelResponse) {
  try {
    const query = req.query;

    if (!query['openid.assoc_handle'] || !query['openid.signed'] || !query['openid.sig'] || !query['openid.claimed_id']) {
      return res.redirect('/?error=InvalidSteamOpenID');
    }

    const validationParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') {
        validationParams.append(key, value);
      }
    }
    validationParams.set('openid.mode', 'check_authentication');

    const verifyRes = await fetch('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: validationParams.toString()
    });

    const verifyText = await verifyRes.text();
    const isValid = verifyText.includes('is_valid:true');

    if (!isValid) {
      console.error('Steam OpenID verification failed:', verifyText);
      return res.redirect('/?error=SteamVerificationFailed');
    }

    const claimedId = String(query['openid.claimed_id']);
    const steamId = claimedId.split('/').pop();

    if (!steamId || !/^\d{17}$/.test(steamId)) {
      return res.redirect('/?error=InvalidSteamId');
    }

    const apiKey = process.env.STEAM_API_KEY;
    let steamName = 'Steam Gamer';
    let steamAvatar = 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';

    if (apiKey) {
      try {
        const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`);
        const steamData: any = await steamRes.json();
        const player = steamData.response?.players?.[0];
        if (player) {
          steamName = player.personaname || steamName;
          steamAvatar = player.avatarfull || player.avatarmedium || player.avatar || steamAvatar;
        }
      } catch (err) {
        console.warn('Failed to fetch Steam profile summary:', err);
      }
    }

    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('steamid', steamId)
        .maybeSingle();

      if (!existingProfile) {
        await supabase.from('profiles').insert({
          steamid: steamId,
          steam_name: steamName !== 'Steam Gamer' ? steamName : `Steam Gamer (${steamId.slice(-4)})`,
          steam_avatar: steamAvatar,
          team: 'none',
          role: 'admin',
          status: 'Ready for Event',
          points: 0,
          created_at: new Date().toISOString()
        });
      } else {
        const updateData: any = { updated_at: new Date().toISOString() };
        if (steamName !== 'Steam Gamer') {
          updateData.steam_name = steamName;
        }
        if (steamAvatar && (!existingProfile.steam_avatar || existingProfile.steam_avatar.includes('fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb'))) {
          updateData.steam_avatar = steamAvatar;
        }
        await supabase.from('profiles').update(updateData).eq('steamid', steamId);
      }
    }

    res.setHeader('Set-Cookie', [
      `steam_id=${steamId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
      `steam_name=${encodeURIComponent(steamName)}; Path=/; SameSite=Lax; Max-Age=2592000`
    ]);

    return res.redirect(302, `/?steamid=${steamId}&authenticated=true`);
  } catch (error: any) {
    console.error('Steam Auth Callback Exception:', error);
    return res.redirect('/?error=SteamAuthError');
  }
}

async function handleSteamUrl(req: VercelRequest, res: VercelResponse) {
  try {
    const host = req.headers.host;
    const appUrl = `https://${host}`;
    const returnTo = `${appUrl}/api/auth/steam?action=callback`;

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
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// --- MAIN CONTROLLER ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const provider = (req.query.provider as string || '').toLowerCase();
  const action = (req.query.action as string || '').toLowerCase();

  if (provider === 'discord') {
    return handleDiscordAuth(req, res);
  }

  if (provider === 'steam') {
    if (action === 'url') return handleSteamUrl(req, res);
    if (action === 'callback' || req.query['openid.mode']) return handleSteamCallback(req, res);
    return handleSteamLogin(req, res);
  }

  return res.status(404).json({ error: `Auth provider '${provider}' not found` });
}
