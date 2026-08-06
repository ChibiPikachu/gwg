import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    // 1. Get current active event
    const { data: activeEvent } = await supabase
      .from('events')
      .select('*')
      .eq('active', true)
      .maybeSingle();

    const eventId = activeEvent?.id;

    // 2. Fetch approved submissions for current event
    let query = supabase.from('submissions').select('*').eq('status', 'approved');
    if (eventId) {
      query = query.eq('event_id', eventId);
    }
    const { data: submissions, error: subError } = await query;
    if (subError) throw subError;

    // 3. Fetch team adjustments
    const { data: adjustments } = await supabase.from('team_adjustments').select('*');

    // 4. Fetch user profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('steamid, steam_name, steam_avatar, discord_name, discord_avatar, active_avatar, team, status, role');

    const profileMap = new Map((profiles || []).map(p => [p.steamid, p]));

    // 5. Aggregate user scores
    const userScores: Record<string, number> = {};
    (submissions || []).forEach((sub: any) => {
      const id = sub.steamid || sub.user_id;
      if (id) {
        userScores[id] = (userScores[id] || 0) + (Number(sub.calculated_score || sub.score || sub.points) || 0);
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

    // 6. Aggregate team scores
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
      event: activeEvent || null,
      totalParticipants: topUsers.length,
      standings,
      topUsers,
      adjustments: adjustments || []
    });
  } catch (err: any) {
    console.error('Error fetching live leaderboard:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}