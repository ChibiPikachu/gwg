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

async function fetchSteamAppDetails(appIdStr: string) {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appIdStr}`);
    if (res.ok) {
      const data: any = await res.json();
      if (data && data[appIdStr] && data[appIdStr].success && data[appIdStr].data) {
        const game = data[appIdStr].data;
        const img = game.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;
        return {
          id: appIdStr,
          title: game.name,
          game_name: game.name,
          image: img,
          game_image: img,
          summary: game.short_description || '',
          steam_appid: parseInt(appIdStr, 10)
        };
      }
    }

    const apiKey = process.env.STEAM_API_KEY;
    if (apiKey) {
      const schemaRes = await fetch(
        `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appIdStr}`
      );
      if (schemaRes.ok) {
        const schemaData: any = await schemaRes.json();
        if (schemaData?.game?.gameName) {
          const img = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;
          return {
            id: appIdStr,
            title: schemaData.game.gameName,
            game_name: schemaData.game.gameName,
            image: img,
            game_image: img,
            summary: 'Steam Game',
            steam_appid: parseInt(appIdStr, 10)
          };
        }
      }
    }

    const cdnImg = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;
    return {
      id: appIdStr,
      title: `Steam App ${appIdStr}`,
      game_name: `Steam App ${appIdStr}`,
      image: cdnImg,
      game_image: cdnImg,
      summary: 'Steam Game',
      steam_appid: parseInt(appIdStr, 10)
    };
  } catch (err) {
    console.error('[game-search] Steam AppDetails fetch error:', err);
    return null;
  }
}

async function searchSteamStore(queryStr: string): Promise<any[]> {
  try {
    const cleanedTerm = queryStr.replace(/[:\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanedTerm)}&l=english&cc=US`
    );
    if (!res.ok) return [];

    const data: any = await res.json();
    if (data && Array.isArray(data.items)) {
      return data.items.map((item: any) => {
        let img = item.tiny_image
          ? item.tiny_image.replace('capsule_sm_120.jpg', 'header.jpg')
          : `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg`;
        return {
          id: String(item.id),
          title: item.name,
          game_name: item.name,
          image: img,
          game_image: img,
          summary: '',
          steam_appid: item.id
        };
      });
    }
    return [];
  } catch (err) {
    console.error('[game-search] Steam Store search error:', err);
    return [];
  }
}

async function queryIGDB(clientId: string, token: string, bodyQuery: string): Promise<any[]> {
  try {
    const response = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: bodyQuery
    });

    if (response.ok) {
      const data: any = await response.json();
      if (Array.isArray(data)) return data;
    } else if (response.status === 401) {
      cachedToken = null;
    }
  } catch (err) {
    console.warn('[game-search] IGDB query error:', err);
  }
  return [];
}

export default async function handler(req: any, res: any) {
  // Set CORS headers required for Vercel Serverless Function
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
  const steamAppId = req.query.steamAppId || req.query.steam_appid || req.query.steamAppID || '';

  const queryStr = String(query).trim();
  const igdbIdStr = String(igdbId).trim();
  const steamAppIdStr = String(steamAppId).trim();

  if (!queryStr && !igdbIdStr && !steamAppIdStr) {
    return res.status(200).json([]);
  }

  try {
    // 1. Explicit Steam App ID Direct Lookup
    if (steamAppIdStr) {
      const steamGame = await fetchSteamAppDetails(steamAppIdStr);
      if (steamGame) {
        return res.status(200).json([steamGame]);
      }
    }

    const clientId = process.env.IGDB_CLIENT_ID;
    const token = await getIGDBToken();

    // 2. Explicit IGDB ID Lookup
    if (igdbIdStr) {
      if (clientId && token) {
        const data = await queryIGDB(
          clientId,
          token,
          `where id = ${igdbIdStr}; fields name, cover.url, summary, category, external_games.category, external_games.uid, websites.url, websites.category;`
        );
        if (data.length > 0) {
          return res.status(200).json(data.map(formatIGDBGame));
        }
      }
    }

    // 3. Text Query Search (IGDB + Steam Fallback & Merging)
    if (queryStr) {
      // Check if query is purely numeric (likely a Steam App ID)
      const isNumericAppId = /^\d+$/.test(queryStr) && queryStr.length < 10;
      if (isNumericAppId) {
        const steamGame = await fetchSteamAppDetails(queryStr);
        if (steamGame) {
          return res.status(200).json([steamGame]);
        }
      }

      let results: any[] = [];

      // Primary IGDB Search if configured
      if (clientId && token) {
        const safeQuery = queryStr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        let data = await queryIGDB(
          clientId,
          token,
          `search "${safeQuery}"; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category; limit 25;`
        );

        // Retry without special punctuation if direct search returned empty
        if (data.length === 0 && /[:\-_]/.test(queryStr)) {
          const cleanQuery = queryStr.replace(/[:\-_]/g, ' ').replace(/\s+/g, ' ').trim();
          const safeClean = cleanQuery.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          data = await queryIGDB(
            clientId,
            token,
            `search "${safeClean}"; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category; limit 25;`
          );
        }

        // Retry pattern match if search index returned empty
        if (data.length === 0) {
          const cleanQuery = queryStr.replace(/[:\-_]/g, ' ').replace(/\s+/g, ' ').trim();
          const safeClean = cleanQuery.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          data = await queryIGDB(
            clientId,
            token,
            `where name ~ *"${safeClean}"*; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category; limit 25;`
          );
        }

        if (data.length > 0) {
          results = data.map(formatIGDBGame);
        }
      }

      // Query Steam Store Search API as secondary source or fallback
      const steamResults = await searchSteamStore(queryStr);

      if (results.length === 0) {
        results = steamResults;
      } else if (steamResults.length > 0) {
        // Merge Steam results if not already present in IGDB results
        for (const sGame of steamResults) {
          const exists = results.some(
            (r) =>
              r.title.toLowerCase().trim() === sGame.title.toLowerCase().trim() ||
              (r.steam_appid && r.steam_appid === sGame.steam_appid)
          );
          if (!exists) {
            results.push(sGame);
          }
        }
      }

      // Fallback custom choice if no results matched
      if (results.length === 0 && queryStr.length > 0) {
        results.push({
          id: `custom_${Date.now()}`,
          title: queryStr,
          game_name: queryStr,
          image: 'https://via.placeholder.com/264x352?text=Custom+Game',
          game_image: 'https://via.placeholder.com/264x352?text=Custom+Game',
          summary: 'Use custom game title',
          steam_appid: null,
          isCustom: true
        });
      }

      return res.status(200).json(results);
    }

    return res.status(200).json([]);
  } catch (err: any) {
    console.error('[game-search] Search handler error:', err);
    return res.status(500).json({ error: 'Failed to search game database', details: String(err) });
  }
}
