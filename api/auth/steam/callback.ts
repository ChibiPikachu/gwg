import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    console.log("🔥 Callback hit");

    // -----------------------------
    // 1. Extract Steam ID
    // -----------------------------
    const steamId = req.query["openid.claimed_id"]
      ?.toString()
      .split("/")
      .pop();

    if (!steamId) {
      console.log("❌ No Steam ID found");
      return res.status(400).send("No Steam ID found");
    }

    console.log("✅ Steam ID:", steamId);

    // -----------------------------
    // 2. Fetch Steam profile
    // -----------------------------
    const apiKey = process.env.STEAM_API_KEY;

    if (!apiKey) {
      console.log("❌ Missing STEAM_API_KEY");
      return res.status(500).send("Missing Steam API key");
    }

    const steamRes = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`
    );

    const steamText = await steamRes.text();
    const steamData = JSON.parse(steamText);

    const player = steamData?.response?.players?.[0];

    if (!player) {
      console.log("❌ No Steam player found");
      return res.status(400).send("Steam profile not found");
    }

    console.log("✅ Steam player:", player.personaname);

    // -----------------------------
    // 3. Init Supabase
    // -----------------------------
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      console.log("❌ Missing Supabase env vars");
      return res.status(500).send("Missing Supabase config");
    }

    const supabase = createClient(url, key);

    console.log("✅ Supabase client ready");

    // -----------------------------
    // 4. Save user
    // -----------------------------
    const { data, error } = await supabase.from("profiles").upsert(
      {
        steam_id: steamId,
        steam_name: player.personaname,
        steam_avatar: player.avatarfull,
        last_login: new Date().toISOString(),
      },
      {
        onConflict: "steam_id",
      }
    );

    if (error) {
      console.log("❌ Supabase error:", error);
      return res.status(500).send("Supabase insert failed");
    }

    console.log("✅ Supabase saved:", data);

    // -----------------------------
    // 5. Success response
    // -----------------------------
    return res.send(`
      <html>
        <body>
          <h2>Login successful 🎉</h2>
          <p>Welcome ${player.personaname}</p>
          <img src="${player.avatarfull}" />
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: "STEAM_LOGIN_SUCCESS",
                user: ${JSON.stringify(player)}
              }, "*");
              window.close();
            }
          </script>
        </body>
      </html>
    `);

  } catch (err) {
    console.error("🔥 Fatal error:", err);
    return res.status(500).send(err.message);
  }
}