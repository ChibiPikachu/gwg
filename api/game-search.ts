let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getIGDBToken(): Promise<string | null> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn('[game-search] IGDB_CLIENT_ID or IGDB_CLIENT_SECRET environment variables are not set.');
    return null;
  }

  if (cachedToken && Date.now() < cachedToken.expires_at) {
    return cachedToken.access_token;
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    });

    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[game-search] Twitch OAuth token error:', res.status, errText);
      return null;
    }

    const data = await res.json();
    if (!data.access_token) {
      console.error('[game-search] No access_token in Twitch response:', data);
      return null;
    }

    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in - 60) * 1000
    };

    return cachedToken.access_token;
  } catch (err) {
    console.error('[game-search] Token fetch exception:', err);
    return null;
  }
}

function formatIGDBGame(game: any) {
  let steamId = game.external_games?.find((eg: any) => eg.category === 1)?.uid;
  if (!steamId) {
    const steamWebsite = game.websites?.find(
      (w: any) => w.category === 13 || (w.url && w.url.includes('store.steampowered.com/app/'))
    );
    if (steamWebsite && steamWebsite.url) {
      const match = steamWebsite.url.match(/\/app\/(\d+)/);
      if (match) steamId = match[1];
    }
  }

  let coverUrl = 'https://via.placeholder.com/264x352?text=No+Cover';
  if (game.cover && game.cover.url) {
    coverUrl = `https:${game.cover.url.replace('t_thumb', 't_cover_big')}`;
  }

  return {
    id: String(game.id),
    title: game.name,
    game_name: game.name,
    image: coverUrl,
    game_image: coverUrl,
    summary: game.summary || '',
    steam_appid: steamId ? parseInt(steamId, 10) : null
  };
}

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query.query || req.query.q || req.query.search || req.query.game || '';
  const igdbId = req.query.igdbId || req.query.igdb_id || '';

  const queryStr = String(query).trim();
  const igdbIdStr = String(igdbId).trim();

  if (!queryStr && !igdbIdStr) {
    return res.status(200).json([]);
  }

  const clientId = process.env.IGDB_CLIENT_ID;
  const token = await getIGDBToken();

  if (!clientId || !token) {
    return res.status(500).json({
      error: 'IGDB credentials missing or invalid',
      details: 'Please ensure IGDB_CLIENT_ID and IGDB_CLIENT_SECRET environment variables are set in Vercel.'
    });
  }

  try {
    // 1. IGDB Direct ID Search
    if (igdbIdStr) {
      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        body: `where id = ${igdbIdStr}; fields name, cover.url, summary, category, external_games.category, external_games.uid, websites.url, websites.category;`
      });

      if (response.ok) {
        const data: any = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const results = data.map(formatIGDBGame);
          return res.status(200).json(results);
        }
      }
    }

    // 2. IGDB Text Search
    if (queryStr) {
      const safeQuery = queryStr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      // Primary search using IGDB search index
      let response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        body: `search "${safeQuery}"; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category; limit 25;`
      });

      let data: any = [];

      if (response.ok) {
        data = await response.json();
      } else if (response.status === 401) {
        cachedToken = null;
        return res.status(401).json({ error: 'IGDB Token expired or invalid' });
      }

      // Fallback query using name pattern matching if search returns no results
      if (!Array.isArray(data) || data.length === 0) {
        response = await fetch('https://api.igdb.com/v4/games', {
          method: 'POST',
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'text/plain'
          },
          body: `where name ~ *"${safeQuery}"*; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category; limit 25;`
        });

        if (response.ok) {
          data = await response.json();
        }
      }

      if (Array.isArray(data) && data.length > 0) {
        const results = data.map(formatIGDBGame);
        return res.status(200).json(results);
      }
    }

    return res.status(200).json([]);
  } catch (err: any) {
    console.error('[game-search] IGDB search error:', err);
    return res.status(500).json({ error: 'Failed to search IGDB database', details: String(err) });
  }
}
