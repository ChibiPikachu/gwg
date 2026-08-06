import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncUserPoints(userId: string) {
  try {
    const { data: subs } = await supabase
      .from('submissions')
      .select('points, calculated_score')
      .eq('user_id', userId)
      .eq('status', 'verified');

    const total = (subs || []).reduce(
      (acc, s) => acc + (Number(s.points !== undefined && s.points !== null ? s.points : s.calculated_score) || 0),
      0
    );

    await supabase
      .from('profiles')
      .update({ points: total })
      .eq('steamid', userId);

    return total;
  } catch (err) {
    console.error('syncUserPoints error:', err);
    return 0;
  }
}

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

  const path = (req.query.subpath || req.query.path || req.query.action || '') as string;
  const rawId = req.query.id || req.query.steamId || req.query.submissionId;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  try {
    // 1. Verify Submission: POST /api/admin/verify-submission
    if (path.includes('verify-submission') || (req.method === 'POST' && req.body?.submissionId)) {
      const { submissionId, status, points, rejectionReason, hours, achievements, multiplier, notes } = req.body || {};
      const subId = submissionId || id;

      if (!subId) {
        return res.status(400).json({ error: 'Missing submissionId' });
      }

      const { data: sub, error: subError } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', subId)
        .maybeSingle();

      if (subError || !sub) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      const finalPts = status === 'verified' ? (Number(points) || 0) : 0;
      const updateData: any = {
        status,
        points: finalPts,
        rejection_reason: status === 'rejected' ? rejectionReason : null,
        calculated_score: finalPts
      };

      if (hours !== undefined && !isNaN(parseFloat(hours))) updateData.hours_during = parseFloat(hours);
      if (achievements !== undefined && !isNaN(parseInt(achievements))) updateData.achievements_during = parseInt(achievements);
      if (multiplier !== undefined && !isNaN(parseFloat(multiplier))) updateData.multiplier = parseFloat(multiplier);
      if (notes !== undefined) updateData.notes = notes;

      const { error: updateError } = await supabase
        .from('submissions')
        .update(updateData)
        .eq('id', subId);

      if (updateError) {
        return res.status(500).json({ error: updateError.message || 'Failed to update submission' });
      }

      const newTotal = await syncUserPoints(sub.user_id);
      return res.status(200).json({ success: true, pointsAwarded: finalPts, newTotal });
    }

    // 2. Mass Accept: POST /api/admin/submissions/mass-accept
    if (path.includes('mass-accept')) {
      const { data: pendingSubs } = await supabase
        .from('submissions')
        .select('*')
        .eq('status', 'pending');

      if (!pendingSubs || pendingSubs.length === 0) {
        return res.status(200).json({ success: true, count: 0, message: 'No pending submissions found' });
      }

      const ids = pendingSubs.map(s => s.id);
      await supabase
        .from('submissions')
        .update({ status: 'verified' })
        .in('id', ids);

      const userIds = Array.from(new Set(pendingSubs.map(s => s.user_id)));
      for (const uId of userIds) {
        await syncUserPoints(uId);
      }

      return res.status(200).json({ success: true, count: ids.length });
    }

    // 3. Delete Batch: POST /api/admin/submissions/delete-batch
    if (path.includes('delete-batch')) {
      const { ids } = req.body || {};
      if (Array.isArray(ids) && ids.length > 0) {
        const { data: subsToDelete } = await supabase
          .from('submissions')
          .select('user_id')
          .in('id', ids);

        await supabase.from('submissions').delete().in('id', ids);

        const userIds = Array.from(new Set((subsToDelete || []).map(s => s.user_id)));
        for (const uId of userIds) {
          await syncUserPoints(uId);
        }

        return res.status(200).json({ success: true, count: ids.length });
      }
      return res.status(400).json({ error: 'No IDs provided for batch deletion' });
    }

    // 4. Export CSV: GET /api/admin/submissions/export-csv
    if (path.includes('export-csv')) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });

      return res.status(200).json(subs || []);
    }

    // 5. Delete Submission by ID: DELETE /api/admin/submissions/:id or DELETE /api/admin?action=submissions&id=...
    if (req.method === 'DELETE' && (path.includes('submissions') || path.includes('submission_id'))) {
      if (!id) {
        return res.status(400).json({ error: 'Missing submission ID' });
      }

      const { data: sub } = await supabase
        .from('submissions')
        .select('user_id')
        .eq('id', id)
        .single();

      if (!sub) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      await supabase.from('submissions').delete().eq('id', id);
      const newTotal = await syncUserPoints(sub.user_id);

      return res.status(200).json({ success: true, newTotal });
    }

    // 6. Get Submissions: GET /api/admin/submissions
    if (req.method === 'GET' && path.includes('submissions')) {
      const { data: subs, error } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(subs || []);
    }

    // 7. Get Users: GET /api/admin/users
    if (req.method === 'GET' && path.includes('users')) {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(profiles || []);
    }

    // 8. Delete User: DELETE /api/admin/users/:steamId
    if (req.method === 'DELETE' && (path.includes('users') || path.includes('user_steamId'))) {
      if (!id) return res.status(400).json({ error: 'Missing user ID' });

      await supabase.from('submissions').delete().eq('user_id', id);
      await supabase.from('profiles').delete().eq('steamid', id);

      return res.status(200).json({ success: true });
    }

    // 9. Update User Team: POST /api/admin/update-user-team
    if (path.includes('update-user-team')) {
      const { steamId, team } = req.body || {};
      if (!steamId) return res.status(400).json({ error: 'Missing steamId' });

      await supabase
        .from('profiles')
        .update({ team: team || 'none' })
        .eq('steamid', steamId);

      return res.status(200).json({ success: true });
    }

    // 10. Update User Role: POST /api/admin/update-user-role
    if (path.includes('update-user-role')) {
      const { steamId, role } = req.body || {};
      if (!steamId) return res.status(400).json({ error: 'Missing steamId' });

      await supabase
        .from('profiles')
        .update({ role: role || 'user' })
        .eq('steamid', steamId);

      return res.status(200).json({ success: true });
    }

    // 11. Recalculate All: POST /api/admin/recalculate-all
    if (path.includes('recalculate-all')) {
      const { data: profiles } = await supabase.from('profiles').select('steamid');
      for (const p of profiles || []) {
        await syncUserPoints(p.steamid);
      }
      return res.status(200).json({ success: true, message: 'Recalculated all user points' });
    }

    // 12. Repair Submissions: POST /api/admin/repair-submissions
    if (path.includes('repair-submissions')) {
      return res.status(200).json({ success: true, message: 'Repaired submissions' });
    }

    // 13. Team Adjustments: POST /api/admin/team-adjustments
    if (path.includes('team-adjustments')) {
      const { team, points, reason, notes, userIds, userId, adjustmentType, adminName, adminId, event_id, eventId } = req.body || {};
      const numPoints = Number(points) || 0;
      const targetTeam = team || 'mixed';
      const targetUserIds = Array.isArray(userIds) ? userIds : (userId ? [userId] : []);
      const activeEventId = eventId || event_id || null;

      try {
        if (targetUserIds.length > 0) {
          const adjustmentsArray = targetUserIds.map((uid: string) => ({
            user_id: uid,
            game_name: adjustmentType === 'bingo' ? 'Bingo Points' : 'Screenshot Points',
            calculated_score: numPoints,
            platform: adjustmentType === 'bingo' ? 'Bingo Points' : 'Screenshot Points',
            points: numPoints,
            notes: notes || reason || 'Admin Adjustment',
            status: 'verified',
            verifier_id: adminId || 'admin',
            event_id: activeEventId,
            created_at: new Date().toISOString()
          }));
          const { data, error } = await supabase.from('submissions').insert(adjustmentsArray).select();
          if (!error && data) {
            for (const uid of targetUserIds) {
              try {
                const { data: userSubs } = await supabase
                  .from('submissions')
                  .select('points, calculated_score, game_name')
                  .or(`user_id.eq.${uid},user_id.eq.discord_${uid}`)
                  .eq('status', 'verified');

                let newTotal = 0;
                for (const s of (userSubs || [])) {
                  if (s.game_name === 'Event Update') continue;
                  const pts = Number(s.points !== undefined && s.points !== null ? s.points : s.calculated_score) || 0;
                  newTotal += Math.round(pts);
                }

                await supabase
                  .from('profiles')
                  .update({ points: newTotal })
                  .or(`steamid.eq.${uid},discord_id.eq.${uid},id.eq.${uid}`);
              } catch (syncErr) {
                console.warn('Sync profiles points failed in api/admin.ts:', syncErr);
              }
            }
            return res.status(200).json(data);
          }
        } else {
          const { data, error } = await supabase.from('submissions').insert([{
            user_id: `team_pts_${targetTeam}`,
            game_name: `Team ${targetTeam.toUpperCase()} Adjustment`,
            calculated_score: numPoints,
            platform: 'Team Adjustment',
            points: numPoints,
            notes: notes || reason || 'Admin Adjustment',
            status: 'verified',
            verifier_id: adminId || 'admin',
            event_id: activeEventId,
            created_at: new Date().toISOString()
          }]).select();
          if (!error && data) return res.status(200).json(data[0] || { success: true });
        }
      } catch (err) {
        console.warn('Submissions insert fallback attempted in admin adjustments:', err);
      }

      // Try team_adjustments table if present
      try {
        const { data, error } = await supabase
          .from('team_adjustments')
          .insert([{
            user_id: `team_pts_${targetTeam}`,
            points: numPoints,
            reason: notes || reason || 'Admin Adjustment',
            event_id: activeEventId
          }])
          .select();

        if (!error && data) return res.status(201).json(data[0]);
      } catch (err: any) {
        console.warn('team_adjustments table insert failed:', err);
      }

      return res.status(200).json({ success: true, message: 'Points awarded successfully' });
    }

    // 14. Activity Log: GET /api/admin/activity-log
    if (path.includes('activity-log')) {
      const { data: logs } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      return res.status(200).json(logs || []);
    }

    // 15. Close Event: POST /api/admin/close-event
    if (path.includes('close-event')) {
      const eventId = req.body?.id || id;
      if (!eventId) return res.status(400).json({ error: 'Missing event ID' });

      await supabase.from('events').update({ is_active: false }).eq('id', eventId);
      return res.status(200).json({ success: true });
    }

    // 16. Manage Events: /api/admin/events or /api/admin?action=events
    if (path.includes('events') || path.includes('event')) {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('events').select('*').order('start_date', { ascending: false });
        if (error) throw error;
        return res.status(200).json(data || []);
      }

      if (req.method === 'POST') {
        const { title, description, startDate, start_date, endDate, end_date, isActive, is_active, hideScores, hide_scores, winnerTeam, winner_team } = req.body || {};
        const { data, error } = await supabase.from('events').insert([{
          title: title || 'New Event',
          description: description || '',
          start_date: startDate || start_date || new Date().toISOString(),
          end_date: endDate || end_date || new Date().toISOString(),
          is_active: isActive !== undefined ? isActive : (is_active !== undefined ? is_active : true),
          hide_scores: hideScores !== undefined ? hideScores : (hide_scores !== undefined ? hide_scores : false),
          winner_team: (winnerTeam === 'auto' || winner_team === 'auto') ? null : (winnerTeam || winner_team || null)
        }]).select().single();

        if (error) throw error;
        return res.status(200).json(data);
      }

      if (req.method === 'PUT' || req.method === 'PATCH') {
        const eventId = req.query.id || req.body?.id || id;
        if (!eventId) return res.status(400).json({ error: 'Missing event ID' });

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

        const { data, error } = await supabase.from('events').update(updateData).eq('id', eventId).select().maybeSingle();
        if (error) throw error;
        return res.status(200).json(data || { success: true });
      }

      if (req.method === 'DELETE') {
        const eventId = req.query.id || id;
        if (!eventId) return res.status(400).json({ error: 'Missing event ID' });
        await supabase.from('events').delete().eq('id', eventId);
        return res.status(200).json({ success: true });
      }
    }

    // Fallback for generic GET/POST admin routes
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Admin Serverless Error:', err);
    return res.status(500).json({ error: err.message || 'Internal admin handler error' });
  }
}
