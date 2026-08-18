import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

function isUuid(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function buildProfileOrFilter(key: string): string {
  if (!key) return 'steamid.eq.none';
  const cleanDiscordId = key.startsWith('discord_') ? key.replace('discord_', '') : key;
  const prefixedDiscordId = `discord_${cleanDiscordId}`;
  if (isUuid(key)) {
    return `id.eq.${key},steamid.eq.${key},discord_id.eq.${key},discord_id.eq.${cleanDiscordId}`;
  }
  return `steamid.eq.${key},steamid.eq.${prefixedDiscordId},discord_id.eq.${key},discord_id.eq.${cleanDiscordId}`;
}

const SETTINGS_FILE_PATH = path.join(process.cwd(), '.screenshot_settings.json');

function getSavedSubmissionPoints(): number {
  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const raw = fs.readFileSync(SETTINGS_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.submission_points !== undefined && !isNaN(Number(parsed.submission_points))) {
        return Number(parsed.submission_points);
      }
    }
  } catch (e) {}
  return 20;
}

function saveSubmissionPointsLocally(points: number) {
  try {
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify({ submission_points: points }), 'utf8');
  } catch (e) {}
}

let persistentDefaultSubmissionPoints = getSavedSubmissionPoints();

// In-memory fallback for local dev when Supabase is not connected
let memoryEvent: any = {
  id: 'evt_screenshot_01',
  title: 'Screenshot Showcase & Contest',
  description: 'Submit up to 10 screenshots from Steam or other platforms. Mark 1 for voting!',
  status: 'submissions_open', // 'draft' | 'submissions_open' | 'voting_active' | 'concluded'
  is_voting_active: false,
  is_admin_only: true,
  max_submissions_per_user: 10,
  submission_points: persistentDefaultSubmissionPoints,
  created_at: new Date().toISOString()
};

let memorySubmissions: any[] = [];
let memoryVotes: any[] = [];
let memoryComments: any[] = [];
let memoryNotifications: any[] = [];

async function reconcileUserScreenshotPoints(supabaseClient: any, targetUserId: string) {
  if (!supabaseClient || !targetUserId) return;
  try {
    const cleanId = targetUserId.startsWith('discord_') ? targetUserId.replace('discord_', '') : targetUserId;
    const prefixedDiscordId = `discord_${cleanId}`;
    
    // 1. Fetch current valid (non-rejected) screenshot submissions for this user
    const { data: userScreenshots } = await supabaseClient
      .from('screenshot_submissions')
      .select('id, status')
      .or(`user_id.eq.${targetUserId},user_id.eq.${cleanId},user_id.eq.${prefixedDiscordId}`);
    
    const validCount = (userScreenshots || []).filter((s: any) => s.status !== 'rejected').length;
    
    // 2. Fetch all screenshot point rows in submissions table
    const { data: existingPointRows } = await supabaseClient
      .from('submissions')
      .select('id, points, calculated_score, notes, created_at')
      .or(`user_id.eq.${targetUserId},user_id.eq.${cleanId},user_id.eq.${prefixedDiscordId}`)
      .or('platform.eq.Screenshot Event,game_name.ilike.%Screenshot Contest Submission%,game_name.ilike.%Screenshot Submission%')
      .order('created_at', { ascending: false });

    const currentPointRows = existingPointRows || [];
    
    // If user has more point rows than screenshots, remove the excess
    if (currentPointRows.length > validCount) {
      const excessCount = currentPointRows.length - validCount;
      const toDelete = currentPointRows.slice(0, excessCount);
      for (const row of toDelete) {
        await supabaseClient.from('submissions').delete().eq('id', row.id);
      }
    }

    // 3. Recalculate profile points from remaining verified submissions
    const { data: userSubs } = await supabaseClient
      .from('submissions')
      .select('points, calculated_score, game_name')
      .or(`user_id.eq.${targetUserId},user_id.eq.${cleanId},user_id.eq.${prefixedDiscordId}`)
      .or('status.eq.verified,status.eq.approved');

    let newTotal = 0;
    for (const s of (userSubs || [])) {
      if (s.game_name === 'Event Update') continue;
      const pts = Number(s.points !== undefined && s.points !== null ? s.points : s.calculated_score) || 0;
      newTotal += Math.round(pts);
    }

    await supabaseClient
      .from('profiles')
      .update({ points: newTotal })
      .or(buildProfileOrFilter(targetUserId));
  } catch (err) {
    console.warn('[Screenshot API] Error reconciling user screenshot points:', err);
  }
}

export default async function handler(req: Request, res: Response) {
  const method = req.method;
  const action = req.query.action || req.body?.action || 'get';

  try {
    if (method === 'GET') {
      if (action === 'notifications' || req.query.notifications === 'true') {
        const queryUserId = (req.query.userId || req.query.user_id) as string;
        if (supabase && queryUserId) {
          const { data: dbNotifs } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', queryUserId)
            .order('created_at', { ascending: false })
            .limit(20);

          if (dbNotifs && dbNotifs.length > 0) {
            return res.status(200).json({ notifications: dbNotifs });
          }
        }

        const filtered = queryUserId 
          ? memoryNotifications.filter(n => n.user_id === queryUserId)
          : memoryNotifications;
        return res.status(200).json({ notifications: filtered });
      }

      // 1. Get Event, Submissions, Votes, Comments
      if (supabase) {
        let { data: evt } = await supabase.from('screenshot_events').select('*').limit(1).maybeSingle();
        if (!evt) {
          // seed event with persistent points
          const seedEvent = { ...memoryEvent, submission_points: persistentDefaultSubmissionPoints };
          const { data: newEvt } = await supabase.from('screenshot_events').insert([seedEvent]).select().single();
          evt = newEvt || seedEvent;
        }

        if (evt) {
          memoryEvent = { ...memoryEvent, ...evt };
          if (evt.submission_points !== undefined && evt.submission_points !== null) {
            persistentDefaultSubmissionPoints = Number(evt.submission_points);
          }
        }

        const { data: subs } = await supabase.from('screenshot_submissions').select('*').order('created_at', { ascending: false });
        const { data: votes } = await supabase.from('screenshot_votes').select('*');
        const { data: comments } = await supabase.from('screenshot_comments').select('*').order('created_at', { ascending: true });

        const eventData = evt || memoryEvent;
        const currentPoints = eventData.submission_points !== undefined && eventData.submission_points !== null 
          ? Number(eventData.submission_points) 
          : persistentDefaultSubmissionPoints;

        return res.status(200).json({
          event: {
            ...eventData,
            submission_points: currentPoints,
            is_voting_active: eventData.status === 'voting_active'
          },
          submissions: subs || [],
          votes: votes || [],
          comments: comments || []
        });
      } else {
        const currentPoints = memoryEvent.submission_points !== undefined 
          ? Number(memoryEvent.submission_points) 
          : persistentDefaultSubmissionPoints;

        return res.status(200).json({
          event: {
            ...memoryEvent,
            submission_points: currentPoints,
            is_voting_active: memoryEvent.status === 'voting_active'
          },
          submissions: memorySubmissions,
          votes: memoryVotes,
          comments: memoryComments
        });
      }
    }

    if (method === 'POST') {
      // SUBMIT SCREENSHOT (+pts to user's team)
      if (action === 'submit') {
        const { userId, userName, userAvatar, userTeam, imageUrl, caption, gameName, isSpoiler, isSelected } = req.body;

        if (!imageUrl) {
          return res.status(400).json({ error: 'Image URL or file is required' });
        }

        if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
        }

        // Check submission count for this user
        let userSubCount = 0;
        if (supabase) {
          const { data: existing } = await supabase.from('screenshot_submissions').select('id, is_selected').eq('user_id', userId);
          userSubCount = (existing || []).length;
          if (userSubCount >= 10) {
            return res.status(400).json({ error: 'You have reached the maximum limit of 10 screenshot submissions!' });
          }

          // If isSelected is true, unselect other submissions by this user
          if (isSelected) {
            await supabase.from('screenshot_submissions').update({ is_selected: false }).eq('user_id', userId);
          }

          const newSub = {
            event_id: memoryEvent.id,
            user_id: userId,
            user_name: userName || 'Anonymous User',
            user_avatar: userAvatar || '',
            user_team: userTeam || 'none',
            image_url: imageUrl,
            caption: caption || '',
            game_name: gameName || 'Steam Game',
            is_spoiler: Boolean(isSpoiler),
            is_selected: Boolean(isSelected || userSubCount === 0), // Default 1st upload to selected if none selected
            status: 'approved',
            created_at: new Date().toISOString()
          };

          const { data: inserted, error } = await supabase.from('screenshot_submissions').insert([newSub]).select().single();
          if (error) throw error;

          // Fetch current event submission points
          let ptsToAward = getSavedSubmissionPoints();
          if (supabase) {
            const { data: currentEvt } = await supabase.from('screenshot_events').select('submission_points').eq('id', memoryEvent.id).maybeSingle();
            if (currentEvt && currentEvt.submission_points !== undefined && currentEvt.submission_points !== null) {
              ptsToAward = Number(currentEvt.submission_points);
            }
          }

          // Award submission points to user's team
          if (userTeam && userTeam !== 'none' && ptsToAward > 0) {
            await supabase.from('submissions').insert([{
              user_id: userId,
              game_name: `Screenshot Contest Submission (+${ptsToAward} pts)`,
              platform: 'Screenshot Event',
              points: ptsToAward,
              calculated_score: ptsToAward,
              status: 'verified',
              notes: `__META_START__${JSON.stringify({ screenshotId: inserted.id, gameName: gameName || 'Game', userNotes: `Submitted screenshot for ${gameName || 'Game'}` })}__META_END__`,
              created_at: new Date().toISOString()
            }]);

            await reconcileUserScreenshotPoints(supabase, userId);
          }

          return res.status(200).json({ success: true, submission: inserted });
        } else {
          userSubCount = memorySubmissions.filter(s => s.user_id === userId).length;
          if (userSubCount >= 10) {
            return res.status(400).json({ error: 'You have reached the maximum limit of 10 screenshot submissions!' });
          }

          if (isSelected) {
            memorySubmissions = memorySubmissions.map(s => s.user_id === userId ? { ...s, is_selected: false } : s);
          }

          const newSub = {
            id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            event_id: memoryEvent.id,
            user_id: userId,
            user_name: userName || 'Anonymous User',
            user_avatar: userAvatar || '',
            user_team: userTeam || 'none',
            image_url: imageUrl,
            caption: caption || '',
            game_name: gameName || 'Steam Game',
            is_spoiler: Boolean(isSpoiler),
            is_selected: Boolean(isSelected || userSubCount === 0),
            status: 'approved',
            created_at: new Date().toISOString()
          };

          memorySubmissions.unshift(newSub);
          return res.status(200).json({ success: true, submission: newSub });
        }
      }

      // SELECT FOR VOTING (toggle is_selected)
      if (action === 'select-voting') {
        const { submissionId, userId } = req.body;
        if (!submissionId || !userId) {
          return res.status(400).json({ error: 'Missing submissionId or userId' });
        }

        if (supabase) {
          // Unselect all other submissions for this user
          await supabase.from('screenshot_submissions').update({ is_selected: false }).eq('user_id', userId);
          // Set this submission as selected
          const { data: updated, error } = await supabase.from('screenshot_submissions').update({ is_selected: true }).eq('id', submissionId).select().single();
          if (error) throw error;
          return res.status(200).json({ success: true, submission: updated });
        } else {
          memorySubmissions = memorySubmissions.map(s => {
            if (s.user_id === userId) {
              return { ...s, is_selected: s.id === submissionId };
            }
            return s;
          });
          return res.status(200).json({ success: true });
        }
      }

      // ADMIN: SET STATUS (Approved, Pending, Rejected)
      if (action === 'admin-set-status') {
        const { submissionId, status } = req.body;
        if (!submissionId || !status) {
          return res.status(400).json({ error: 'Missing submissionId or status' });
        }

        const validStatus = ['approved', 'pending', 'rejected'].includes(status) ? status : 'approved';

        if (supabase) {
          const { data: targetSub } = await supabase
            .from('screenshot_submissions')
            .select('*')
            .eq('id', submissionId)
            .maybeSingle();

          if (!targetSub) return res.status(404).json({ error: 'Submission not found' });

          const { data: updated, error } = await supabase
            .from('screenshot_submissions')
            .update({ status: validStatus })
            .eq('id', submissionId)
            .select()
            .single();

          if (error) throw error;

          if (targetSub.user_id) {
            await reconcileUserScreenshotPoints(supabase, targetSub.user_id);
          }

          return res.status(200).json({ success: true, submission: updated });
        } else {
          memorySubmissions = memorySubmissions.map(s => s.id === submissionId ? { ...s, status: validStatus } : s);
          return res.status(200).json({ success: true });
        }
      }

      // VOTE FOR SCREENSHOT
      if (action === 'vote') {
        const { submissionId, userId, eventStatus } = req.body;
        
        let currentStatus = memoryEvent.status;
        if (supabase) {
          const { data: evt } = await supabase.from('screenshot_events').select('status').eq('id', memoryEvent.id).maybeSingle();
          if (evt) currentStatus = evt.status;
        }

        if (currentStatus !== 'voting_active' && eventStatus !== 'voting_active') {
          return res.status(400).json({ error: "You can't vote yet!" });
        }

        if (!submissionId || !userId) {
          return res.status(400).json({ error: 'Missing submissionId or userId' });
        }

        if (supabase) {
          // Check if submission belongs to user
          const { data: targetSub } = await supabase.from('screenshot_submissions').select('user_id, is_selected').eq('id', submissionId).single();
          if (!targetSub) return res.status(404).json({ error: 'Submission not found' });

          if (targetSub.user_id === userId) {
            return res.status(400).json({ error: "You can't vote for yourself, silly!" });
          }

          if (!targetSub.is_selected) {
            return res.status(400).json({ error: 'This screenshot is not up for voting!' });
          }

          // Check user's current votes count (max 5)
          const { data: userVotes } = await supabase.from('screenshot_votes').select('id, submission_id').eq('user_id', userId);
          const existingVote = (userVotes || []).find(v => v.submission_id === submissionId);

          if (existingVote) {
            // Unvote
            await supabase.from('screenshot_votes').delete().eq('id', existingVote.id);
            return res.status(200).json({ success: true, voted: false, message: 'Vote removed' });
          } else {
            if ((userVotes || []).length >= 5) {
              return res.status(400).json({ error: 'You have used all 5 of your votes!' });
            }
            await supabase.from('screenshot_votes').insert([{
              event_id: memoryEvent.id,
              submission_id: submissionId,
              user_id: userId,
              created_at: new Date().toISOString()
            }]);
            return res.status(200).json({ success: true, voted: true, message: 'Vote submitted!' });
          }
        } else {
          const targetSub = memorySubmissions.find(s => s.id === submissionId);
          if (!targetSub) return res.status(404).json({ error: 'Submission not found' });
          if (targetSub.user_id === userId) return res.status(400).json({ error: "You can't vote for yourself, silly!" });

          const existingIndex = memoryVotes.findIndex(v => v.user_id === userId && v.submission_id === submissionId);
          if (existingIndex >= 0) {
            memoryVotes.splice(existingIndex, 1);
            return res.status(200).json({ success: true, voted: false, message: 'Vote removed' });
          } else {
            const userVotesCount = memoryVotes.filter(v => v.user_id === userId).length;
            if (userVotesCount >= 5) {
              return res.status(400).json({ error: 'You have used all 5 of your votes!' });
            }
            memoryVotes.push({
              id: 'vote_' + Date.now(),
              event_id: memoryEvent.id,
              submission_id: submissionId,
              user_id: userId,
              created_at: new Date().toISOString()
            });
            return res.status(200).json({ success: true, voted: true, message: 'Vote submitted!' });
          }
        }
      }

      // ADD COMMENT
      if (action === 'comment') {
        const { submissionId, userId, userName, userAvatar, content } = req.body;

        if (!submissionId || !content?.trim()) {
          return res.status(400).json({ error: 'Comment content cannot be empty' });
        }

        const newComment = {
          submission_id: submissionId,
          user_id: userId || 'anon',
          user_name: userName || 'Anonymous',
          user_avatar: userAvatar || '',
          content: content.trim(),
          created_at: new Date().toISOString()
        };

        // Find screenshot creator to notify
        let creatorId: string | null = null;
        let gameName = '';
        if (supabase) {
          const { data: subData } = await supabase
            .from('screenshot_submissions')
            .select('user_id, game_name')
            .eq('id', submissionId)
            .maybeSingle();
          if (subData) {
            creatorId = subData.user_id;
            gameName = subData.game_name || 'Screenshot';
          }
        } else {
          const subData = memorySubmissions.find(s => s.id === submissionId);
          if (subData) {
            creatorId = subData.user_id;
            gameName = subData.game_name || 'Screenshot';
          }
        }

        // Send alert if commenter is not the creator
        if (creatorId && creatorId !== userId) {
          const notifObj = {
            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            user_id: creatorId,
            actor_name: userName || 'Someone',
            actor_avatar: userAvatar || '',
            game_name: gameName,
            submission_id: submissionId,
            content: content.trim(),
            title: 'New Comment on your Screenshot',
            message: `${userName || 'Someone'} commented on your ${gameName} screenshot: "${content.trim()}"`,
            created_at: new Date().toISOString(),
            is_read: false
          };

          if (supabase) {
            try {
              await supabase.from('notifications').insert([{
                user_id: creatorId,
                title: notifObj.title,
                message: notifObj.message,
                type: 'screenshot_comment',
                data: JSON.stringify({ submissionId, gameName, userName, content: content.trim() }),
                created_at: notifObj.created_at,
                is_read: false
              }]);
            } catch (err) {
              console.warn('Could not insert into Supabase notifications table, using fallback:', err);
            }
          }
          memoryNotifications.unshift(notifObj);
        }

        if (supabase) {
          const { data: inserted, error } = await supabase.from('screenshot_comments').insert([newComment]).select().single();
          if (error) throw error;
          return res.status(200).json({ success: true, comment: inserted });
        } else {
          const item = { id: 'cmt_' + Date.now(), ...newComment };
          memoryComments.push(item);
          return res.status(200).json({ success: true, comment: item });
        }
      }

      // ADMIN: UPDATE SUBMISSION (edit caption, game_name, is_spoiler, status)
      if (action === 'admin-update-submission') {
        const { submissionId, caption, gameName, isSpoiler, status } = req.body;

        const updateFields: any = {};
        if (caption !== undefined) updateFields.caption = caption;
        if (gameName !== undefined) updateFields.game_name = gameName;
        if (isSpoiler !== undefined) updateFields.is_spoiler = Boolean(isSpoiler);
        if (status !== undefined) updateFields.status = status;

        if (supabase) {
          const { data: targetSub } = await supabase
            .from('screenshot_submissions')
            .select('*')
            .eq('id', submissionId)
            .maybeSingle();

          const { data: updated, error } = await supabase
            .from('screenshot_submissions')
            .update(updateFields)
            .eq('id', submissionId)
            .select()
            .single();

          if (error) throw error;

          if (targetSub?.user_id) {
            await reconcileUserScreenshotPoints(supabase, targetSub.user_id);
          }

          return res.status(200).json({ success: true, submission: updated });
        } else {
          memorySubmissions = memorySubmissions.map(s => s.id === submissionId ? {
            ...s,
            ...updateFields
          } : s);
          return res.status(200).json({ success: true });
        }
      }

      // ADMIN OR USER: DELETE SUBMISSION (removes points awarded & updates leaderboard)
      if (action === 'admin-delete-submission' || action === 'delete-submission') {
        const { submissionId } = req.body;

        if (supabase) {
          // Fetch target submission details to identify user
          const { data: targetSub } = await supabase
            .from('screenshot_submissions')
            .select('*')
            .eq('id', submissionId)
            .maybeSingle();

          const targetUserId = targetSub?.user_id;

          await supabase.from('screenshot_comments').delete().eq('submission_id', submissionId);
          await supabase.from('screenshot_votes').delete().eq('submission_id', submissionId);
          await supabase.from('screenshot_submissions').delete().eq('id', submissionId);

          if (targetUserId) {
            await reconcileUserScreenshotPoints(supabase, targetUserId);
          }

          return res.status(200).json({ success: true, message: 'Submission deleted and points reconciled' });
        } else {
          memorySubmissions = memorySubmissions.filter(s => s.id !== submissionId);
          memoryVotes = memoryVotes.filter(v => v.submission_id !== submissionId);
          memoryComments = memoryComments.filter(c => c.submission_id !== submissionId);
          return res.status(200).json({ success: true, message: 'Submission deleted' });
        }
      }

      // ADMIN: TOGGLE VOTING PERIOD
      if (action === 'admin-toggle-voting') {
        let targetId = memoryEvent.id;
        let currentStatus = memoryEvent.status;
        if (supabase) {
          const { data: evt } = await supabase.from('screenshot_events').select('*').limit(1).maybeSingle();
          if (evt) {
            targetId = evt.id;
            currentStatus = evt.status;
            memoryEvent = { ...memoryEvent, ...evt };
          }
        }

        const newStatus = currentStatus === 'voting_active' ? 'submissions_open' : 'voting_active';

        if (supabase) {
          const { data: updated } = await supabase
            .from('screenshot_events')
            .update({ status: newStatus })
            .eq('id', targetId)
            .select()
            .single();

          if (updated) memoryEvent = { ...memoryEvent, ...updated };
          else memoryEvent.status = newStatus;
        } else {
          memoryEvent.status = newStatus;
        }

        return res.status(200).json({
          success: true,
          status: memoryEvent.status,
          is_voting_active: memoryEvent.status === 'voting_active',
          event: {
            ...memoryEvent,
            submission_points: memoryEvent.submission_points !== undefined ? Number(memoryEvent.submission_points) : getSavedSubmissionPoints(),
            is_voting_active: memoryEvent.status === 'voting_active'
          }
        });
      }

      // ADMIN: UPDATE EVENT STATUS & SETTINGS ('draft' | 'submissions_open' | 'voting_active' | 'concluded', submission_points)
      if (action === 'admin-event-status' || action === 'admin-update-event') {
        const { status, isAdminOnly, submissionPoints } = req.body;

        const updateData: any = {};
        if (status) {
          updateData.status = status;
          memoryEvent.status = status;
        }
        if (isAdminOnly !== undefined) {
          updateData.is_admin_only = Boolean(isAdminOnly);
          memoryEvent.is_admin_only = Boolean(isAdminOnly);
        }
        if (submissionPoints !== undefined && !isNaN(Number(submissionPoints))) {
          const pts = Math.max(0, Number(submissionPoints));
          persistentDefaultSubmissionPoints = pts;
          saveSubmissionPointsLocally(pts);
          updateData.submission_points = pts;
          memoryEvent.submission_points = pts;
        }

        if (supabase) {
          try {
            let targetId = memoryEvent.id;
            const { data: existingEvt } = await supabase.from('screenshot_events').select('*').limit(1).maybeSingle();
            if (existingEvt) {
              targetId = existingEvt.id;
              memoryEvent = { ...memoryEvent, ...existingEvt, ...updateData };
              
              const { data: updated, error } = await supabase
                .from('screenshot_events')
                .update(updateData)
                .eq('id', targetId)
                .select()
                .maybeSingle();

              if (!error && updated) {
                memoryEvent = { ...memoryEvent, ...updated };
              }
            } else {
              // Insert seed record with updateData
              const seedEvt = { ...memoryEvent, ...updateData };
              const { data: inserted, error } = await supabase
                .from('screenshot_events')
                .insert([seedEvt])
                .select()
                .maybeSingle();

              if (!error && inserted) {
                memoryEvent = { ...memoryEvent, ...inserted };
              }
            }
          } catch (dbErr) {
            console.warn('[Screenshot API] Supabase update failed, using in-memory state:', dbErr);
          }
        }

        const effectivePts = memoryEvent.submission_points !== undefined ? Number(memoryEvent.submission_points) : getSavedSubmissionPoints();

        return res.status(200).json({
          success: true,
          event: {
            ...memoryEvent,
            submission_points: effectivePts,
            is_voting_active: memoryEvent.status === 'voting_active'
          }
        });
      }

      // ADMIN: TALLY VOTES & AWARD WINNER POINTS (+50, +40, +30, +20, +10)
      if (action === 'admin-tally-points') {
        const { adminName, adminId } = req.body;

        let subs: any[] = [];
        let votes: any[] = [];

        if (supabase) {
          const { data: s } = await supabase.from('screenshot_submissions').select('*').eq('is_selected', true);
          const { data: v } = await supabase.from('screenshot_votes').select('*');
          subs = s || [];
          votes = v || [];
        } else {
          subs = memorySubmissions.filter(s => s.is_selected);
          votes = memoryVotes;
        }

        // Count votes per submission
        const voteMap: Record<string, number> = {};
        votes.forEach(v => {
          voteMap[v.submission_id] = (voteMap[v.submission_id] || 0) + 1;
        });

        const rankedSubs = subs.map(s => ({
          ...s,
          voteCount: voteMap[s.id] || 0
        })).sort((a, b) => b.voteCount - a.voteCount);

        const rewardScale = [50, 40, 30, 20, 10];
        const awardedResults: any[] = [];

        for (let i = 0; i < Math.min(5, rankedSubs.length); i++) {
          const sub = rankedSubs[i];
          const pts = rewardScale[i];
          const rankName = i === 0 ? '1st Place' : i === 1 ? '2nd Place' : i === 2 ? '3rd Place' : i === 3 ? '4th Place' : '5th Place';

          if (sub.user_team && sub.user_team !== 'none' && pts > 0) {
            const notes = `__META_START__${JSON.stringify({ userNotes: `Bingo / Screenshot Contest ${rankName} Winner (${sub.user_name}) - ${sub.game_name}` })}__META_END__`;

            if (supabase) {
              await supabase.from('submissions').insert([{
                user_id: sub.user_id,
                game_name: `Screenshot Contest ${rankName} (+${pts} pts)`,
                platform: 'Bingo Points',
                points: pts,
                calculated_score: pts,
                status: 'verified',
                notes: notes,
                created_at: new Date().toISOString()
              }]);
            }

            awardedResults.push({
              rank: rankName,
              user: sub.user_name,
              team: sub.user_team,
              votes: sub.voteCount,
              points: pts
            });
          }
        }

        // Set event status to concluded
        if (supabase) {
          await supabase.from('screenshot_events').update({ status: 'concluded' }).eq('id', memoryEvent.id);
        } else {
          memoryEvent.status = 'concluded';
        }

        return res.status(200).json({
          success: true,
          message: 'Points successfully awarded to top 5 winning teams!',
          awardedResults
        });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Error in /api/screenshots handler:', err);
    return res.status(500).json({ error: err.message || 'Server error handling screenshot request' });
  }
}
