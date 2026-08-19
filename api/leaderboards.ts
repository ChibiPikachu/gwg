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

    // Parse snapshot if available
    let savedScores: any = null;
    if (event?.description && event.description.includes('<!--EVENT_SCORES:')) {
      try {
        const match = event.description.match(/<!--EVENT_SCORES:(.*?)-->/s);
        if (match && match[1]) {
          savedScores = JSON.parse(match[1]);
        }
      } catch (e) {}
    }

    // Fetch submissions for event
    const { data: allSubs, error: subError } = await supabase
      .from('submissions')
      .select('*');
    if (subError) throw subError;

    const isCurrentOrActive = Boolean(event?.is_active);
    const isMatchingSub = (sub: any) => {
      if (!sub.user_id || sub.user_id === 'system_notification' || sub.game_name === 'Event Update') return false;
      const isVerified = sub.status === 'verified' || sub.status === 'approved' || !sub.status;
      if (!isVerified) return false;
      if (eventId && sub.event_id && String(sub.event_id) === String(eventId)) return true;
      if (isCurrentOrActive && !sub.event_id) return true;
      if (!sub.event_id && event?.start_date && event?.end_date && sub.created_at) {
        const subTime = new Date(sub.created_at).getTime();
        const start = new Date(event.start_date).getTime() - 86400000;
        const end = new Date(event.end_date).getTime() + 86400000;
        if (subTime >= start && subTime <= end) return true;
      }
      return false;
    };

    const submissions = (allSubs || []).filter(isMatchingSub);

    // Fetch team adjustments
    const { data: allAdjustments } = await supabase
      .from('team_adjustments')
      .select('*');

    const isMatchingAdj = (adj: any) => {
      if (eventId && adj.event_id && String(adj.event_id) === String(eventId)) return true;
      if (isCurrentOrActive && !adj.event_id) return true;
      if (!adj.event_id && event?.start_date && event?.end_date && adj.created_at) {
        const adjTime = new Date(adj.created_at).getTime();
        const start = new Date(event.start_date).getTime() - 86400000;
        const end = new Date(event.end_date).getTime() + 86400000;
        if (adjTime >= start && adjTime <= end) return true;
      }
      return false;
    };

    const adjustments = (allAdjustments || []).filter(isMatchingAdj);

    // Fetch profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('steamid, discord_id, id, steam_name, steam_avatar, discord_name, discord_avatar, active_avatar, team, status, role, points');

    const profileMap = new Map<string, any>();
    (profiles || []).forEach((p: any) => {
      if (p.steamid) profileMap.set(String(p.steamid).trim(), p);
      if (p.discord_id) {
        const rawDid = String(p.discord_id).trim();
        const cleanDid = rawDid.startsWith('discord_') ? rawDid.replace('discord_', '') : rawDid;
        profileMap.set(rawDid, p);
        profileMap.set(cleanDid, p);
        profileMap.set(`discord_${cleanDid}`, p);
      }
      if (p.id) profileMap.set(String(p.id).trim(), p);
    });

    // Aggregate user scores
    const userScores: Record<string, number> = {};
    const teamAdjustments: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0, ...(savedScores?.teamAdjustments || {}) };

    (submissions || []).forEach((sub: any) => {
      const pts = Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0;
      if (String(sub.user_id).startsWith('team_pts_')) {
        const t = String(sub.user_id).substring('team_pts_'.length);
        if (teamAdjustments[t] !== undefined) teamAdjustments[t] += pts;
        return;
      }
      const rawSid = String(sub.user_id).trim();
      const cleanSid = rawSid.startsWith('discord_') ? rawSid.replace('discord_', '') : rawSid;
      const prof = profileMap.get(rawSid) || profileMap.get(cleanSid);
      const primaryId = prof?.steamid ? String(prof.steamid) : (prof?.discord_id ? `discord_${prof.discord_id}` : cleanSid);
      userScores[primaryId] = (userScores[primaryId] || 0) + pts;
    });

    (adjustments || []).forEach((adj: any) => {
      const pts = Number(adj.points) || 0;
      if (adj.user_id && String(adj.user_id).startsWith('team_pts_')) {
        const t = String(adj.user_id).substring('team_pts_'.length);
        if (teamAdjustments[t] !== undefined) teamAdjustments[t] += pts;
        return;
      }
      if (adj.user_id) {
        const rawSid = String(adj.user_id).trim();
        const cleanSid = rawSid.startsWith('discord_') ? rawSid.replace('discord_', '') : rawSid;
        const prof = profileMap.get(rawSid) || profileMap.get(cleanSid);
        const primaryId = prof?.steamid ? String(prof.steamid) : (prof?.discord_id ? `discord_${prof.discord_id}` : cleanSid);
        userScores[primaryId] = (userScores[primaryId] || 0) + pts;
      }
    });

    const userTeamsMap: Record<string, string> = { ...(savedScores?.userTeams || {}) };
    const usersList: any[] = [];

    (profiles || []).forEach((p: any) => {
      const primaryId = p.steamid ? String(p.steamid) : (p.discord_id ? `discord_${p.discord_id}` : String(p.id));
      const candidateKeys = [
        p.steamid ? String(p.steamid) : null,
        p.discord_id ? String(p.discord_id) : null,
        p.discord_id ? `discord_${p.discord_id}` : null,
        p.id ? String(p.id) : null
      ].filter(Boolean) as string[];

      let points = 0;
      if (savedScores?.forcedByAdmin && savedScores?.userScores) {
        for (const k of candidateKeys) {
          if (savedScores.userScores[k] !== undefined) {
            points = Number(savedScores.userScores[k]) || 0;
            break;
          }
        }
      } else {
        let livePts = 0;
        for (const k of candidateKeys) {
          if (userScores[k]) livePts = Math.max(livePts, userScores[k]);
        }
        let savedPts = 0;
        for (const k of candidateKeys) {
          if (savedScores?.userScores?.[k] !== undefined) {
            savedPts = Math.max(savedPts, Number(savedScores.userScores[k]) || 0);
          }
        }
        points = Math.max(livePts, savedPts);
      }

      let userTeam = 'none';
      for (const k of candidateKeys) {
        if (savedScores?.userTeams?.[k] && savedScores.userTeams[k] !== 'none') {
          userTeam = savedScores.userTeams[k];
          break;
        }
      }
      if (userTeam === 'none' && p.team && p.team !== 'none') {
        userTeam = p.team;
      }
      if (userTeam !== 'none') {
        userTeamsMap[primaryId] = userTeam;
      }

      let avatar = p.steam_avatar || '';
      if (p.active_avatar === 'discord' && p.discord_avatar) avatar = p.discord_avatar;
      else if (!avatar && p.discord_avatar) avatar = p.discord_avatar;

      if (points > 0 || userTeam !== 'none' || p.steamid || p.discord_id) {
        usersList.push({
          steamid: primaryId,
          steam_name: p.steam_name || p.discord_name || 'Member',
          steam_avatar: avatar,
          discord_name: p.discord_name || null,
          team: userTeam,
          status: p.status || '',
          role: p.role || 'user',
          points
        });
      }
    });

    const topUsers = usersList.sort((a, b) => b.points - a.points).map((u, idx) => ({ ...u, rank: idx + 1 }));

    // Aggregate team totals
    const teamTotals: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };
    const teamMembersCount: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };

    topUsers.forEach(u => {
      if (u.team && teamTotals[u.team] !== undefined) {
        teamTotals[u.team] += u.points;
        teamMembersCount[u.team] += 1;
      }
    });

    const standings = (['blue', 'purple', 'green', 'red'] as const).map(team => {
      const liveTotal = (teamTotals[team] || 0) + (teamAdjustments[team] || 0);
      let totalPoints = liveTotal;
      if (savedScores?.forcedByAdmin && savedScores?.teamTotals?.[team] !== undefined) {
        totalPoints = Number(savedScores.teamTotals[team]);
      } else if (savedScores?.teamTotals?.[team] !== undefined) {
        totalPoints = Math.max(liveTotal, Number(savedScores.teamTotals[team]) || 0);
      }
      return {
        team,
        points: totalPoints,
        members: teamMembersCount[team] || 0,
        rank: 1
      };
    }).sort((a, b) => b.points - a.points).map((s, idx) => ({ ...s, rank: idx + 1 }));

    let winnerTeam = event?.winner_team || savedScores?.winnerTeam || null;
    if (!winnerTeam && standings.length > 0 && standings[0].points > 0) {
      winnerTeam = standings[0].team;
    }

    return res.status(200).json({
      event: event ? { ...event, winner_team: winnerTeam } : null,
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

