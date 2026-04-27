import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const steamId = req.query["openid.claimed_id"]
      ?.toString()
      .split("/")
      .pop();

    const apiKey = process.env.STEAM_API_KEY;

    const response = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`
    );

    const data = await response.json();
    const player = data?.response?.players?.[0];

    // 👉 SUPABASE PART
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(url, key);
console.log("UPSERT DATA:", {
  steam_id: steamId,
  steam_name: player.personaname
});
    await supabase.from("profiles").upsert({
      steam_id: steamId,
      steam_name: player.personaname,
      steam_avatar: player.avatarfull,
      last_login: new Date().toISOString()
    });

    return res.status(200).send(`
      <h2>Login Complete 🎉</h2>
      <p>${player.personaname}</p>
      <img src="${player.avatarfull}" />
    `);

  } catch (err) {
    return res.status(500).send(err.message);
  }
}