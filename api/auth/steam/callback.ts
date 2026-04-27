export default async function handler(req, res) {
  try {
    const steamId = req.query["openid.claimed_id"]
      ?.toString()
      .split("/")
      .pop();

    if (!steamId) {
      return res.status(400).send("No Steam ID found");
    }

    const apiKey = process.env.STEAM_API_KEY;

    const response = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`
    );

    const data = await response.json();
    const player = data?.response?.players?.[0];

    return res.status(200).send(`
      <h2>Step 2 OK 🎉</h2>
      <p>Steam ID: ${steamId}</p>
      <p>Name: ${player?.personaname}</p>
      <img src="${player?.avatarfull}" />
    `);

  } catch (err) {
    return res.status(500).send(err.message);
  }
}