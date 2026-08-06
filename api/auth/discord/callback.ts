import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string;
  const steamid = req.query.state as string; // Pass user steamid via OAuth state parameter

  if (!code) {
    return res.status(400).json({ error: 'Missing OAuth code' });
  }

  try {
    // 1. Exchange code for access token
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

    // 2. Fetch Discord user details
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` },
    });
    const discordUser = await userResponse.json();

    // 3. Update Supabase profile if steamid provided
    if (steamid) {
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null;

      await supabase
        .from('profiles')
        .update({
          discord_id: discordUser.id,
          discord_name: `${discordUser.username}#${discordUser.discriminator}`,
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