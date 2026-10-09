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
        return Math.max(0, Number(parsed.submission_points));
      }
    }
  } catch (e) {}
  return 20;
}

function saveSubmissionPointsLocally(points: number) {
  try {
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify({ submission_points: Math.max(0, points) }), 'utf8');
  } catch (e) {}
}

function extractSubmissionPoints(evt: any): number {
  // 1. Check description tag in evt
  if (evt?.description && typeof evt.description === 'string') {
    const match = evt.description.match(/<!--SUBMISSION_POINTS:(\d+)-->/);
    if (match && match[1]) {
      return Math.max(0, Number(match[1]));
    }
  }
  // 2. Check local saved file
  const localSaved = getSavedSubmissionPoints();
  if (localSaved !== 20) {
    return localSaved;
  }
  // 3. Check evt.submission_points
  if (evt?.submission_points !== undefined && evt?.submission_points !== null && !isNaN(Number(evt.submission_points))) {
    return Math.max(0, Number(evt.submission_points));
  }
  return localSaved;
}

let persistentDefaultSubmissionPoints = getSavedSubmissionPoints();

// In-memory fallback for local dev when Supabase is not connected
let memoryEvent: any = {
  id: 'evt_screenshot_01',
  title: 'Screenshot Submissions',
  description: `Submit up to 10 screenshots from Steam or other platforms. Mark 1 for voting! <!--SUBMISSION_POINTS:${persistentDefaultSubmissionPoints}-->`,
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

function parseSubmissionCaption(rawCaption: string | null | undefined): {
  caption: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
} {
  const text = rawCaption || '';
  const match = text.match(/<!--APPROVAL:(\{.*?\})-->/);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      const cleanCaption = text.replace(/<!--APPROVAL:\{.*?\}-->/g, '').trim();
      return {
        caption: cleanCaption,
        status: (parsed.status === 'approved' || parsed.status === 'rejected') ? parsed.status : 'pending',
        approved_by: parsed.approved_by || null,
        approved_at: parsed.approved_at || null
      };
    } catch (e) {}
  }
  return {
    caption: text,
    status: 'pending',
    approved_by: null,
    approved_at: null
  };
}

function encodeSubmissionCaption(cleanCaption: string | null | undefined, meta: { status: string; approved_by: string | null; approved_at?: string | null }): string {
  const baseCaption = (cleanCaption || '').replace(/<!--APPROVAL:\{.*?\}-->/g, '').trim();
  const metaTag = `<!--APPROVAL:${JSON.stringify(meta)}-->`;
  return baseCaption ? `${baseCaption} ${metaTag}` : metaTag;
}

function parseCommentContent(rawContent: string | null | undefined): {
  content: string;
  is_edited: boolean;
  edited_at: string | null;
} {
  const text = rawContent || '';
  const match = text.match(/<!--EDITED:(\{.*?\})-->/);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      const cleanContent = text.replace(/<!--EDITED:\{.*?\}-->/g, '').trim();
      return {
        content: cleanContent,
        is_edited: true,
        edited_at: parsed.edited_at || null
      };
    } catch (e) {}
  }
  return {
    content: text,
    is_edited: false,
    edited_at: null
  };
}

function encodeCommentContent(cleanContent: string | null | undefined, meta: { edited_at: string }): string {
  const baseContent = (cleanContent || '').replace(/<!--EDITED:\{.*?\}-->/g, '').trim();
  const metaTag = `<!--EDITED:${JSON.stringify(meta)}-->`;
  return `${baseContent} ${metaTag}`;
}

async function reconcileUserScreenshotPoints(supabaseClient: any, targetUserId: string) {
  if (!supabaseClient || !targetUserId) return;
  try {
    const rawTarget = String(targetUserId).trim();
    const cleanId = rawTarget.startsWith('discord_') ? rawTarget.replace('discord_', '') : rawTarget;
    const prefixedDiscordId = `discord_${cleanId}`;
    
    // Fetch profile to find all associated ID variants (steamid, discord_id, id)
    const { data: userProfiles } = await supabaseClient
      .from('profiles')
      .select('steamid, discord_id, id, team, points')
      .or(`steamid.eq.${cleanId},discord_id.eq.${cleanId},discord_id.eq.${prefixedDiscordId},id.eq.${cleanId}`);

    const userProfile = (userProfiles && userProfiles.length > 0) ? userProfiles[0] : null;

    const candidateIds = new Set<string>([
      rawTarget,
      cleanId,
      prefixedDiscordId,
      userProfile?.steamid ? String(userProfile.steamid) : null,
      userProfile?.discord_id ? String(userProfile.discord_id) : null,
      userProfile?.discord_id ? `discord_${userProfile.discord_id}` : null,
      userProfile?.id ? String(userProfile.id) : null
    ].filter(Boolean) as string[]);

    // 1. Fetch current valid screenshot submissions for this user (only approved ones count toward verified points)
    const { data: allScreenshots } = await supabaseClient
      .from('screenshot_submissions')
      .select('id, user_id, caption');
    
    const userValidScreenshots = (allScreenshots || []).filter((s: any) => {
      const sUid = String(s.user_id || '').trim();
      const sClean = sUid.startsWith('discord_') ? sUid.replace('discord_', '') : sUid;
      if (!candidateIds.has(sUid) && !candidateIds.has(sClean)) return false;
      const parsed = parseSubmissionCaption(s.caption);
      return parsed.status === 'approved';
    });

    const validCount = userValidScreenshots.length;
    const validScreenshotIds = new Set(userValidScreenshots.map((s: any) => String(s.id)));

    // 2. Fetch all submissions for this user from submissions table
    const { data: allSubmissions } = await supabaseClient
      .from('submissions')
      .select('id, user_id, points, calculated_score, notes, platform, game_name, status, created_at')
      .order('created_at', { ascending: false });

    const userAllSubs = (allSubmissions || []).filter((sub: any) => {
      const subUid = String(sub.user_id || '').trim();
      const subClean = subUid.startsWith('discord_') ? subUid.replace('discord_', '') : subUid;
      return candidateIds.has(subUid) || candidateIds.has(subClean);
    });

    const userScreenshotPointRows = userAllSubs.filter((sub: any) => {
      const isScreenshot = sub.platform === 'Screenshot Event' ||
        sub.platform === 'Screenshot Points' ||
        sub.game_name === 'Screenshot Points' ||
        (sub.game_name && sub.game_name.includes('Screenshot Submission')) ||
        (sub.game_name && sub.game_name.includes('Screenshot Contest Submission')) ||
        (sub.game_name && sub.game_name.startsWith('Screenshot Submission')) ||
        (sub.game_name && sub.game_name.startsWith('Screenshot Contest'));
      return isScreenshot;
    });

    // If user has more point rows than valid screenshots, delete the excess or orphaned ones
    if (userScreenshotPointRows.length > validCount) {
      const orphanedRows: any[] = [];
      const keptRows: any[] = [];

      for (const row of userScreenshotPointRows) {
        let isOrphan = false;
        if (row.notes) {
          let matchedValid = false;
          for (const sId of Array.from(validScreenshotIds)) {
            if (row.notes.includes(sId)) {
              matchedValid = true;
              break;
            }
          }
          if (!matchedValid) {
            isOrphan = true;
          }
        } else {
          isOrphan = true;
        }
        if (isOrphan) {
          orphanedRows.push(row);
        } else {
          keptRows.push(row);
        }
      }

      const excessCount = (orphanedRows.length + keptRows.length) - validCount;
      const toDelete = [...orphanedRows];
      if (toDelete.length < excessCount) {
        toDelete.push(...keptRows.slice(0, excessCount - toDelete.length));
      }

      const deleteIds = toDelete.map(r => r.id).filter(Boolean);
      if (deleteIds.length > 0) {
        await supabaseClient.from('submissions').delete().in('id', deleteIds);
      }
    }

    // 3. Recalculate profile points from remaining verified submissions + adjustments
    // Refetch verified subs to be 100% accurate
    const { data: updatedSubmissions } = await supabaseClient
      .from('submissions')
      .select('id, user_id, points, calculated_score, notes, platform, game_name, status, created_at')
      .order('created_at', { ascending: false });

    const remainingUserSubs = (updatedSubmissions || []).filter((sub: any) => {
      const subUid = String(sub.user_id || '').trim();
      const subClean = subUid.startsWith('discord_') ? subUid.replace('discord_', '') : subUid;
      const isApproved = sub.status === 'verified' || sub.status === 'approved';
      return (candidateIds.has(subUid) || candidateIds.has(subClean)) && isApproved && sub.game_name !== 'Event Update';
    });

    // 4. Also fetch adjustments
    const { data: adjustments } = await supabaseClient
      .from('team_adjustments')
      .select('points, user_id');

    let userAdjPoints = 0;
    (adjustments || []).forEach((adj: any) => {
      const adjUid = String(adj.user_id || '').trim();
      const adjClean = adjUid.startsWith('discord_') ? adjUid.replace('discord_', '') : adjUid;
      if (candidateIds.has(adjUid) || candidateIds.has(adjClean)) {
        userAdjPoints += Math.round(Number(adj.points) || 0);
      }
    });

    let newTotal = userAdjPoints;
    let screenshotCountSeen = 0;
    for (const s of remainingUserSubs) {
      const isScreenshot = s.platform === 'Screenshot Event' ||
        s.platform === 'Screenshot Points' ||
        s.game_name === 'Screenshot Points' ||
        (s.game_name && s.game_name.includes('Screenshot Submission')) ||
        (s.game_name && s.game_name.includes('Screenshot Contest Submission')) ||
        (s.game_name && s.game_name.startsWith('Screenshot Submission')) ||
        (s.game_name && s.game_name.startsWith('Screenshot Contest'));

      if (isScreenshot) {
        if (screenshotCountSeen >= validCount) continue;
        screenshotCountSeen++;
      }

      const pts = Number(s.points !== undefined && s.points !== null ? s.points : s.calculated_score) || 0;
      newTotal += Math.round(pts);
    }

    // Update profiles table for all candidate IDs
    if (userProfile?.id) {
      await supabaseClient.from('profiles').update({ points: newTotal }).eq('id', userProfile.id);
    }
    if (userProfile?.steamid) {
      await supabaseClient.from('profiles').update({ points: newTotal }).eq('steamid', userProfile.steamid);
    }
    if (userProfile?.discord_id) {
      await supabaseClient.from('profiles').update({ points: newTotal }).eq('discord_id', userProfile.discord_id);
    }
    if (cleanId) {
      await supabaseClient.from('profiles').update({ points: newTotal }).eq('steamid', cleanId);
      await supabaseClient.from('profiles').update({ points: newTotal }).eq('discord_id', cleanId);
    }
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
        const cleanQueryId = queryUserId?.startsWith('discord_') ? queryUserId.replace('discord_', '') : queryUserId;
        const candidateUserIds = Array.from(new Set([queryUserId, cleanQueryId, `discord_${cleanQueryId}`].filter(Boolean))) as string[];

        if (supabase && candidateUserIds.length > 0) {
          const { data: dbNotifs } = await supabase
            .from('notifications')
            .select('*')
            .in('user_id', candidateUserIds)
            .order('created_at', { ascending: false })
            .limit(30);

          let formatted: any[] = [];
          if (dbNotifs && dbNotifs.length > 0) {
            formatted = dbNotifs.map((n: any) => {
              let parsedMeta: any = {};
              if (n.message && typeof n.message === 'string') {
                const match = n.message.match(/<!--META:(.*?)-->/);
                if (match && match[1]) {
                  try {
                    parsedMeta = JSON.parse(match[1]);
                  } catch {}
                }
              }
              const cleanMessage = n.message ? n.message.replace(/<!--META:.*?-->/g, '').trim() : '';
              return {
                ...n,
                ...parsedMeta,
                id: n.id,
                title: n.title,
                message: cleanMessage,
                content: parsedMeta.content || cleanMessage,
                actor_name: parsedMeta.actor_name || parsedMeta.userName || 'Member',
                actor_avatar: parsedMeta.actor_avatar || parsedMeta.userAvatar || '',
                game_name: parsedMeta.game_name || parsedMeta.gameName || 'Screenshot',
                submission_id: parsedMeta.submission_id || parsedMeta.submissionId,
                submissionId: parsedMeta.submission_id || parsedMeta.submissionId,
                image_url: parsedMeta.image_url || parsedMeta.imageUrl || '',
                imageUrl: parsedMeta.image_url || parsedMeta.imageUrl || '',
                type: parsedMeta.type || (n.title?.includes('Comment') ? 'screenshot_comment' : (n.title?.includes('Approved') ? 'screenshot_approved' : 'general')),
                is_read: n.read ?? false
              };
            });
          }

          // Check if user has any approved screenshot submissions not yet covered by a notification
          try {
            const { data: userSubs } = await supabase
              .from('screenshot_submissions')
              .select('*')
              .in('user_id', candidateUserIds);

            if (userSubs && Array.isArray(userSubs)) {
              userSubs.forEach((sub: any) => {
                const parsed = parseSubmissionCaption(sub.caption);
                const isApproved = parsed.status === 'approved' || sub.status === 'approved';
                if (isApproved) {
                  const alreadyPresent = formatted.some((f: any) => 
                    String(f.submission_id || f.submissionId) === String(sub.id) && f.type === 'screenshot_approved'
                  );
                  if (!alreadyPresent) {
                    formatted.unshift({
                      id: `approved_sub_${sub.id}`,
                      user_id: sub.user_id,
                      type: 'screenshot_approved',
                      submission_id: sub.id,
                      submissionId: sub.id,
                      game_name: sub.game_name || 'Screenshot Submission',
                      gameName: sub.game_name || 'Screenshot Submission',
                      image_url: sub.image_url || '',
                      imageUrl: sub.image_url || '',
                      title: 'Screenshot Submission Approved',
                      message: `Your screenshot for ${sub.game_name || 'Screenshot Submission'} has been approved!`,
                      content: `Your screenshot for ${sub.game_name || 'Screenshot Submission'} has been approved!`,
                      points: sub.points || persistentDefaultSubmissionPoints || 20,
                      created_at: parsed.approved_at || sub.created_at || new Date().toISOString(),
                      read: false,
                      is_read: false
                    });
                  }
                }
              });
            }
          } catch (e) {
            console.warn('Error checking approved submissions for notifications:', e);
          }

          return res.status(200).json({ notifications: formatted });
        }

        const filtered = candidateUserIds.length > 0
          ? memoryNotifications.filter(n => candidateUserIds.includes(String(n.user_id)))
          : memoryNotifications;

        // Also check memory submissions for approved submissions of this user
        memorySubmissions.forEach(sub => {
          const rawUid = String(sub.user_id || '').trim();
          const cleanUid = rawUid.replace('discord_', '');
          const isUser = candidateUserIds.some(cid => cid === rawUid || cid === cleanUid);
          if (isUser && sub.status === 'approved') {
            const alreadyPresent = filtered.some(f => String(f.submission_id || f.submissionId) === String(sub.id) && f.type === 'screenshot_approved');
            if (!alreadyPresent) {
              filtered.unshift({
                id: `approved_sub_${sub.id}`,
                user_id: sub.user_id,
                type: 'screenshot_approved',
                submission_id: sub.id,
                submissionId: sub.id,
                game_name: sub.game_name || 'Screenshot Submission',
                gameName: sub.game_name || 'Screenshot Submission',
                image_url: sub.image_url || '',
                imageUrl: sub.image_url || '',
                title: 'Screenshot Submission Approved',
                message: `Your screenshot for ${sub.game_name || 'Screenshot Submission'} has been approved!`,
                content: `Your screenshot for ${sub.game_name || 'Screenshot Submission'} has been approved!`,
                points: sub.points || persistentDefaultSubmissionPoints || 20,
                created_at: sub.approved_at || sub.created_at || new Date().toISOString(),
                read: false,
                is_read: false
              });
            }
          }
        });

        return res.status(200).json({ notifications: filtered });
      }

      // 1. Get Event, Submissions, Votes, Comments
      if (supabase) {
        // Fetch competition events from events table first to tie screenshot contest to active event
        let compEvents: any[] = [];
        let activeCompEvent: any = null;
        try {
          const { data: allEvts } = await supabase
            .from('events')
            .select('*')
            .order('start_date', { ascending: false });
          compEvents = allEvts || [];
          activeCompEvent = compEvents.find(e => e.is_active) || null;
        } catch (e) {
          console.warn('Failed to load competition events in screenshot api:', e);
        }

        const savedPts = getSavedSubmissionPoints();
        let evt: any = null;

        if (activeCompEvent) {
          // Look up screenshot event record corresponding to this active competition event
          const { data: se } = await supabase.from('screenshot_events').select('*').eq('id', activeCompEvent.id).maybeSingle();
          if (se) {
            evt = se;
          } else {
            // Check if legacy row exists or create new row for this event
            const newEvt = {
              id: activeCompEvent.id,
              title: `${activeCompEvent.title || 'Competition Event'} - Screenshot Submissions`,
              description: `Submit up to 10 screenshots from Steam or other platforms. Mark one of them for voting! <!--SUBMISSION_POINTS:${savedPts}-->`,
              status: 'submissions_open',
              is_admin_only: true,
              max_submissions_per_user: 10,
              created_at: new Date().toISOString()
            };
            try {
              const { data: insertedEvt } = await supabase.from('screenshot_events').upsert([newEvt]).select().maybeSingle();
              evt = insertedEvt || newEvt;
            } catch (e) {
              evt = newEvt;
            }
          }
        } else {
          // No active event currently in events table
          const { data: latestEvt } = await supabase.from('screenshot_events').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
          evt = latestEvt || {
            ...memoryEvent,
            status: 'concluded',
            title: 'Screenshot Submissions (No Active Event)'
          };
        }

        const currentPoints = extractSubmissionPoints(evt);
        persistentDefaultSubmissionPoints = currentPoints;
        saveSubmissionPointsLocally(currentPoints);

        if (evt) {
          memoryEvent = {
            ...memoryEvent,
            ...evt,
            submission_points: currentPoints
          };
        }

        const { data: subs } = await supabase.from('screenshot_submissions').select('*').order('created_at', { ascending: false });
        const { data: votes } = await supabase.from('screenshot_votes').select('*');
        const { data: comments } = await supabase.from('screenshot_comments').select('*').order('created_at', { ascending: true });

        // Load profiles and user_event_teams to ensure submissions strictly reflect user's current live team (or unassigned/none)
        const { data: profiles } = await supabase.from('profiles').select('steamid, discord_id, id, team');
        const { data: eventTeamsData } = activeCompEvent ? await supabase
          .from('user_event_teams')
          .select('steamid, team')
          .eq('event_id', activeCompEvent.id) : { data: [] };

        const eventTeamMap = new Map<string, string>();
        (eventTeamsData || []).forEach((row: any) => {
          if (row.steamid && row.team) {
            const t = row.team === 'none' ? 'none' : row.team;
            const sid = String(row.steamid).trim();
            const cleanSid = sid.replace('discord_', '');
            eventTeamMap.set(sid, t);
            eventTeamMap.set(cleanSid, t);
            eventTeamMap.set(`discord_${cleanSid}`, t);
          }
        });

        const profileTeamMap = new Map<string, string>();
        (profiles || []).forEach((p: any) => {
          const t = (!p.team || p.team === 'none') ? 'none' : p.team;
          if (p.steamid) profileTeamMap.set(String(p.steamid).trim(), t);
          if (p.discord_id) {
            const rawDid = String(p.discord_id).trim();
            const cleanDid = rawDid.replace('discord_', '');
            profileTeamMap.set(rawDid, t);
            profileTeamMap.set(cleanDid, t);
            profileTeamMap.set(`discord_${cleanDid}`, t);
          }
          if (p.id) profileTeamMap.set(String(p.id).trim(), t);
        });

        // Ensure at most ONE submission per user has is_selected: true per event (scoped by event)
        // and parse approval metadata from caption
        const seenSelectedPerEvent = new Set<string>();
        const sanitizedSubs = (subs || []).map((sub: any) => {
          const parsed = parseSubmissionCaption(sub.caption);
          const effectiveStatus = (parsed.status === 'rejected' || sub.status === 'rejected')
            ? 'rejected'
            : (parsed.status === 'approved' || sub.status === 'approved')
              ? 'approved'
              : 'pending';

          const rawUid = String(sub.user_id || '').trim();
          const cleanUid = rawUid.startsWith('discord_') ? rawUid.replace('discord_', '') : rawUid;
          const candidateKeys = [rawUid, cleanUid, `discord_${cleanUid}`];

          // Determine current reflected team:
          // For submissions in the active competition event (or if no event_id or event is active),
          // reflect the user's current live team from user_event_teams or profiles table
          let liveTeam = sub.user_team || 'none';
          const isCurrentActive = !sub.event_id || (activeCompEvent && String(sub.event_id) === String(activeCompEvent.id));
          if (isCurrentActive) {
            for (const k of candidateKeys) {
              if (eventTeamMap.has(k) && eventTeamMap.get(k) !== 'none') {
                liveTeam = eventTeamMap.get(k) || 'none';
                break;
              }
              if (profileTeamMap.has(k) && profileTeamMap.get(k) !== 'none') {
                liveTeam = profileTeamMap.get(k) || 'none';
                break;
              }
            }
            // If the database column has an outdated team, sync it asynchronously
            if (supabase && sub.id && sub.user_team !== liveTeam) {
              supabase.from('screenshot_submissions').update({ user_team: liveTeam }).eq('id', sub.id).then();
            }
          }

          const processedSub = {
            ...sub,
            user_team: liveTeam,
            caption: parsed.caption,
            status: effectiveStatus,
            approved_by: parsed.approved_by,
            approved_at: parsed.approved_at
          };

          if (!processedSub.is_selected) return processedSub;
          // If rejected, it cannot be selected for voting
          if (effectiveStatus === 'rejected') {
            return { ...processedSub, is_selected: false };
          }
          const subUidForSelection = String(processedSub.user_id || '').trim();
          const cleanSubUidForSelection = subUidForSelection.startsWith('discord_') ? subUidForSelection.replace('discord_', '') : subUidForSelection;
          const eventScopeId = String(processedSub.event_id || 'active');
          const key1 = `${eventScopeId}_${subUidForSelection}`;
          const key2 = `${eventScopeId}_${cleanSubUidForSelection}`;

          if (seenSelectedPerEvent.has(key1) || seenSelectedPerEvent.has(key2)) {
            if (supabase && processedSub.id) {
              supabase.from('screenshot_submissions').update({ is_selected: false }).eq('id', processedSub.id).then();
            }
            return { ...processedSub, is_selected: false };
          }
          seenSelectedPerEvent.add(key1);
          seenSelectedPerEvent.add(key2);
          return processedSub;
        });

        const sanitizedComments = (comments || []).map((c: any) => {
          const parsed = parseCommentContent(c.content);
          return {
            ...c,
            content: parsed.content,
            is_edited: parsed.is_edited || Boolean(c.is_edited),
            edited_at: parsed.edited_at || c.edited_at || null
          };
        });

        const eventData = evt || memoryEvent;
        const isVotingActive = eventData.status === 'voting_active' || Boolean(eventData.is_voting_active);
        const submissionsAllowed = Boolean(activeCompEvent) && !isVotingActive && eventData.status !== 'concluded';

        return res.status(200).json({
          event: {
            ...eventData,
            submission_points: currentPoints,
            is_voting_active: isVotingActive,
            has_active_event: Boolean(activeCompEvent),
            active_event_id: activeCompEvent?.id || null,
            active_event_title: activeCompEvent?.title || null,
            submissions_allowed: submissionsAllowed
          },
          events: compEvents,
          activeEvent: activeCompEvent,
          submissions: sanitizedSubs,
          votes: votes || [],
          comments: sanitizedComments
        });
      } else {
        const currentPoints = extractSubmissionPoints(memoryEvent);
        persistentDefaultSubmissionPoints = currentPoints;
        saveSubmissionPointsLocally(currentPoints);

        const memorySubsProcessed = memorySubmissions.map(s => ({
          ...s,
          status: s.status || 'pending',
          approved_by: s.approved_by || null,
          approved_at: s.approved_at || null
        }));

        const memoryCommentsProcessed = memoryComments.map(c => {
          const parsed = parseCommentContent(c.content);
          return {
            ...c,
            content: parsed.content,
            is_edited: parsed.is_edited || Boolean(c.is_edited),
            edited_at: parsed.edited_at || c.edited_at || null
          };
        });

        return res.status(200).json({
          event: {
            ...memoryEvent,
            submission_points: currentPoints,
            is_voting_active: memoryEvent.status === 'voting_active',
            has_active_event: true,
            active_event_id: memoryEvent.id,
            active_event_title: memoryEvent.title,
            submissions_allowed: memoryEvent.status !== 'voting_active' && memoryEvent.status !== 'concluded'
          },
          events: [memoryEvent],
          activeEvent: memoryEvent,
          submissions: memorySubsProcessed,
          votes: memoryVotes,
          comments: memoryCommentsProcessed
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

        const rawUid = String(userId).trim();
        const cleanUid = rawUid.startsWith('discord_') ? rawUid.replace('discord_', '') : rawUid;
        const candidateIds = Array.from(new Set([rawUid, cleanUid, `discord_${cleanUid}`]));

        // 1. Verify that a competition event is currently active
        let activeCompEvent: any = null;
        if (supabase) {
          try {
            const { data: actEvts } = await supabase.from('events').select('*').eq('is_active', true);
            activeCompEvent = (actEvts && actEvts.length > 0) ? actEvts[0] : null;
          } catch (e) {
            console.warn('Error checking active competition event in screenshot submit:', e);
          }
        } else {
          activeCompEvent = memoryEvent;
        }

        if (!activeCompEvent) {
          return res.status(400).json({
            error: 'No active competition event. Screenshot submissions are closed until the next event starts in the Events panel.'
          });
        }

        // Automatic submission lockout once countdown reaches zero
        const now = Date.now();
        const compEndTime = activeCompEvent.end_date ? new Date(activeCompEvent.end_date).getTime() : 0;
        if (compEndTime > 0 && now >= compEndTime) {
          return res.status(403).json({
            error: 'Event countdown has ended. Screenshot submissions are automatically locked.'
          });
        }

        // 2. Verify that voting is NOT active (submissions are blocked once voting begins until next event)
        let isVotingActive = false;
        let eventStatus = 'submissions_open';
        if (supabase) {
          try {
            const { data: se } = await supabase.from('screenshot_events').select('*').eq('id', activeCompEvent.id).maybeSingle();
            if (se) {
              eventStatus = se.status;
              isVotingActive = se.status === 'voting_active' || Boolean(se.is_voting_active);
            }
          } catch (e) {}
        } else {
          eventStatus = memoryEvent.status;
          isVotingActive = memoryEvent.status === 'voting_active';
        }

        if (isVotingActive || eventStatus === 'voting_active') {
          return res.status(400).json({
            error: 'The voting period is currently active. Screenshot submissions are closed until the next event starts.'
          });
        }

        if (eventStatus === 'concluded') {
          return res.status(400).json({
            error: 'This screenshot submission event has concluded. Submissions will reopen when the next competition event begins.'
          });
        }

        // 3. Check submission count for this user specifically for this active event
        let userSubCount = 0;
        if (supabase) {
          const { data: existing } = await supabase
            .from('screenshot_submissions')
            .select('id, is_selected')
            .eq('event_id', activeCompEvent.id)
            .in('user_id', candidateIds);

          userSubCount = (existing || []).length;
          if (userSubCount >= 10) {
            return res.status(400).json({ error: 'You have reached the maximum limit of 10 screenshot submissions for this event!' });
          }

          const shouldBeSelected = Boolean(isSelected);

          // If user specifically marked this as for voting, unselect all other submissions by this user for this event
          if (shouldBeSelected) {
            await supabase
              .from('screenshot_submissions')
              .update({ is_selected: false })
              .eq('event_id', activeCompEvent.id)
              .in('user_id', candidateIds);
          }

          const initialCaption = encodeSubmissionCaption(caption || '', {
            status: 'pending',
            approved_by: null,
            approved_at: null
          });

          let effectiveSubmitterTeam = userTeam || 'none';
          const cleanUId = String(userId).replace('discord_', '');
          
          // Check user_event_teams for active event first
          const { data: uetRow } = await supabase
            .from('user_event_teams')
            .select('team')
            .eq('event_id', activeCompEvent.id)
            .or(`steamid.eq.${cleanUId},steamid.eq.${userId},steamid.eq.discord_${cleanUId}`)
            .maybeSingle();

          if (uetRow?.team && uetRow.team !== 'none') {
            effectiveSubmitterTeam = uetRow.team;
          } else {
            const { data: creatorProf } = await supabase
              .from('profiles')
              .select('team')
              .or(`steamid.eq.${cleanUId},steamid.eq.${userId},discord_id.eq.${cleanUId},id.eq.${cleanUId}`)
              .maybeSingle();
            if (creatorProf?.team && creatorProf.team !== 'none') {
              effectiveSubmitterTeam = creatorProf.team;
            }
          }

          const newSub: Record<string, any> = {
            event_id: activeCompEvent.id,
            user_id: userId,
            user_name: userName || 'Anonymous User',
            user_avatar: userAvatar || '',
            user_team: effectiveSubmitterTeam,
            image_url: imageUrl,
            caption: initialCaption,
            game_name: gameName || 'Steam Game',
            is_spoiler: Boolean(isSpoiler),
            is_selected: shouldBeSelected, // Strictly follow user's choice: only selected if user marked it!
            created_at: new Date().toISOString()
          };

          const { data: inserted, error } = await supabase.from('screenshot_submissions').insert([newSub]).select().single();
          if (error) throw error;

          // Screenshot contest submissions live exclusively in screenshot_submissions table.
          // Points are only awarded if and when an admin approves the submission.
          // Do NOT insert a pending entry into the submissions table on upload so it does not pollute My Submissions.

          return res.status(200).json({
            success: true,
            submission: {
              ...inserted,
              caption: caption || '',
              status: 'pending',
              approved_by: null,
              approved_at: null
            }
          });
        } else {
          userSubCount = memorySubmissions.filter(s => s.event_id === activeCompEvent.id && candidateIds.includes(String(s.user_id))).length;
          if (userSubCount >= 10) {
            return res.status(400).json({ error: 'You have reached the maximum limit of 10 screenshot submissions for this event!' });
          }

          const shouldBeSelected = Boolean(isSelected);

          if (shouldBeSelected) {
            memorySubmissions = memorySubmissions.map(s => (s.event_id === activeCompEvent.id && candidateIds.includes(String(s.user_id))) ? { ...s, is_selected: false } : s);
          }

          const newSub = {
            id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            event_id: activeCompEvent.id,
            user_id: userId,
            user_name: userName || 'Anonymous User',
            user_avatar: userAvatar || '',
            user_team: userTeam || 'none',
            image_url: imageUrl,
            caption: caption || '',
            game_name: gameName || 'Steam Game',
            is_spoiler: Boolean(isSpoiler),
            is_selected: shouldBeSelected,
            status: 'pending',
            approved_by: null,
            approved_at: null,
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

        const rawUid = String(userId).trim();
        const cleanUid = rawUid.startsWith('discord_') ? rawUid.replace('discord_', '') : rawUid;
        const candidateIds = [rawUid, cleanUid, `discord_${cleanUid}`];

        if (supabase) {
          const { data: targetSub } = await supabase
            .from('screenshot_submissions')
            .select('id, user_id, event_id, is_selected')
            .eq('id', submissionId)
            .maybeSingle();

          if (!targetSub) return res.status(404).json({ error: 'Submission not found' });

          if (targetSub.user_id) {
            candidateIds.push(String(targetSub.user_id).trim());
            const tClean = String(targetSub.user_id).replace('discord_', '');
            candidateIds.push(tClean, `discord_${tClean}`);
          }
          const uniqueCandidateIds = Array.from(new Set(candidateIds.filter(Boolean)));

          const willSelect = !targetSub.is_selected;

          // Always unselect ALL existing submissions for this user in this event scope first
          let unselectQuery = supabase
            .from('screenshot_submissions')
            .update({ is_selected: false })
            .in('user_id', uniqueCandidateIds);
          if (targetSub.event_id) {
            unselectQuery = unselectQuery.eq('event_id', targetSub.event_id);
          }
          await unselectQuery;

          let updated = null;
          if (willSelect) {
            // Set ONLY this specific submission to true
            const { data, error } = await supabase
              .from('screenshot_submissions')
              .update({ is_selected: true })
              .eq('id', submissionId)
              .select()
              .single();
            if (error) throw error;
            updated = data;
          } else {
            updated = { ...targetSub, is_selected: false };
          }
          return res.status(200).json({ success: true, submission: updated, is_selected: willSelect });
        } else {
          const targetSub = memorySubmissions.find(s => s.id === submissionId);
          const willSelect = targetSub ? !targetSub.is_selected : true;
          memorySubmissions = memorySubmissions.map(s => {
            if (candidateIds.includes(String(s.user_id))) {
              return { ...s, is_selected: (s.id === submissionId && willSelect) };
            }
            return s;
          });
          return res.status(200).json({ success: true, is_selected: willSelect });
        }
      }

      // ADMIN: SET STATUS (Approved, Pending, Rejected)
      if (action === 'admin-set-status') {
        const { submissionId, status } = req.body;
        const adminName = req.body.adminName || req.headers['x-admin-name'] || (req as any).user?.steam_name || (req as any).user?.displayName || 'Admin';
        if (!submissionId || !status) {
          return res.status(400).json({ error: 'Missing submissionId or status' });
        }

        const validStatus: 'approved' | 'pending' | 'rejected' = ['approved', 'pending', 'rejected'].includes(status) ? status : 'approved';

        if (supabase) {
          const { data: targetSub } = await supabase
            .from('screenshot_submissions')
            .select('*')
            .eq('id', submissionId)
            .maybeSingle();

          if (!targetSub) return res.status(404).json({ error: 'Submission not found' });

          const parsed = parseSubmissionCaption(targetSub.caption);
          const effectiveAdmin = validStatus === 'approved' ? String(adminName) : null;
          const effectiveApprovedAt = validStatus === 'approved' ? new Date().toISOString() : null;

          if (validStatus === 'rejected') {
            const newCaption = encodeSubmissionCaption(parsed.caption, {
              status: 'rejected',
              approved_by: effectiveAdmin,
              approved_at: effectiveApprovedAt
            });

            await supabase
              .from('screenshot_submissions')
              .update({ caption: newCaption, is_selected: false })
              .eq('id', submissionId);

            // Remove linked submission points in submissions table if previously approved
            try {
              await supabase.from('submissions').delete().ilike('notes', `%${submissionId}%`);
            } catch (e) {}

            // Remove votes for this submission if any
            try {
              await supabase.from('screenshot_votes').delete().eq('submission_id', submissionId);
            } catch (e) {}

            if (targetSub.user_id) {
              await reconcileUserScreenshotPoints(supabase, targetSub.user_id);
            }

            return res.status(200).json({
              success: true,
              submission: {
                ...targetSub,
                caption: parsed.caption,
                status: 'rejected',
                is_selected: false,
                approved_by: effectiveAdmin,
                approved_at: effectiveApprovedAt
              }
            });
          }

          const newCaption = encodeSubmissionCaption(parsed.caption, {
            status: validStatus,
            approved_by: effectiveAdmin,
            approved_at: effectiveApprovedAt
          });

          await supabase
            .from('screenshot_submissions')
            .update({ caption: newCaption })
            .eq('id', submissionId);

          let ptsToAward = getSavedSubmissionPoints();
          const { data: currentEvt } = await supabase.from('screenshot_events').select('submission_points').eq('id', memoryEvent.id).maybeSingle();
          if (currentEvt && currentEvt.submission_points !== undefined && currentEvt.submission_points !== null) {
            ptsToAward = Number(currentEvt.submission_points);
          }

          if (validStatus === 'approved') {
            // Verify linked submission points in submissions table
            const { data: existingPoints } = await supabase
              .from('submissions')
              .select('id, status')
              .ilike('notes', `%${submissionId}%`);

            if (existingPoints && existingPoints.length > 0) {
              await supabase.from('submissions').update({ status: 'verified' }).ilike('notes', `%${submissionId}%`);
            } else if (targetSub.user_team && targetSub.user_team !== 'none' && ptsToAward > 0) {
              await supabase.from('submissions').insert([{
                user_id: targetSub.user_id,
                game_name: `Screenshot Submission (+${ptsToAward} pts)`,
                platform: 'Screenshot Event',
                points: ptsToAward,
                calculated_score: ptsToAward,
                status: 'verified',
                notes: `__META_START__${JSON.stringify({ screenshotId: targetSub.id, gameName: targetSub.game_name || 'Game', userNotes: `Submitted screenshot for ${targetSub.game_name || 'Game'}` })}__META_END__`,
                created_at: new Date().toISOString()
              }]);
            }

            // Create approval notification for screenshot owner
            if (targetSub.user_id) {
              const approvalMeta = {
                type: 'screenshot_approved',
                submissionId: targetSub.id,
                submission_id: targetSub.id,
                gameName: targetSub.game_name || 'Screenshot',
                game_name: targetSub.game_name || 'Screenshot',
                imageUrl: targetSub.image_url || '',
                image_url: targetSub.image_url || ''
              };
              const approvalMsg = `Your screenshot submission has been approved! <!--META:${JSON.stringify(approvalMeta)}-->`;
              try {
                await supabase.from('notifications').insert([{
                  user_id: targetSub.user_id,
                  title: 'Screenshot Submission Approved',
                  message: approvalMsg,
                  read: false,
                  created_at: new Date().toISOString()
                }]);
              } catch (notifErr) {
                console.warn('Could not insert approval notification into Supabase:', notifErr);
              }
              memoryNotifications.unshift({
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                user_id: targetSub.user_id,
                type: 'screenshot_approved',
                submissionId: targetSub.id,
                submission_id: targetSub.id,
                gameName: targetSub.game_name || 'Screenshot',
                game_name: targetSub.game_name || 'Screenshot',
                imageUrl: targetSub.image_url || '',
                image_url: targetSub.image_url || '',
                title: 'Screenshot Submission Approved',
                message: 'Your screenshot submission has been approved!',
                created_at: new Date().toISOString(),
                read: false,
                is_read: false
              });
            }
          } else if (validStatus === 'pending') {
            // Revert linked points in submissions table to pending
            await supabase.from('submissions').update({ status: 'pending' }).ilike('notes', `%${submissionId}%`);
          }

          if (targetSub.user_id) {
            await reconcileUserScreenshotPoints(supabase, targetSub.user_id);
          }

          return res.status(200).json({
            success: true,
            submission: {
              ...targetSub,
              caption: parsed.caption,
              status: validStatus,
              approved_by: effectiveAdmin,
              approved_at: effectiveApprovedAt
            }
          });
        } else {
          const effectiveAdmin = validStatus === 'approved' ? String(adminName) : null;
          const effectiveApprovedAt = validStatus === 'approved' ? new Date().toISOString() : null;
          memorySubmissions = memorySubmissions.map(s => s.id === submissionId ? {
            ...s,
            status: validStatus,
            is_selected: validStatus === 'rejected' ? false : s.is_selected,
            approved_by: effectiveAdmin,
            approved_at: effectiveApprovedAt
          } : s);

          if (validStatus === 'approved') {
            const targetSub = memorySubmissions.find(s => s.id === submissionId);
            if (targetSub && targetSub.user_id) {
              const alreadyNotif = memoryNotifications.some(n => 
                String(n.submission_id || n.submissionId) === String(targetSub.id) && n.type === 'screenshot_approved'
              );
              if (!alreadyNotif) {
                memoryNotifications.unshift({
                  id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                  user_id: targetSub.user_id,
                  type: 'screenshot_approved',
                  submission_id: targetSub.id,
                  submissionId: targetSub.id,
                  game_name: targetSub.game_name || 'Screenshot Submission',
                  gameName: targetSub.game_name || 'Screenshot Submission',
                  image_url: targetSub.image_url || '',
                  imageUrl: targetSub.image_url || '',
                  title: 'Screenshot Submission Approved',
                  message: `Your screenshot for ${targetSub.game_name || 'Screenshot Submission'} has been approved!`,
                  content: `Your screenshot for ${targetSub.game_name || 'Screenshot Submission'} has been approved!`,
                  points: targetSub.points || persistentDefaultSubmissionPoints || 20,
                  created_at: new Date().toISOString(),
                  read: false,
                  is_read: false
                });
              }
            }
          }

          return res.status(200).json({
            success: true,
            status: validStatus,
            approved_by: effectiveAdmin,
            approved_at: effectiveApprovedAt
          });
        }
      }

      // VOTE FOR SCREENSHOT
      if (action === 'vote') {
        const { submissionId, userId, eventStatus } = req.body;
        
        let activeCompEvent: any = null;
        if (supabase) {
          try {
            const { data: actEvts } = await supabase.from('events').select('*').eq('is_active', true);
            activeCompEvent = (actEvts && actEvts.length > 0) ? actEvts[0] : null;
          } catch (e) {}
        }
        const targetEventId = activeCompEvent ? activeCompEvent.id : memoryEvent.id;

        let currentStatus = memoryEvent.status;
        if (supabase) {
          const { data: evt } = await supabase.from('screenshot_events').select('status').eq('id', targetEventId).maybeSingle();
          if (evt) currentStatus = evt.status;
        }

        if (currentStatus !== 'voting_active' && eventStatus !== 'voting_active') {
          return res.status(400).json({ 
            title: "Voting is closed right now", 
            error: "Please wait for the Voting Period to be active to vote for your favorite entries!" 
          });
        }

        if (!submissionId || !userId) {
          return res.status(400).json({ error: 'Missing submissionId or userId' });
        }

        const cleanUserId = String(userId).replace('discord_', '');

        if (supabase) {
          // Check if submission belongs to user
          const { data: targetSub } = await supabase.from('screenshot_submissions').select('user_id, is_selected').eq('id', submissionId).single();
          if (!targetSub) return res.status(404).json({ error: 'Submission not found' });

          const subOwnerClean = String(targetSub.user_id || '').replace('discord_', '');
          if (targetSub.user_id === userId || subOwnerClean === cleanUserId) {
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
              event_id: targetEventId,
              submission_id: submissionId,
              user_id: userId,
              created_at: new Date().toISOString()
            }]);
            return res.status(200).json({ success: true, voted: true, message: 'Vote submitted!' });
          }
        } else {
          const targetSub = memorySubmissions.find(s => s.id === submissionId);
          if (!targetSub) return res.status(404).json({ error: 'Submission not found' });

          const subOwnerClean = String(targetSub.user_id || '').replace('discord_', '');
          if (targetSub.user_id === userId || subOwnerClean === cleanUserId) {
            return res.status(400).json({ error: "You can't vote for yourself, silly!" });
          }

          if (!targetSub.is_selected) {
            return res.status(400).json({ error: 'This screenshot is not up for voting!' });
          }

          const existingIndex = memoryVotes.findIndex(v => (v.user_id === userId || String(v.user_id).replace('discord_', '') === cleanUserId) && v.submission_id === submissionId);
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
        let screenshotImg = '';
        if (supabase) {
          const { data: subData } = await supabase
            .from('screenshot_submissions')
            .select('user_id, game_name, image_url')
            .eq('id', submissionId)
            .maybeSingle();
          if (subData) {
            creatorId = subData.user_id;
            gameName = subData.game_name || 'Screenshot';
            screenshotImg = subData.image_url || '';
          }
        } else {
          const subData = memorySubmissions.find(s => s.id === submissionId);
          if (subData) {
            creatorId = subData.user_id;
            gameName = subData.game_name || 'Screenshot';
            screenshotImg = subData.image_url || '';
          }
        }

        // Send alert if commenter is not the creator
        if (creatorId && creatorId !== userId) {
          const metaObj = {
            type: 'screenshot_comment',
            submission_id: submissionId,
            submissionId: submissionId,
            actor_name: userName || 'Someone',
            userName: userName || 'Someone',
            actor_avatar: userAvatar || '',
            userAvatar: userAvatar || '',
            game_name: gameName,
            gameName: gameName,
            content: content.trim(),
            image_url: screenshotImg,
            imageUrl: screenshotImg
          };
          const notifTitle = 'New Comment on your Screenshot';
          const notifMsg = `${userName || 'Someone'} commented on your ${gameName} screenshot: "${content.trim()}" <!--META:${JSON.stringify(metaObj)}-->`;
          const notifCreatedAt = new Date().toISOString();

          if (supabase) {
            try {
              await supabase.from('notifications').insert([{
                user_id: creatorId,
                title: notifTitle,
                message: notifMsg,
                read: false,
                created_at: notifCreatedAt
              }]);
            } catch (err) {
              console.warn('Could not insert into Supabase notifications table, using fallback:', err);
            }
          }
          memoryNotifications.unshift({
            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            user_id: creatorId,
            title: notifTitle,
            message: notifMsg,
            created_at: notifCreatedAt,
            read: false,
            is_read: false,
            ...metaObj
          });
        }

        if (supabase) {
          const { data: inserted, error } = await supabase.from('screenshot_comments').insert([newComment]).select().single();
          if (error) throw error;
          const parsed = parseCommentContent(inserted.content);
          return res.status(200).json({
            success: true,
            comment: {
              ...inserted,
              content: parsed.content,
              is_edited: parsed.is_edited,
              edited_at: parsed.edited_at
            }
          });
        } else {
          const item = { id: 'cmt_' + Date.now(), ...newComment, is_edited: false, edited_at: null };
          memoryComments.push(item);
          return res.status(200).json({ success: true, comment: item });
        }
      }

      // EDIT COMMENT
      if (action === 'edit-comment') {
        const { commentId, userId, content, isAdmin } = req.body;
        if (!commentId || !content?.trim()) {
          return res.status(400).json({ error: 'Comment ID and non-empty content are required' });
        }

        let existingComment: any = null;
        if (supabase) {
          const { data } = await supabase.from('screenshot_comments').select('*').eq('id', commentId).maybeSingle();
          existingComment = data;
        } else {
          existingComment = memoryComments.find(c => String(c.id) === String(commentId));
        }

        if (!existingComment) {
          return res.status(404).json({ error: 'Comment not found' });
        }

        const rawReqUid = String(userId || '').trim();
        const cleanReqUid = rawReqUid.replace('discord_', '');
        const rawCmtUid = String(existingComment.user_id || '').trim();
        const cleanCmtUid = rawCmtUid.replace('discord_', '');

        const isOwner = Boolean(cleanReqUid && (cleanReqUid === cleanCmtUid || rawReqUid === rawCmtUid));
        const userIsAdmin = Boolean(isAdmin || (req as any).user?.is_admin || (req as any).user?.isAdmin);

        if (!isOwner && !userIsAdmin) {
          return res.status(403).json({ error: 'You are not authorized to edit this comment' });
        }

        const editedAt = new Date().toISOString();
        const newEncodedContent = encodeCommentContent(content.trim(), { edited_at: editedAt });

        if (supabase) {
          const { data: updated, error } = await supabase
            .from('screenshot_comments')
            .update({ content: newEncodedContent })
            .eq('id', commentId)
            .select()
            .single();
          if (error) throw error;
          return res.status(200).json({
            success: true,
            comment: {
              ...updated,
              content: content.trim(),
              is_edited: true,
              edited_at: editedAt
            }
          });
        } else {
          memoryComments = memoryComments.map(c => String(c.id) === String(commentId) ? {
            ...c,
            content: content.trim(),
            is_edited: true,
            edited_at: editedAt
          } : c);
          const updated = memoryComments.find(c => String(c.id) === String(commentId));
          return res.status(200).json({ success: true, comment: updated });
        }
      }

      // DELETE COMMENT
      if (action === 'delete-comment') {
        const { commentId, userId, isAdmin } = req.body;
        if (!commentId) {
          return res.status(400).json({ error: 'Comment ID is required' });
        }

        let existingComment: any = null;
        if (supabase) {
          const { data } = await supabase.from('screenshot_comments').select('*').eq('id', commentId).maybeSingle();
          existingComment = data;
        } else {
          existingComment = memoryComments.find(c => String(c.id) === String(commentId));
        }

        if (!existingComment) {
          return res.status(404).json({ error: 'Comment not found' });
        }

        const rawReqUid = String(userId || '').trim();
        const cleanReqUid = rawReqUid.replace('discord_', '');
        const rawCmtUid = String(existingComment.user_id || '').trim();
        const cleanCmtUid = rawCmtUid.replace('discord_', '');

        const isOwner = Boolean(cleanReqUid && (cleanReqUid === cleanCmtUid || rawReqUid === rawCmtUid));
        const userIsAdmin = Boolean(isAdmin || (req as any).user?.is_admin || (req as any).user?.isAdmin);

        if (!isOwner && !userIsAdmin) {
          return res.status(403).json({ error: 'You are not authorized to delete this comment' });
        }

        if (supabase) {
          const { error } = await supabase.from('screenshot_comments').delete().eq('id', commentId);
          if (error) throw error;
        } else {
          memoryComments = memoryComments.filter(c => String(c.id) !== String(commentId));
        }

        return res.status(200).json({ success: true, message: 'Comment deleted successfully' });
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

          if (!targetSub) return res.status(404).json({ error: 'Submission not found' });

          const parsed = parseSubmissionCaption(targetSub.caption);
          const effectiveStatus = (status !== undefined) ? status : parsed.status;
          const effectiveAdmin = (effectiveStatus === 'approved') ? (req.body.adminName || parsed.approved_by || 'Admin') : (effectiveStatus === 'pending' ? null : parsed.approved_by);
          const effectiveCaption = (caption !== undefined) ? caption : parsed.caption;

          const updatedCaption = encodeSubmissionCaption(effectiveCaption, {
            status: effectiveStatus,
            approved_by: effectiveAdmin,
            approved_at: parsed.approved_at || (effectiveStatus === 'approved' ? new Date().toISOString() : null)
          });

          const dbFields: any = { caption: updatedCaption };
          if (effectiveStatus === 'rejected') {
            dbFields.is_selected = false;
            try { await supabase.from('screenshot_votes').delete().eq('submission_id', submissionId); } catch (e) {}
            try { await supabase.from('submissions').delete().ilike('notes', `%${submissionId}%`); } catch (e) {}
          }
          if (gameName !== undefined) dbFields.game_name = gameName;
          if (isSpoiler !== undefined) dbFields.is_spoiler = Boolean(isSpoiler);

          const { data: updated, error } = await supabase
            .from('screenshot_submissions')
            .update(dbFields)
            .eq('id', submissionId)
            .select()
            .single();

          if (error) throw error;

          if (targetSub?.user_id) {
            await reconcileUserScreenshotPoints(supabase, targetSub.user_id);
            if (effectiveStatus === 'approved' && parsed.status !== 'approved') {
              const approvalMeta = {
                type: 'screenshot_approved',
                submissionId: targetSub.id,
                submission_id: targetSub.id,
                gameName: gameName || targetSub.game_name || 'Screenshot',
                game_name: gameName || targetSub.game_name || 'Screenshot',
                imageUrl: targetSub.image_url || '',
                image_url: targetSub.image_url || ''
              };
              const approvalMsg = `Your screenshot submission has been approved! <!--META:${JSON.stringify(approvalMeta)}-->`;
              try {
                await supabase.from('notifications').insert([{
                  user_id: targetSub.user_id,
                  title: 'Screenshot Submission Approved',
                  message: approvalMsg,
                  read: false,
                  created_at: new Date().toISOString()
                }]);
              } catch (notifErr) {
                console.warn('Could not insert approval notification into Supabase:', notifErr);
              }
              memoryNotifications.unshift({
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                user_id: targetSub.user_id,
                type: 'screenshot_approved',
                submissionId: targetSub.id,
                submission_id: targetSub.id,
                gameName: gameName || targetSub.game_name || 'Screenshot',
                game_name: gameName || targetSub.game_name || 'Screenshot',
                imageUrl: targetSub.image_url || '',
                image_url: targetSub.image_url || '',
                title: 'Screenshot Submission Approved',
                message: 'Your screenshot submission has been approved!',
                created_at: new Date().toISOString(),
                read: false,
                is_read: false
              });
            }
          }

          return res.status(200).json({
            success: true,
            submission: {
              ...updated,
              caption: effectiveCaption,
              status: effectiveStatus,
              approved_by: effectiveAdmin
            }
          });
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
        const { submissionId, userId, isAdmin } = req.body;

        if (!submissionId) {
          return res.status(400).json({ error: 'Submission ID is required' });
        }

        if (supabase) {
          // Fetch target submission details to identify user
          const { data: targetSub } = await supabase
            .from('screenshot_submissions')
            .select('*')
            .eq('id', submissionId)
            .maybeSingle();

          if (!targetSub) {
            return res.status(404).json({ error: 'Submission not found' });
          }

          const targetUserId = targetSub?.user_id;

          // Verify ownership if not admin
          if (!isAdmin) {
            const reqUid = String(userId || '').trim();
            const cleanReq = reqUid.replace(/^discord_/, '');
            const cleanTarget = String(targetUserId || '').replace(/^discord_/, '');
            const isOwner = Boolean(
              reqUid && (
                targetUserId === reqUid ||
                cleanTarget === cleanReq ||
                cleanTarget === reqUid ||
                targetUserId === cleanReq
              )
            );
            if (!isOwner) {
              return res.status(403).json({ error: 'You are only allowed to delete your own submissions.' });
            }
          }

          await supabase.from('screenshot_comments').delete().eq('submission_id', submissionId);
          await supabase.from('screenshot_votes').delete().eq('submission_id', submissionId);
          await supabase.from('screenshot_submissions').delete().eq('id', submissionId);

          // Clean up point row in submissions table matching this submission
          try {
            await supabase.from('submissions').delete().ilike('notes', `%${submissionId}%`);
          } catch (e) {}

          if (targetUserId) {
            await reconcileUserScreenshotPoints(supabase, targetUserId);
          }

          return res.status(200).json({ success: true, message: 'Submission deleted and points reconciled' });
        } else {
          const targetSub = memorySubmissions.find(s => s.id === submissionId);
          if (!targetSub) {
            return res.status(404).json({ error: 'Submission not found' });
          }
          if (!isAdmin) {
            const reqUid = String(userId || '').trim();
            const cleanReq = reqUid.replace(/^discord_/, '');
            const cleanTarget = String(targetSub.user_id || '').replace(/^discord_/, '');
            if (targetSub.user_id !== reqUid && cleanTarget !== cleanReq) {
              return res.status(403).json({ error: 'You are only allowed to delete your own submissions.' });
            }
          }
          memorySubmissions = memorySubmissions.filter(s => s.id !== submissionId);
          memoryVotes = memoryVotes.filter(v => v.submission_id !== submissionId);
          memoryComments = memoryComments.filter(c => c.submission_id !== submissionId);
          return res.status(200).json({ success: true, message: 'Submission deleted' });
        }
      }

      // ADMIN: TOGGLE VOTING PERIOD
      if (action === 'admin-toggle-voting') {
        let activeCompEvent: any = null;
        if (supabase) {
          try {
            const { data: actEvts } = await supabase.from('events').select('*').eq('is_active', true);
            activeCompEvent = (actEvts && actEvts.length > 0) ? actEvts[0] : null;
          } catch (e) {}
        }
        const targetId = activeCompEvent ? activeCompEvent.id : memoryEvent.id;
        let currentStatus = memoryEvent.status;
        if (supabase) {
          const { data: evt } = await supabase.from('screenshot_events').select('*').eq('id', targetId).maybeSingle();
          if (evt) {
            currentStatus = evt.status;
            memoryEvent = { ...memoryEvent, ...evt };
          } else if (activeCompEvent) {
            const newEvt = {
              id: targetId,
              title: `${activeCompEvent.title || 'Competition Event'} - Screenshot Submission`,
              status: 'submissions_open',
              is_admin_only: true,
              max_submissions_per_user: 10
            };
            await supabase.from('screenshot_events').upsert([newEvt]);
            currentStatus = 'submissions_open';
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
            id: targetId,
            submission_points: memoryEvent.submission_points !== undefined ? Number(memoryEvent.submission_points) : getSavedSubmissionPoints(),
            is_voting_active: memoryEvent.status === 'voting_active'
          }
        });
      }

      // ADMIN: UPDATE EVENT STATUS & SETTINGS ('draft' | 'submissions_open' | 'voting_active' | 'concluded', submission_points)
      if (action === 'admin-event-status' || action === 'admin-update-event') {
        const { status, isAdminOnly, submissionPoints, eventId } = req.body;

        let activeCompEvent: any = null;
        if (supabase) {
          try {
            const { data: actEvts } = await supabase.from('events').select('*').eq('is_active', true);
            activeCompEvent = (actEvts && actEvts.length > 0) ? actEvts[0] : null;
          } catch (e) {}
        }
        const targetId = eventId || (activeCompEvent ? activeCompEvent.id : memoryEvent.id);

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

          const baseDesc = (memoryEvent.description || 'Screenshot Showcase & Contest')
            .replace(/<!--SUBMISSION_POINTS:\d+-->/g, '')
            .trim();
          updateData.description = `${baseDesc} <!--SUBMISSION_POINTS:${pts}-->`;
          memoryEvent.description = updateData.description;
        }

        if (supabase) {
          try {
            const { data: existingEvt } = await supabase.from('screenshot_events').select('*').eq('id', targetId).maybeSingle();
            if (existingEvt) {
              if (updateData.description && existingEvt.description) {
                const baseDesc = existingEvt.description.replace(/<!--SUBMISSION_POINTS:\d+-->/g, '').trim();
                const currentPts = updateData.submission_points !== undefined ? updateData.submission_points : persistentDefaultSubmissionPoints;
                updateData.description = `${baseDesc} <!--SUBMISSION_POINTS:${currentPts}-->`;
              }
              memoryEvent = { ...memoryEvent, ...existingEvt, ...updateData };
              
              const { data: updated, error } = await supabase
                .from('screenshot_events')
                .update(updateData)
                .eq('id', targetId)
                .select()
                .maybeSingle();

              if (!error && updated) {
                memoryEvent = { ...memoryEvent, ...updated };
              } else if (error) {
                const fallbackData = { ...updateData };
                delete fallbackData.submission_points;
                const { data: fallbackUpdated } = await supabase
                  .from('screenshot_events')
                  .update(fallbackData)
                  .eq('id', targetId)
                  .select()
                  .maybeSingle();
                if (fallbackUpdated) {
                  memoryEvent = { ...memoryEvent, ...fallbackUpdated, submission_points: persistentDefaultSubmissionPoints };
                }
              }
            } else {
              const seedEvt = { ...memoryEvent, id: targetId, ...updateData };
              const { data: inserted, error } = await supabase
                .from('screenshot_events')
                .upsert([seedEvt])
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

        const effectivePts = extractSubmissionPoints(memoryEvent);

        return res.status(200).json({
          success: true,
          event: {
            ...memoryEvent,
            id: targetId,
            submission_points: effectivePts,
            is_voting_active: memoryEvent.status === 'voting_active'
          }
        });
      }

      // ADMIN: TALLY VOTES & AWARD WINNER POINTS (+50, +40, +30, +20, +10)
      if (action === 'admin-tally-points') {
        const { adminName, adminId } = req.body;

        let activeCompEvent: any = null;
        if (supabase) {
          try {
            const { data: actEvts } = await supabase.from('events').select('*').eq('is_active', true);
            activeCompEvent = (actEvts && actEvts.length > 0) ? actEvts[0] : null;
          } catch (e) {}
        }
        const targetId = activeCompEvent ? activeCompEvent.id : memoryEvent.id;

        let subs: any[] = [];
        let votes: any[] = [];

        if (supabase) {
          const { data: s } = await supabase.from('screenshot_submissions').select('*').eq('is_selected', true);
          const { data: v } = await supabase.from('screenshot_votes').select('*');
          // Filter to target event
          subs = (s || []).filter(sub => !targetId || sub.event_id === targetId || sub.event_id === 'evt_screenshot_01');
          votes = (v || []).filter(vote => !targetId || vote.event_id === targetId || vote.event_id === 'evt_screenshot_01');
        } else {
          subs = memorySubmissions.filter(s => s.is_selected && (!targetId || s.event_id === targetId));
          votes = memoryVotes.filter(v => !targetId || v.event_id === targetId);
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
            const notes = `__META_START__${JSON.stringify({ userNotes: `Bingo / Screenshot Submission ${rankName} Winner (${sub.user_name}) - ${sub.game_name}` })}__META_END__`;

            if (supabase) {
              await supabase.from('submissions').insert([{
                user_id: sub.user_id,
                game_name: `Screenshot Submission ${rankName} (+${pts} pts)`,
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
          await supabase.from('screenshot_events').update({ status: 'concluded' }).eq('id', targetId);
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
