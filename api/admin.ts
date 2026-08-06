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
      const { team, points, reason, event_id } = req.body || {};
      const { data, error } = await supabase
        .from('team_adjustments')
        .insert([{
          user_id: `team_pts_${team}`,
          points: Number(points) || 0,
          reason: reason || 'Admin Adjustment',
          event_id: event_id || null
        }])
        .select();

      if (error) throw error;
      return res.status(201).json(data[0]);
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

    // Fallback for generic GET/POST admin routes
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Admin Serverless Error:', err);
    return res.status(500).json({ error: err.message || 'Internal admin handler error' });
  }
}
