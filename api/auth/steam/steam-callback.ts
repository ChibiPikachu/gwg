import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query = req.query;
  const claimedId = query['openid.claimed_id'] as string;

  if (!claimedId) {
    return res.status(400).send('Steam auth failed: Missing claimed_id');
  }

  // Extract 64-bit Steam ID from claimed_id URL
  const steamId = claimedId.split('/id/')[1] || claimedId.split('/')[5];

  // Fetch Steam Profile Data
  const apiKey = process.env.STEAM_API_KEY;
  const profileRes = await fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`
  );
  const profileData = await profileRes.json();
  const player = profileData.response.players[0];

  // Upsert user into Supabase Postgres DB
  const { error } = await supabase.from('users').upsert({
    steamid: steamId,
    steam_name: player?.personaname || 'Steam User',
    steam_avatar: player?.avatarfull || '',
    updated_at: new Date().toISOString(),
  });

  if (error) return res.status(500).json({ error: error.message });

  // Redirect back to frontend with token or steamId state
  return res.redirect(`/?steam_login_success=true&steamid=${steamId}`);
}