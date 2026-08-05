import { createClient } from '@supabase/supabase-js';

const getSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

export default async function handler(req: any, res: any) {
  try {
    const query = req.query;

    // Verify OpenID parameters exist
    if (!query['openid.assoc_handle'] || !query['openid.signed'] || !query['openid.sig'] || !query['openid.claimed_id']) {
      return res.redirect('/?error=InvalidSteamOpenID');
    }

    // 1. Verify response with Steam OpenID provider
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

    // 2. Extract Steam ID 64
    const claimedId = String(query['openid.claimed_id']);
    const steamId = claimedId.split('/').pop();

    if (!steamId || !/^\d{17}$/.test(steamId)) {
      return res.redirect('/?error=InvalidSteamId');
    }

    // 3. Fetch Steam Profile Summary
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

    // 4. Sync profile with Supabase if available
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
          steam_name: steamName,
          steam_avatar: steamAvatar,
          team: 'none',
          role: 'member',
          status: 'Ready for Event',
          points: 0,
          created_at: new Date().toISOString()
        });
      } else {
        await supabase.from('profiles').update({
          steam_name: steamName,
          steam_avatar: steamAvatar,
          updated_at: new Date().toISOString()
        }).eq('steamid', steamId);
      }
    }

    // 5. Set session cookie and redirect to home
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
