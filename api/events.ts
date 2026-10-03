import type { Request as VercelRequest, Response as VercelResponse } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
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

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { title, description, startDate, start_date, endDate, end_date, isActive, is_active, hideScores, hide_scores, winnerTeam, winner_team } = req.body || {};
      const finalStart = startDate || start_date || new Date().toISOString();
      const finalEnd = endDate || end_date || new Date().toISOString();
      const finalActive = isActive !== undefined ? isActive : (is_active !== undefined ? is_active : true);
      const finalHide = hideScores !== undefined ? hideScores : (hide_scores !== undefined ? hide_scores : false);
      const finalWinner = winnerTeam || winner_team || null;

      const { data, error } = await supabase
        .from('events')
        .insert([{
          title: title || 'New Event',
          description: description || '',
          start_date: finalStart,
          end_date: finalEnd,
          is_active: Boolean(finalActive),
          hide_scores: Boolean(finalHide),
          winner_team: finalWinner === 'auto' ? null : finalWinner
        }])
        .select()
        .single();

      if (error) throw error;

      if (finalActive && data?.id) {
        await savePreviousEventAndResetTeams(supabase, data.id);
      }

      return res.status(200).json(data);
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const rawId = req.query.id || req.body?.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) {
        return res.status(400).json({ error: 'Missing event ID' });
      }

      const { title, description, startDate, start_date, endDate, end_date, isActive, is_active, hideScores, hide_scores, winnerTeam, winner_team } = req.body || {};
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (startDate || start_date) updateData.start_date = startDate || start_date;
      if (endDate || end_date) updateData.end_date = endDate || end_date;
      if (isActive !== undefined || is_active !== undefined) updateData.is_active = Boolean(isActive !== undefined ? isActive : is_active);
      if (hideScores !== undefined || hide_scores !== undefined) updateData.hide_scores = Boolean(hideScores !== undefined ? hideScores : hide_scores);
      if (winnerTeam !== undefined || winner_team !== undefined) {
        const w = winnerTeam !== undefined ? winnerTeam : winner_team;
        updateData.winner_team = (w === 'auto' || !w) ? null : w;
      }

      const { data, error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (updateData.is_active && id) {
        await savePreviousEventAndResetTeams(supabase, id);
      }

      return res.status(200).json(data || { success: true });
    }

    if (req.method === 'DELETE') {
      const rawId = req.query.id || req.body?.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) return res.status(400).json({ error: 'Missing event ID' });

      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to process event request' });
  }
}

export async function savePreviousEventAndResetTeams(supabaseClient: any, newActiveEventId: string) {
  try {
    // 1. Find previous events (events other than newActiveEventId)
    const { data: previousEvents } = await supabaseClient
      .from('events')
      .select('*')
      .neq('id', newActiveEventId)
      .order('start_date', { ascending: false });

    // The event that was active previously or the most recent prior event
    const prevEvent = (previousEvents || []).find((e: any) => e.is_active) || (previousEvents || [])[0];

    // 2. Fetch all profiles that have an assigned team
    const { data: allProfiles } = await supabaseClient
      .from('profiles')
      .select('id, steamid, discord_id, team, steam_name');

    const assignedProfiles = (allProfiles || []).filter((p: any) => p.team && p.team !== 'none');

    if (prevEvent && assignedProfiles.length > 0) {
      // Save all assigned user teams to user_event_teams for the previous event
      for (const p of assignedProfiles) {
        const uId = p.steamid || p.discord_id || p.id;
        if (uId) {
          await supabaseClient.from('user_event_teams').upsert({
            steamid: uId,
            event_id: prevEvent.id,
            team: p.team
          }, { onConflict: 'steamid,event_id' }).catch(() => {});
        }
      }

      // Save all assigned user teams to previous event's snapshot description
      let snapshot: any = {};
      if (prevEvent.description && prevEvent.description.includes('<!--EVENT_SCORES:')) {
        const match = prevEvent.description.match(/<!--EVENT_SCORES:(.*?)-->/s);
        if (match && match[1]) {
          try { snapshot = JSON.parse(match[1]); } catch {}
        }
      }
      if (!snapshot.userTeams) snapshot.userTeams = {};

      assignedProfiles.forEach((p: any) => {
        const t = p.team;
        if (p.steamid) snapshot.userTeams[String(p.steamid)] = t;
        if (p.discord_id) {
          const rawDid = String(p.discord_id);
          const cleanDid = rawDid.replace('discord_', '');
          snapshot.userTeams[rawDid] = t;
          snapshot.userTeams[cleanDid] = t;
          snapshot.userTeams[`discord_${cleanDid}`] = t;
        }
        if (p.id) snapshot.userTeams[String(p.id)] = t;
      });

      const snapStr = `<!--EVENT_SCORES:${JSON.stringify(snapshot)}-->`;
      let newDesc = prevEvent.description || '';
      if (newDesc.includes('<!--EVENT_SCORES:')) {
        newDesc = newDesc.replace(/<!--EVENT_SCORES:.*?-->/s, snapStr);
      } else {
        newDesc = newDesc ? `${newDesc}\n${snapStr}` : snapStr;
      }

      await supabaseClient
        .from('events')
        .update({ is_active: false, description: newDesc })
        .eq('id', prevEvent.id);
    }

    // 3. Mark all other events inactive
    await supabaseClient
      .from('events')
      .update({ is_active: false })
      .neq('id', newActiveEventId);

    // 4. Mark the new event active
    await supabaseClient
      .from('events')
      .update({ is_active: true })
      .eq('id', newActiveEventId);

    // 5. CRITICAL: Reset ALL users in profiles to null ("unassigned") and 0 points for the new event!
    await supabaseClient
      .from('profiles')
      .update({ team: null, points: 0 })
      .neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (err) {
    console.error('Error in savePreviousEventAndResetTeams:', err);
  }
}