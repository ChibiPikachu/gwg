import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(url, key);

    // Steam returns the SteamID in the openid response
    const steamId = req.query['openid.claimed_id']
      ?.toString()
      .split('/')
      .pop();

    if (!steamId) {
      return res.status(400).send('No Steam ID found');
    }

    // Fetch Steam profile
    const apiKey = process.env.STEAM_API_KEY;

    const steamRes = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`
    );

    const steamData = await steamRes.json();
    const player = steamData?.response?.players?.[0];

    if (!player) {
      return res.status(400).send('Steam profile not found');
    }

    // Save / update user in Supabase
    await supabase.from('profiles').upsert({
      steam_id: steamId,
      steam_name: player.personaname,
      steam_avatar: player.avatarfull,
      last_login: new Date().toISOString()
    });

    // Simple success page
    return res.send(`
      <html>
        <body>
          <h2>Login successful 🎉</h2>
          <p>Welcome ${player.personaname}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'STEAM_LOGIN_SUCCESS',
                user: ${JSON.stringify(player)}
              }, '*');
              window.close();
            }
          </script>
        </body>
      </html>
    `);

  } catch (err) {
    return res.status(500).send(err.message);
  }
}