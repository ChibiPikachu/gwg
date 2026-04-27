import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // You need a way to identify user:
    // simplest: pass steam_id via cookie OR query temporarily

    const steamId = req.query.steam_id;

    if (!steamId) {
      return res.json(null);
    }

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("steam_id", steamId)
      .single();

    return res.json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}