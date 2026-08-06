import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// In-memory fallback for local dev when Supabase is not connected
let memoryEvent: any = {
  id: 'evt_screenshot_01',
  title: 'Screenshot Showcase & Contest',
  description: 'Submit up to 10 screenshots from Steam or other platforms. Mark 1 for voting!',
  status: 'submissions_open', // 'draft' | 'submissions_open' | 'voting_active' | 'concluded'
  is_admin_only: true,
  max_submissions_per_user: 10,
  created_at: new Date().toISOString()
};

let memorySubmissions: any[] = [];
let memoryVotes: any[] = [];
let memoryComments: any[] = [];

export default async function handler(req: Request, res: Response) {
  const method = req.method;
  const action = req.query.action || req.body?.action || 'get';

  try {
    if (method === 'GET') {
      // 1. Get Event, Submissions, Votes, Comments
      if (supabase) {
        let { data: evt } = await supabase.from('screenshot_events').select('*').limit(1).maybeSingle();
        if (!evt) {
          // seed event
          const { data: newEvt } = await supabase.from('screenshot_events').insert([memoryEvent]).select().single();
          evt = newEvt || memoryEvent;
        }

        const { data: subs } = await supabase.from('screenshot_submissions').select('*').order('created_at', { ascending: false });
        const { data: votes } = await supabase.from('screenshot_votes').select('*');
        const { data: comments } = await supabase.from('screenshot_comments').select('*').order('created_at', { ascending: true });

        return res.status(200).json({
          event: evt || memoryEvent,
          submissions: subs || [],
          votes: votes || [],
          comments: comments || []
        });
      } else {
        return res.status(200).json({
          event: memoryEvent,
          submissions: memorySubmissions,
          votes: memoryVotes,
          comments: memoryComments
        });
      }
    }

    if (method === 'POST') {
      // SUBMIT SCREENSHOT (+20 pts to user's team)
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
            created_at: new Date().toISOString()
          };

          const { data: inserted, error } = await supabase.from('screenshot_submissions').insert([newSub]).select().single();
          if (error) throw error;

          // Award +20 points to user's team
          if (userTeam && userTeam !== 'none') {
            await supabase.from('submissions').insert([{
              user_id: userId,
              game_name: 'Screenshot Contest Submission (+20 pts)',
              platform: 'Screenshot Event',
              points: 20,
              calculated_score: 20,
              status: 'verified',
              notes: `__META_START__${JSON.stringify({ userNotes: `Submitted screenshot for ${gameName || 'Game'}` })}__META_END__`,
              created_at: new Date().toISOString()
            }]);

            // Sync user's profile points if available
            const { data: userSubs } = await supabase
              .from('submissions')
              .select('points, calculated_score, game_name')
              .or(`user_id.eq.${userId},user_id.eq.discord_${userId}`)
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
              .or(`steamid.eq.${userId},discord_id.eq.${userId},id.eq.${userId}`);
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

      // VOTE FOR SCREENSHOT
      if (action === 'vote') {
        const { submissionId, userId, eventStatus } = req.body;
        
        if (eventStatus !== 'voting_active' && memoryEvent.status !== 'voting_active') {
          return res.status(400).json({ error: "You can't vote for this yet! Voting period is not currently active." });
        }

        if (!submissionId || !userId) {
          return res.status(400).json({ error: 'Missing submissionId or userId' });
        }

        if (supabase) {
          // Check if submission belongs to user
          const { data: targetSub } = await supabase.from('screenshot_submissions').select('user_id, is_selected').eq('id', submissionId).single();
          if (!targetSub) return res.status(404).json({ error: 'Submission not found' });

          if (targetSub.user_id === userId) {
            return res.status(400).json({ error: 'You cannot vote for your own screenshot!' });
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
          if (targetSub.user_id === userId) return res.status(400).json({ error: 'You cannot vote for your own screenshot!' });

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

      // ADMIN: UPDATE SUBMISSION (edit caption, game_name, or force is_spoiler)
      if (action === 'admin-update-submission') {
        const { submissionId, caption, gameName, isSpoiler } = req.body;

        if (supabase) {
          const { data: updated, error } = await supabase
            .from('screenshot_submissions')
            .update({
              caption: caption,
              game_name: gameName,
              is_spoiler: Boolean(isSpoiler)
            })
            .eq('id', submissionId)
            .select()
            .single();

          if (error) throw error;
          return res.status(200).json({ success: true, submission: updated });
        } else {
          memorySubmissions = memorySubmissions.map(s => s.id === submissionId ? {
            ...s,
            caption: caption !== undefined ? caption : s.caption,
            game_name: gameName !== undefined ? gameName : s.game_name,
            is_spoiler: isSpoiler !== undefined ? Boolean(isSpoiler) : s.is_spoiler
          } : s);
          return res.status(200).json({ success: true });
        }
      }

      // ADMIN: DELETE SUBMISSION
      if (action === 'admin-delete-submission') {
        const { submissionId } = req.body;

        if (supabase) {
          await supabase.from('screenshot_comments').delete().eq('submission_id', submissionId);
          await supabase.from('screenshot_votes').delete().eq('submission_id', submissionId);
          await supabase.from('screenshot_submissions').delete().eq('id', submissionId);
          return res.status(200).json({ success: true });
        } else {
          memorySubmissions = memorySubmissions.filter(s => s.id !== submissionId);
          memoryVotes = memoryVotes.filter(v => v.submission_id !== submissionId);
          memoryComments = memoryComments.filter(c => c.submission_id !== submissionId);
          return res.status(200).json({ success: true });
        }
      }

      // ADMIN: UPDATE EVENT STATUS ('draft' | 'submissions_open' | 'voting_active' | 'concluded')
      if (action === 'admin-event-status') {
        const { status, isAdminOnly } = req.body;

        if (supabase) {
          const { data: updated, error } = await supabase
            .from('screenshot_events')
            .update({
              status: status,
              is_admin_only: isAdminOnly !== undefined ? Boolean(isAdminOnly) : undefined
            })
            .eq('id', memoryEvent.id)
            .select()
            .single();

          if (error) {
            memoryEvent.status = status;
            if (isAdminOnly !== undefined) memoryEvent.is_admin_only = Boolean(isAdminOnly);
          } else {
            memoryEvent = updated;
          }
          return res.status(200).json({ success: true, event: memoryEvent });
        } else {
          memoryEvent.status = status;
          if (isAdminOnly !== undefined) memoryEvent.is_admin_only = Boolean(isAdminOnly);
          return res.status(200).json({ success: true, event: memoryEvent });
        }
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
