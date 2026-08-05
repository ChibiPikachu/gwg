let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getIGDBToken(): Promise<string | null> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn('[game-search] IGDB credentials missing');
    return null;
  }

  if (cachedToken && Date.now() < cachedToken.expires_at) {
    return cachedToken.access_token;
  }

  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: 'POST' }
    );

    if (!res.ok) {
      console.error('[game-search] Failed to get IGDB token:', res.status);
      return null;
    }

    const data = await res.json();
    if (!data.access_token) return null;

    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in - 60) * 1000
    };

    return cachedToken.access_token;
  } catch (err) {
    console.error('[game-search] Token fetch error:', err);
    return null;
  }
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

  const queryParam = req.query.query || req.query.q || req.query.search || req.query.game || '';
  const queryStr = String(queryParam).trim();

  if (!queryStr) {
    return res.status(200).json([]);
  }

  try {
    const token = await getIGDBToken();

    if (!token) {
      return res.status(200).json([
        {
          id: `custom_${Date.now()}`,
          title: queryStr,
          game_name: queryStr,
          image: 'https://via.placeholder.com/264x352?text=Custom+Game',
          game_image: 'https://via.placeholder.com/264x352?text=Custom+Game',
          summary: 'Custom game entry',
          steam_appid: null
        }
      ]);
    }

    const clientId = process.env.IGDB_CLIENT_ID!;
    const safeQuery = queryStr.replace(/"/g, '\\"');

    const response = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: `search "${safeQuery}"; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category; limit 25;`
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[game-search] IGDB API response error:', response.status, errText);
      if (response.status === 401) cachedToken = null;

      return res.status(200).json([
        {
          id: `custom_${Date.now()}`,
          title: queryStr,
          game_name: queryStr,
          image: 'https://via.placeholder.com/264x352?text=Custom+Game',
          game_image: 'https://via.placeholder.com/264x352?text=Custom+Game',
          summary: 'Custom game entry',
          steam_appid: null
        }
      ]);
    }

    const data: any = await response.json();

    if (!Array.isArray(data)) {
      return res.status(200).json([]);
    }

    const filteredData = data.filter((game: any) => {
      if (data.length > 1 && game.category === 1) return false;
      return true;
    });

    const results = filteredData.map((game: any) => {
      let steamId = game.external_games?.find((eg: any) => eg.category === 1)?.uid;
      if (!steamId) {
        const steamWebsite = game.websites?.find(
          (w: any) => w.category === 13 || w.url?.includes('store.steampowered.com/app/')
        );
        if (steamWebsite) {
          const match = steamWebsite.url.match(/\/app\/(\d+)/);
          if (match) steamId = match[1];
        }
      }

      const coverUrl = game.cover?.url
        ? `https:${game.cover.url.replace('t_thumb', 't_cover_big')}`
        : 'https://via.placeholder.com/264x352?text=No+Cover';

      return {
        id: String(game.id),
        title: game.name,
        game_name: game.name,
        image: coverUrl,
        game_image: coverUrl,
        summary: game.summary || '',
        steam_appid: steamId || null
      };
    });

    return res.status(200).json(results);
  } catch (err: any) {
    console.error('[game-search] Error handling query:', err);
    return res.status(200).json([
      {
        id: `custom_${Date.now()}`,
        title: queryStr,
        game_name: queryStr,
        image: 'https://via.placeholder.com/264x352?text=Custom+Game',
        game_image: 'https://via.placeholder.com/264x352?text=Custom+Game',
        summary: 'Custom game entry',
        steam_appid: null
      }
    ]);
  }
}
