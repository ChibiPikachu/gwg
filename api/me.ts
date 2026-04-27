import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const steamId = req.query.steam_id;

    if (!steamId) {
      return res.status(400).json({ error: "Missing steam_id" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("steam_id", steamId)
      .single();

    if (error) {
      return res.status(500).json({ error });
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}