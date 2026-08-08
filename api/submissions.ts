import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract ID if provided in query or URL parameter
  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = rawId && rawId !== 'undefined' && rawId !== 'null' && rawId.trim() !== ''
    ? (!isNaN(Number(rawId)) ? Number(rawId) : rawId)
    : null;

  // 1. Handle POST: Create a brand-new submission
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const userId = req.headers['x-user-id'] || req.headers['x-steam-id'] || body.userId || body.user_id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
      }

      const { data, error } = await supabase
        .from('submissions')
        .insert([
          {
            user_id: userId,
            game_id: body.gameId || body.game_id,
            game_name: body.gameTitle || body.game_name,
            game_image: body.gameImage || body.game_image,
            achievements_during: body.achievements || body.achievements_during,
            hours_during: body.hours || body.hours_during,
            achievements_before: body.achievementsBefore || body.achievements_before,
            hours_before: body.hoursBefore || body.hours_before,
            multiplier: body.multiplier,
            completion_status: body.completionStatus || body.completion_status,
            beaten_previous: body.beatenPrevious || body.beaten_previous,
            platform: body.platform,
            points: body.calculatedScore || body.points,
            calculated_score: body.calculatedScore || body.points || 0,
            notes: body.notes,
            steam_appid: body.steam_appid,
            status: 'pending'
          }
        ])
        .select();

      if (error) throw error;

      return res.status(201).json(data[0]);
    } catch (error: any) {
      console.error('Error creating submission:', error);
      return res.status(500).json({ error: error.message || 'Failed to create submission' });
    }
  }

  // 2. Handle GET: Fetch single submission by ID, list submissions, or sync Steam stats
  if (req.method === 'GET') {
    try {
      const action = req.query.action;
      const isSteamStatsRequest = action === 'steam-stats' || action === 'user-game-stats' || (!!req.query.appId && id === null) || !!req.query.steamAppId;

      if (isSteamStatsRequest) {
        const rawUserId = req.headers['x-user-id'] as string | undefined;
        const rawSteamId = req.headers['x-steam-id'] as string | undefined;
        const appIdQuery = req.query.appId || req.query.steamAppId;
        const gameTitleQuery = req.query.gameTitle || req.query.title;

        let steamId = typeof rawSteamId === 'string' && /^\d{15,20}$/.test(rawSteamId.trim()) ? rawSteamId.trim() : null;
        let userId = typeof rawUserId === 'string' && rawUserId.trim() ? rawUserId.trim() : null;

        if (!steamId && userId && supabase) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('steamid')
            .or(`id.eq.${userId},steamid.eq.${userId},discord_id.eq.${userId}`)
            .maybeSingle();
          if (profile?.steamid) {
            steamId = profile.steamid;
          }
        }

        if (!steamId && userId && /^\d{15,20}$/.test(userId.trim())) {
          steamId = userId.trim();
        }

        if (!steamId) {
          return res.status(400).json({
            success: false,
            error: 'No Steam ID found for your account. Please log in with Steam or connect your Steam ID in profile settings.'
          });
        }

        let appId: number | null = appIdQuery && !isNaN(Number(appIdQuery)) ? Number(appIdQuery) : null;

        if (!appId && gameTitleQuery && supabase) {
          const { data: gameData } = await supabase
            .from('games')
            .select('steam_appid')
            .ilike('title', `%${String(gameTitleQuery).trim()}%`)
            .maybeSingle();

          if (gameData?.steam_appid) {
            appId = Number(gameData.steam_appid);
          }
        }

        if (!appId && gameTitleQuery) {
          try {
            const searchRes = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(String(gameTitleQuery))}&l=english&cc=US`);
            const searchData: any = await searchRes.json();
            if (searchData?.items?.length > 0) {
              appId = Number(searchData.items[0].id);
            }
          } catch (e) {
            // ignore
          }
        }

        const apiKey = process.env.STEAM_API_KEY;

        let hoursPlayed = 0;
        let achievementsEarned = 0;
        let totalAchievements = 0;
        let gameFoundInLibrary = false;
        let hasNoAchievements = false;

        let ownedGames: any[] = [];
        if (apiKey) {
          try {
            const ownedRes = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json&include_appinfo=1&include_played_free_games=1`);
            if (ownedRes.ok) {
              const ownedData: any = await ownedRes.json();
              ownedGames = ownedData.response?.games || [];
            }
          } catch (err) {
            console.error('[Steam Stats API] Owned games fetch error:', err);
          }
        }

        let matchedGame = appId ? ownedGames.find(g => Number(g.appid) === Number(appId)) : null;
        if (!matchedGame && gameTitleQuery && ownedGames.length > 0) {
          const targetTitle = String(gameTitleQuery).toLowerCase().trim();
          matchedGame = ownedGames.find(g => g.name && g.name.toLowerCase().trim() === targetTitle) ||
                        ownedGames.find(g => g.name && g.name.toLowerCase().includes(targetTitle));
          if (matchedGame && !appId) {
            appId = Number(matchedGame.appid);
          }
        }

        if (matchedGame) {
          gameFoundInLibrary = true;
          const playtimeMinutes = matchedGame.playtime_forever || 0;
          hoursPlayed = Math.round((playtimeMinutes / 60) * 10) / 10;
        }

        if (appId && apiKey) {
          try {
            const achRes = await fetch(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${apiKey}&steamid=${steamId}`);
            if (achRes.ok) {
              const achData: any = await achRes.json();
              if (achData.playerstats?.success) {
                const achList = achData.playerstats.achievements || [];
                totalAchievements = achList.length;
                achievementsEarned = achList.filter((a: any) => a.achieved === 1).length;
                if (totalAchievements === 0) {
                  hasNoAchievements = true;
                }
              }
            }
          } catch (err) {
            console.error('[Steam Stats API] Achievements fetch error:', err);
          }
        }

        return res.status(200).json({
          success: true,
          steamId,
          appId,
          hoursPlayed,
          achievementsEarned,
          totalAchievements,
          hasNoAchievements,
          gameFoundInLibrary,
          message: gameFoundInLibrary 
            ? `Synced ${hoursPlayed} hrs and ${achievementsEarned}${totalAchievements > 0 ? '/' + totalAchievements : ''} achievements from Steam.`
            : `Game not found in user's Steam library (or profile is set to private). Defaulting to 0.`
        });
      }

      if (id !== null) {
        const { data, error } = await supabase
          .from('submissions')
          .select('*')
          .eq('id', id)
          .single();

        if (error || !data) {
          return res.status(404).json({ error: 'Submission not found' });
        }
        return res.status(200).json(data);
      }

      const userId = (req.query.userId || req.query.user_id || req.headers['x-user-id'] || req.headers['x-steam-id']) as string | undefined;

      let query = supabase.from('submissions').select('*').order('created_at', { ascending: false });
      if (userId) {
        query = query.or(`user_id.eq.${userId},steamid.eq.${userId}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json(data);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to fetch submissions' });
    }
  }

  // 3. Handle PUT: Update an existing submission by ID
  if (req.method === 'PUT') {
    if (id === null) {
      return res.status(400).json({ error: 'Valid submission ID is required for update' });
    }

    try {
      const body = req.body || {};

      const { data, error } = await supabase
        .from('submissions')
        .update({
          game_id: body.gameId || body.game_id,
          game_name: body.gameTitle || body.game_name,
          game_image: body.gameImage || body.game_image,
          achievements_during: body.achievements || body.achievements_during,
          hours_during: body.hours || body.hours_during,
          achievements_before: body.achievementsBefore || body.achievements_before,
          hours_before: body.hoursBefore || body.hours_before,
          multiplier: body.multiplier,
          completion_status: body.completionStatus || body.completion_status,
          beaten_previous: body.beatenPrevious || body.beaten_previous,
          platform: body.platform,
          points: body.calculatedScore || body.points,
          calculated_score: body.calculatedScore || body.points || 0,
          notes: body.notes,
          steam_appid: body.steam_appid,
        })
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      return res.status(200).json(data[0]);
    } catch (error: any) {
      console.error('Supabase PUT Error:', error);
      return res.status(500).json({ error: error.message || 'Failed to update submission' });
    }
  }

  // 4. Handle DELETE: Delete submission by ID
  if (req.method === 'DELETE') {
    if (id === null) {
      return res.status(400).json({ error: 'Valid submission ID is required for deletion' });
    }

    try {
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({ success: true, message: 'Submission deleted' });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to delete submission' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
