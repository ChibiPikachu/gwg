import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const typeParam = req.query.type;
  const isGames = typeParam === 'games' || (Array.isArray(typeParam) && typeParam[0] === 'games') || (req.url && req.url.includes('/games'));

  // Handle Games Leaderboard: /api/leaderboard/games or /api/leaderboards?type=games
  if (isGames) {
    try {
      const eventIdParam = (req.query.eventId || req.query.event_id || req.query.id) as string | undefined;

      let targetEventId = eventIdParam;

      // 1. Get active event if not specified
      const { data: activeEvent } = await supabase
        .from('events')
        .select('id, is_active')
        .eq('is_active', true)
        .maybeSingle();

      if (!targetEventId) {
        targetEventId = activeEvent ? activeEvent.id : 'all';
      }

      const isActiveTarget = activeEvent ? activeEvent.id === targetEventId : false;

      // 2. Query submissions for target event
      let subQuery = supabase
        .from('submissions')
        .select('game_id, game_name, game_image, steam_appid, user_id, user_name, user_avatar, event_id, status, points, calculated_score');

      if (targetEventId === 'all') {
        // No event_id filter
      } else if (isActiveTarget) {
        subQuery = subQuery.or(`event_id.eq.${targetEventId},event_id.is.null`);
      } else {
        subQuery = subQuery.eq('event_id', targetEventId);
      }

      const { data: submissions, error } = await subQuery;

      if (error) throw error;
      if (!submissions || submissions.length === 0) return res.status(200).json([]);

      // Filter out non-game entries AND filter for approved/verified submissions
      const isApproved = (s: any) => 
        s.status === 'verified' || 
        s.status === 'approved';

      const validSubmissions = submissions.filter((s: any) => {
        if (!s.game_name) return false;
        if (!isApproved(s)) return false;
        const lower = String(s.game_name).toLowerCase();
        if (
          lower === 'event update' || 
          lower === 'team adjustment' || 
          lower === 'bingo points' || 
          lower === 'screenshot points' || 
          lower === 'team award' || 
          lower.includes('manual award')
        ) return false;
        return true;
      });

      if (validSubmissions.length === 0) return res.status(200).json([]);

      // 3. Fetch user profiles for these submissions
      const userIds = Array.from(new Set(validSubmissions.map((s: any) => s.user_id).filter(Boolean)));
      let profileMap: Record<string, any> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('steamid, id, discord_id, steam_name, discord_name, steam_avatar, discord_avatar, active_avatar');

        (profiles || []).forEach((p: any) => {
          let avatar = p.steam_avatar || p.discord_avatar || '';
          if (p.active_avatar === 'discord' && p.discord_avatar) avatar = p.discord_avatar;
          
          const profileObj = {
            steamid: p.steamid || p.id || (p.discord_id ? `discord_${p.discord_id}` : 'gamer'),
            steam_name: p.steam_name || p.discord_name || 'Member',
            steam_avatar: avatar
          };

          const keys = [p.steamid, p.id, p.discord_id, p.discord_id ? `discord_${p.discord_id}` : null].filter(Boolean);
          keys.forEach(k => {
            profileMap[String(k)] = profileObj;
          });
        });
      }

      // 4. Group by game
      const gamesMap = new Map();
      validSubmissions.forEach((s: any) => {
        const key = s.game_id || s.game_name || (s.steam_appid ? String(s.steam_appid) : null);
        if (!key) return;

        if (!gamesMap.has(key)) {
          gamesMap.set(key, {
            game_id: s.game_id || key,
            game_name: s.game_name,
            game_image: s.game_image,
            steam_appid: s.steam_appid,
            users: []
          });
        }
        const game = gamesMap.get(key);
        const profile = profileMap[String(s.user_id)];
        const userObj = profile || {
          steamid: s.user_id,
          steam_name: s.user_name || 'Member',
          steam_avatar: s.user_avatar || ''
        };

        if (!game.users.find((u: any) => u.steamid === userObj.steamid)) {
          game.users.push(userObj);
        }
      });

      return res.status(200).json(Array.from(gamesMap.values()));
    } catch (err: any) {
      console.error('Failed to fetch games leaderboard:', err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  // Handle Main / Event Leaderboard
  const id = (req.query.id || req.query.eventId) as string | undefined;

  try {
    let event: any = null;
    let eventId: string | undefined = (id && id !== 'all') ? id : undefined;

    if (id && id !== 'all') {
      // Fetch specific event details
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!eventError && eventData) {
        event = eventData;
      }
    } else {
      // Get current active event
      const { data: activeEvent } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      event = activeEvent || null;
      eventId = activeEvent?.id;
    }

    // Fetch submissions for event
    let subQuery = supabase.from('submissions').select('*').or('status.eq.verified,status.eq.approved');
    if (eventId) {
      subQuery = subQuery.eq('event_id', eventId);
    }
    const { data: submissions, error: subError } = await subQuery;
    if (subError) throw subError;

    // Fetch team adjustments
    let adjQuery = supabase.from('team_adjustments').select('*');
    if (eventId) {
      adjQuery = adjQuery.eq('event_id', eventId);
    }
    const { data: adjustments } = await adjQuery;

    // Fetch profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('steamid, steam_name, steam_avatar, discord_name, discord_avatar, active_avatar, team, status, role');

    const profileMap = new Map((profiles || []).map(p => [p.steamid, p]));

    // Aggregate user scores
    const userScores: Record<string, number> = {};
    (submissions || []).forEach((sub: any) => {
      const steamId = sub.steamid || sub.user_id;
      if (steamId) {
        userScores[steamId] = (userScores[steamId] || 0) + (Number(sub.calculated_score || sub.score || sub.points) || 0);
      }
    });

    const topUsers = Object.entries(userScores)
      .map(([steamid, points]) => {
        const prof: any = profileMap.get(steamid) || {};
        return {
          steamid,
          steam_name: prof.steam_name || 'Unknown User',
          steam_avatar: (prof.active_avatar === 'discord' && prof.discord_avatar) ? prof.discord_avatar : (prof.steam_avatar || ''),
          discord_name: prof.discord_name || null,
          team: prof.team || 'none',
          status: prof.status || '',
          role: prof.role || 'user',
          points
        };
      })
      .sort((a, b) => b.points - a.points)
      .map((u, idx) => ({ ...u, rank: idx + 1 }));

    // Aggregate team totals
    const teamTotals: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };
    const teamMembersCount: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };

    topUsers.forEach(u => {
      if (u.team && teamTotals[u.team] !== undefined) {
        teamTotals[u.team] += u.points;
        teamMembersCount[u.team] += 1;
      }
    });

    (adjustments || []).forEach((adj: any) => {
      if (adj.user_id && adj.user_id.startsWith('team_pts_')) {
        const teamName = adj.user_id.replace('team_pts_', '');
        if (teamTotals[teamName] !== undefined) {
          teamTotals[teamName] += Number(adj.points || 0);
        }
      }
    });

    const standings = Object.keys(teamTotals)
      .map(team => ({
        team,
        points: teamTotals[team],
        members: teamMembersCount[team]
      }))
      .sort((a, b) => b.points - a.points)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));

    return res.status(200).json({
      event,
      totalParticipants: topUsers.length,
      standings,
      topUsers,
      adjustments: adjustments || []
    });
  } catch (err: any) {
    console.error('Error fetching leaderboard:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

