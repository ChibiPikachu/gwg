import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const steamId = req.query.steam_id;

    if (!steamId) {
      return res.status(200).json(null);
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("steam_id", steamId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data || null);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}