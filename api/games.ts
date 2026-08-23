import { createClient } from '@supabase/supabase-js';

let cachedToken: { access_token: string; expires_at: number } | null = null;

let supabaseClient: any = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      supabaseClient = createClient(url, key);
    } catch (e) {
      console.warn('[game-search] Supabase init warning:', e);
    }
  }
  return supabaseClient;
}

async function getIGDBToken(): Promise<string | null> {
  const clientId = process.env.IGDB_CLIENT_ID || process.env.TWITCH_CLIENT_ID || process.env.TWITCH_APP_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || process.env.TWITCH_APP_SECRET;

  if (!clientId || !clientSecret) {
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
  let steamId = game.external_games?.find((eg: any) => eg.category === 1 || eg.category === '1')?.uid;
  if (!steamId && Array.isArray(game.websites)) {
    const steamWebsite = game.websites.find(
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
  } else if (steamId) {
    coverUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamId}/header.jpg`;
  }

  const parsedSteamAppId = steamId ? parseInt(steamId, 10) : null;

  return {
    id: String(game.id),
    title: game.name,
    name: game.name,
    game_name: game.name,
    image: coverUrl,
    game_image: coverUrl,
    cover: { url: coverUrl },
    summary: game.summary || '',
    steam_appid: parsedSteamAppId,
    steamAppId: parsedSteamAppId
  };
}

async function fetchSteamAppDetails(appIdStr: string) {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appIdStr}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (res.ok) {
      const data: any = await res.json();
      if (data && data[appIdStr] && data[appIdStr].success && data[appIdStr].data) {
        const game = data[appIdStr].data;
        const img = game.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;
        const appIdNum = parseInt(appIdStr, 10);
        return {
          id: appIdStr,
          title: game.name,
          name: game.name,
          game_name: game.name,
          image: img,
          game_image: img,
          cover: { url: img },
          summary: game.short_description || game.about_the_game || '',
          steam_appid: appIdNum,
          steamAppId: appIdNum
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
          const appIdNum = parseInt(appIdStr, 10);
          return {
            id: appIdStr,
            title: schemaData.game.gameName,
            name: schemaData.game.gameName,
            game_name: schemaData.game.gameName,
            image: img,
            game_image: img,
            cover: { url: img },
            summary: 'Steam Game',
            steam_appid: appIdNum,
            steamAppId: appIdNum
          };
        }
      }
    }

    // Fallback: If valid numeric ID, construct valid Steam CDN entry
    const cdnImg = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdStr}/header.jpg`;
    const appIdNum = parseInt(appIdStr, 10);
    return {
      id: appIdStr,
      title: `Steam App ${appIdStr}`,
      name: `Steam App ${appIdStr}`,
      game_name: `Steam App ${appIdStr}`,
      image: cdnImg,
      game_image: cdnImg,
      cover: { url: cdnImg },
      summary: 'Steam Game',
      steam_appid: appIdNum,
      steamAppId: appIdNum
    };
  } catch (err) {
    console.error('[game-search] Steam AppDetails fetch error:', err);
    return null;
  }
}

async function searchSteamStore(queryStr: string): Promise<any[]> {
  try {
    const cleanedTerm = queryStr.replace(/[:\-_'"]/g, ' ').replace(/\s+/g, ' ').trim();
    const results: any[] = [];
    const seenIds = new Set<string>();

    // 1. Primary Steam Store Search
    try {
      const res = await fetch(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanedTerm)}&l=english&cc=US`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }
      );
      if (res.ok) {
        const data: any = await res.json();
        if (data && Array.isArray(data.items)) {
          data.items.forEach((item: any) => {
            const sid = String(item.id);
            seenIds.add(sid);
            const img = item.tiny_image
              ? item.tiny_image.replace('capsule_sm_120.jpg', 'header.jpg')
              : `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg`;
            results.push({
              id: sid,
              title: item.name,
              name: item.name,
              game_name: item.name,
              image: img,
              game_image: img,
              cover: { url: img },
              summary: '',
              steam_appid: Number(item.id),
              steamAppId: Number(item.id)
            });
          });
        }
      }
    } catch (e) {
      console.warn('[game-search] Steam storesearch error:', e);
    }

    // 2. Secondary Steam Community Search (finds older/niche titles quickly)
    if (results.length < 5) {
      try {
        const commRes = await fetch(
          `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(cleanedTerm)}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          }
        );
        if (commRes.ok) {
          const commData: any = await commRes.json();
          if (Array.isArray(commData)) {
            commData.forEach((item: any) => {
              const sid = String(item.appid);
              if (!seenIds.has(sid)) {
                seenIds.add(sid);
                const img = item.logo || `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.appid}/header.jpg`;
                results.push({
                  id: sid,
                  title: item.name,
                  name: item.name,
                  game_name: item.name,
                  image: img,
                  game_image: img,
                  cover: { url: img },
                  summary: '',
                  steam_appid: Number(item.appid),
                  steamAppId: Number(item.appid)
                });
              }
            });
          }
        }
      } catch (e) {
        // ignore community fallback error
      }
    }

    return results;
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
    } else {
      const errText = await response.text();
      console.warn('[game-search] IGDB query non-ok response:', response.status, errText);
    }
  } catch (err) {
    console.warn('[game-search] IGDB query error:', err);
  }
  return [];
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

  const query = req.query.query || req.query.q || req.query.search || req.query.game || req.body?.query || req.body?.q || '';
  const igdbId = req.query.igdbId || req.query.igdb_id || req.body?.igdbId || req.body?.igdb_id || '';
  const steamAppId = req.query.steamAppId || req.query.steam_appid || req.query.steamAppID || req.body?.steamAppId || req.body?.steam_appid || '';

  let queryStr = String(query).trim();
  let igdbIdStr = String(igdbId).trim();
  let steamAppIdStr = String(steamAppId).trim();

  // If query contains a Steam store link, extract the App ID
  if (queryStr.includes('store.steampowered.com/app/')) {
    const urlMatch = queryStr.match(/\/app\/(\d+)/);
    if (urlMatch && urlMatch[1]) {
      steamAppIdStr = urlMatch[1];
    }
  }

  if (!queryStr && !igdbIdStr && !steamAppIdStr) {
    return res.status(200).json([]);
  }

  try {
    const clientId = process.env.IGDB_CLIENT_ID || process.env.TWITCH_CLIENT_ID || process.env.TWITCH_APP_ID;
    const token = await getIGDBToken();

    // 1. Explicit Steam App ID Direct Lookup
    if (steamAppIdStr && /^\d+$/.test(steamAppIdStr)) {
      const steamGame = await fetchSteamAppDetails(steamAppIdStr);
      if (steamGame) {
        // Also check if IGDB has richer cover art/metadata for this Steam App ID
        if (clientId && token) {
          try {
            const igdbGames = await queryIGDB(
              clientId,
              token,
              `where external_games.uid = "${steamAppIdStr}" | external_games.category = 1; fields name, cover.url, summary, category, external_games.category, external_games.uid, websites.url, websites.category; limit 1;`
            );
            if (igdbGames.length > 0) {
              const formatted = formatIGDBGame(igdbGames[0]);
              formatted.steam_appid = parseInt(steamAppIdStr, 10);
              formatted.steamAppId = parseInt(steamAppIdStr, 10);
              return res.status(200).json([formatted]);
            }
          } catch (e) {
            // fallback to steamGame
          }
        }
        return res.status(200).json([steamGame]);
      }
    }

    // 2. Explicit IGDB ID Lookup
    if (igdbIdStr && /^\d+$/.test(igdbIdStr)) {
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

    // 3. Numeric Query (User typed an ID directly into the search bar, e.g. "241260" or "5541")
    if (/^\d+$/.test(queryStr) && queryStr.length <= 10) {
      const combinedResults: any[] = [];
      const seenTitles = new Set<string>();

      // Try Steam App Details
      const steamGame = await fetchSteamAppDetails(queryStr);
      if (steamGame && !steamGame.title.startsWith('Steam App ')) {
        combinedResults.push(steamGame);
        seenTitles.add(steamGame.title.toLowerCase());
      }

      // Try IGDB by ID & external_games
      if (clientId && token) {
        const igdbData = await queryIGDB(
          clientId,
          token,
          `where id = ${queryStr} | external_games.uid = "${queryStr}"; fields name, cover.url, summary, category, external_games.category, external_games.uid, websites.url, websites.category; limit 5;`
        );
        if (igdbData.length > 0) {
          igdbData.forEach(g => {
            const formatted = formatIGDBGame(g);
            if (!seenTitles.has(formatted.title.toLowerCase())) {
              seenTitles.add(formatted.title.toLowerCase());
              combinedResults.push(formatted);
            }
          });
        }
      }

      // Check local database for matching steam_appid
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data: dbMatches } = await supabase
            .from('games')
            .select('*')
            .eq('steam_appid', parseInt(queryStr, 10))
            .limit(5);

          if (dbMatches && dbMatches.length > 0) {
            dbMatches.forEach((g: any) => {
              if (!seenTitles.has(g.title.toLowerCase())) {
                seenTitles.add(g.title.toLowerCase());
                combinedResults.push({
                  id: g.id,
                  title: g.title,
                  name: g.title,
                  game_name: g.title,
                  image: g.image_url,
                  game_image: g.image_url,
                  cover: { url: g.image_url },
                  steam_appid: g.steam_appid,
                  steamAppId: g.steam_appid,
                  summary: ''
                });
              }
            });
          }
        } catch (e) {}
      }

      if (combinedResults.length > 0) {
        return res.status(200).json(combinedResults);
      }
    }

    // 4. Text Query Search (Multi-source Search: IGDB + Steam Store + Local Supabase)
    if (queryStr) {
      let results: any[] = [];
      const seenKeys = new Set<string>();

      const addResult = (game: any) => {
        if (!game || !game.title) return;
        const normTitle = game.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const steamKey = game.steam_appid ? `steam_${game.steam_appid}` : null;
        const igdbKey = game.id && !String(game.id).startsWith('custom_') ? `id_${game.id}` : null;

        if (seenKeys.has(normTitle) || (steamKey && seenKeys.has(steamKey)) || (igdbKey && seenKeys.has(igdbKey))) {
          return;
        }

        seenKeys.add(normTitle);
        if (steamKey) seenKeys.add(steamKey);
        if (igdbKey) seenKeys.add(igdbKey);
        results.push(game);
      };

      // A. Search IGDB with multi-stage matching
      if (clientId && token) {
        const safeQuery = queryStr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const cleanQuery = queryStr.replace(/[:\-_'"]/g, ' ').replace(/\s+/g, ' ').trim();
        const safeClean = cleanQuery.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        // Attempt 1: Direct text search in IGDB
        let data = await queryIGDB(
          clientId,
          token,
          `search "${safeQuery}"; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category; limit 25;`
        );

        // Attempt 2: Search with cleaned terms if empty or query had punctuation (e.g. "Sherlock Holmes: Crimes and Punishments")
        if (data.length === 0 && safeClean !== safeQuery) {
          data = await queryIGDB(
            clientId,
            token,
            `search "${safeClean}"; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category; limit 25;`
          );
        }

        // Attempt 3: Substring wildcard pattern match
        if (data.length === 0) {
          data = await queryIGDB(
            clientId,
            token,
            `where name ~ *"${safeClean}"*; fields name, cover.url, summary, category, version_parent, external_games.category, external_games.uid, websites.url, websites.category; limit 25;`
          );
        }

        data.forEach(g => addResult(formatIGDBGame(g)));
      }

      // B. Query Steam Store Search API (and Steam Community)
      const steamResults = await searchSteamStore(queryStr);
      steamResults.forEach(addResult);

      // C. Query Local Supabase Games Database
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data: dbGames } = await supabase
            .from('games')
            .select('*')
            .ilike('title', `%${queryStr}%`)
            .limit(10);

          if (dbGames && Array.isArray(dbGames)) {
            dbGames.forEach((g: any) => {
              addResult({
                id: g.id,
                title: g.title,
                name: g.title,
                game_name: g.title,
                image: g.image_url,
                game_image: g.image_url,
                cover: { url: g.image_url },
                summary: '',
                steam_appid: g.steam_appid,
                steamAppId: g.steam_appid
              });
            });
          }
        } catch (e) {
          console.warn('[game-search] Local Supabase search error:', e);
        }
      }

      // D. Fallback custom choice if no results matched
      if (results.length === 0 && queryStr.length > 0) {
        results.push({
          id: `custom_${Date.now()}`,
          title: queryStr,
          name: queryStr,
          game_name: queryStr,
          image: 'https://via.placeholder.com/264x352?text=Custom+Game',
          game_image: 'https://via.placeholder.com/264x352?text=Custom+Game',
          cover: { url: 'https://via.placeholder.com/264x352?text=Custom+Game' },
          summary: 'Use custom game title',
          steam_appid: null,
          steamAppId: null,
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
