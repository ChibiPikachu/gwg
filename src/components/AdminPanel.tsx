import React from 'react';
import { UserProfile, Team, TEAM_COLORS } from '@/types';
import { useAuth } from '@/components/AuthProvider';
import { Search, Settings, Shield, Clock, CheckCircle, CheckCircle2, XCircle, ExternalLink, Plus, ChevronDown, Trophy, Database, Copy, Check, Download, Trash2, History, ShieldCheck, Camera, Grid, Users, CheckSquare, Calendar, Filter, RotateCcw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase, isSupabaseConfigured, buildProfileOrFilter } from '@/lib/supabase';

export interface SubmissionNotesMeta {
  hasNoAchievements: boolean;
  level?: number;
  userNotes: string;
  adminName?: string;
  adminId?: string;
}

export function parseNotesMeta(notes: string): SubmissionNotesMeta {
  if (notes && typeof notes === 'string') {
    const trimmed = notes.trim();
    const startIdx = trimmed.indexOf('__META_START__');
    if (startIdx !== -1) {
      const endIdx = trimmed.indexOf('__META_END__', startIdx);
      if (endIdx !== -1) {
        try {
          const jsonStr = trimmed.slice(startIdx + '__META_START__'.length, endIdx);
          const meta = JSON.parse(jsonStr);
          const userNotes = (trimmed.slice(0, startIdx) + trimmed.slice(endIdx + '__META_END__'.length)).trim();
          return {
            hasNoAchievements: !!meta.hasNoAchievements,
            level: meta.level,
            userNotes,
            adminName: meta.adminName,
            adminId: meta.adminId
          };
        } catch (e) {
          // Fallback
        }
      }
    }
  }
  return {
    hasNoAchievements: false,
    level: undefined,
    userNotes: notes || ''
  };
}

export function serializeNotesMeta(hasNoAchievements: boolean, level: number | undefined, userNotes: string): string {
  if (hasNoAchievements) {
    return `__META_START__${JSON.stringify({ hasNoAchievements, level })}__META_END__${userNotes}`;
  }
  return userNotes;
}

export function calculateNonAchievementPoints(level: number, hoursPlayed: number, hltb: { hltb_main?: number, hltb_extras?: number }, completionStatus: string): number {
  let basePoints = 20;
  if (hoursPlayed >= 50) {
    basePoints = 200;
  } else if (hoursPlayed >= 25) {
    basePoints = 100;
  } else if (hoursPlayed >= 15) {
    basePoints = 75;
  } else if (hoursPlayed >= 8) {
    basePoints = 40;
  } else {
    basePoints = 20;
  }

  if (level === 0) {
    return Math.round(basePoints * 0.1);
  } else if (level === 1) {
    return Math.round(basePoints * 0.4);
  } else { // Level 2
    const bonus = completionStatus === 'completed' ? 20 : 0;
    return basePoints + bonus;
  }
}

type AdminTab = 'users' | 'submissions' | 'previous_submissions' | 'team_points' | 'activity_log';

export default function AdminPanel({ onViewProfile, activeAdminTab }: { onViewProfile?: (id: string) => void, activeAdminTab?: AdminTab }) {
  const { user: currentUser, theme } = useAuth();
  const [activeTab, setActiveTab] = React.useState<AdminTab>(activeAdminTab || 'users');

  if (!currentUser || !currentUser.isAdmin) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <Shield className="text-red-500" size={32} />
        </div>
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="opacity-60 max-w-sm">
          You do not have the required permissions to access the Administration Panel. Current User: {currentUser?.steamName} ({currentUser?.role})
        </p>
      </div>
    );
  }
  
  const [filterTeam, setFilterTeam] = React.useState<Team | 'all'>('all');
  const [users, setUsers] = React.useState<any[]>([]);
  const [submissions, setSubmissions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState<string | null>(null);
  const [selectedUser, setSelectedUser] = React.useState<any | null>(null);
  const [reviewingId, setReviewingId] = React.useState<string | null>(null);
  const [subStatusFilter, setSubStatusFilter] = React.useState<'all' | 'pending' | 'verified' | 'rejected'>('pending');
  const [completionFilter, setCompletionFilter] = React.useState<'all' | 'unfinished' | 'beaten' | 'completed' | 'abandoned'>('all');
  const [settingsUserId, setSettingsUserId] = React.useState<string | null>(null);
  const [editingUserEventTeams, setEditingUserEventTeams] = React.useState<any | null>(null);
  const [pointsAwarded, setPointsAwarded] = React.useState('0');
  const [selectedLevel, setSelectedLevel] = React.useState<number>(2);
  const [hltbData, setHltbData] = React.useState<Record<string, any>>({});
  const [fetchingHLTB, setFetchingHLTB] = React.useState<string | null>(null);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = React.useState(false);
  const [backfillProgress, setBackfillProgress] = React.useState<{ processed: number, remaining: number, total: number } | null>(null);

  const [events, setEvents] = React.useState<any[]>([]);
  const [activeEvent, setActiveEvent] = React.useState<any | null>(null);

  const [awardTeam, setAwardTeam] = React.useState<'blue' | 'purple' | 'green' | 'red'>('blue');
  const [awardPoints, setAwardPoints] = React.useState('');
  const [awardNotes, setAwardNotes] = React.useState('');
  const [isAwarding, setIsAwarding] = React.useState(false);
  const [teamAdjustments, setTeamAdjustments] = React.useState<any[]>([]);
  const [awardTargetType, setAwardTargetType] = React.useState<'team' | 'user'>('team');
  const [awardUserId, setAwardUserId] = React.useState('');
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = React.useState('');
  const [userTeamFilter, setUserTeamFilter] = React.useState<'all' | 'blue' | 'purple' | 'green' | 'red'>('all');
  const [awardAdjustmentType, setAwardAdjustmentType] = React.useState<'screenshot' | 'bingo'>('screenshot');

  // Point Adjustments Log Filter State
  const [adjSearchQuery, setAdjSearchQuery] = React.useState('');
  const [adjUserFilter, setAdjUserFilter] = React.useState('all');
  const [adjAdminFilter, setAdjAdminFilter] = React.useState('all');
  const [adjTypeFilter, setAdjTypeFilter] = React.useState<'all' | 'screenshot' | 'bingo' | 'team'>('all');
  const [adjDateFilter, setAdjDateFilter] = React.useState<'all' | 'today' | '7d' | '30d' | '90d' | 'older_90d' | 'custom'>('all');
  const [adjStartDate, setAdjStartDate] = React.useState('');
  const [adjEndDate, setAdjEndDate] = React.useState('');

  // Audit Logs Cleanup State
  const [cleanupModalOpen, setCleanupModalOpen] = React.useState(false);
  const [cleanupDays, setCleanupDays] = React.useState(90);
  const [isCleaningUp, setIsCleaningUp] = React.useState(false);

  // Activity Log State
  const [activityLogs, setActivityLogs] = React.useState<any[]>([]);
  const [loadingActivityLogs, setLoadingActivityLogs] = React.useState(false);
  const [logSearchQuery, setLogSearchQuery] = React.useState('');
  const [logTypeFilter, setLogTypeFilter] = React.useState<'all' | 'screenshot' | 'bingo' | 'team'>('all');
  const [logTeamFilter, setLogTeamFilter] = React.useState<'all' | 'blue' | 'purple' | 'green' | 'red'>('all');

  // Bulk Operations State
  const [selectedSubIds, setSelectedSubIds] = React.useState<string[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = React.useState(false);
  const [deleteEventModalOpen, setDeleteEventModalOpen] = React.useState(false);
  const [targetDeleteEventId, setTargetDeleteEventId] = React.useState<string>('');

  // Bulk Score Editor State
  const [scoreEditMode, setScoreEditMode] = React.useState<'single' | 'bulk'>('single');
  const [bulkEditEventId, setBulkEditEventId] = React.useState<string>('');
  const [bulkUsers, setBulkUsers] = React.useState<any[]>([]);
  const [bulkUserScores, setBulkUserScores] = React.useState<Record<string, number>>({});
  const [bulkTeamAdjustments, setBulkTeamAdjustments] = React.useState<Record<string, number>>({ blue: 0, green: 0, purple: 0, red: 0 });
  const [bulkSearch, setBulkSearch] = React.useState('');
  const [bulkTeamFilter, setBulkTeamFilter] = React.useState<'all' | 'blue' | 'purple' | 'green' | 'red'>('all');
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const [bulkSaving, setBulkSaving] = React.useState(false);
  const [bulkSuccessMsg, setBulkSuccessMsg] = React.useState<string | null>(null);

  // Submission Verification Popup State
  const [verifyPopupMsg, setVerifyPopupMsg] = React.useState<{
    title: string;
    gameTitle: string;
    userName: string;
    userTeam: string;
    points: number;
    status: 'verified' | 'rejected';
    rejectionReason?: string;
  } | null>(null);

  const fetchBulkEventData = React.useCallback(async (eventId: string) => {
    if (!eventId) return;
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/leaderboard/event/${eventId}`);
      if (res.ok) {
        const data = await res.json();
        const uScores: Record<string, number> = {};
        const uList: any[] = [];
        (data.topUsers || []).forEach((u: any) => {
          uScores[u.steamid] = u.points || 0;
          uList.push(u);
        });
        setBulkUserScores(uScores);
        setBulkUsers(uList);

        const teamAdj: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };
        (data.standings || []).forEach((s: any) => {
          if (s.team && teamAdj[s.team] !== undefined) {
            teamAdj[s.team] = s.points || 0;
          }
        });
        setBulkTeamAdjustments(teamAdj);
      }
    } catch (err) {
      console.error('Failed to fetch bulk event data:', err);
    } finally {
      setBulkLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (scoreEditMode === 'bulk' && bulkEditEventId) {
      fetchBulkEventData(bulkEditEventId);
    }
  }, [scoreEditMode, bulkEditEventId, fetchBulkEventData]);

  React.useEffect(() => {
    if (events.length > 0 && !bulkEditEventId) {
      const active = events.find((e: any) => e.is_active);
      setBulkEditEventId(active ? active.id : events[0].id);
    }
  }, [events, bulkEditEventId]);

  const handleCommitBulkScores = async () => {
    if (!bulkEditEventId) return;
    setBulkSaving(true);
    setBulkSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/force-event-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: bulkEditEventId,
          userScores: bulkUserScores,
          teamAdjustments: bulkTeamAdjustments
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to commit bulk score adjustments');

      setBulkSuccessMsg('Bulk member scores updated & event re-synced successfully! (0 notifications sent)');
      setTimeout(() => setBulkSuccessMsg(null), 6000);
      fetchBulkEventData(bulkEditEventId);
    } catch (err: any) {
      console.error('Failed to commit bulk scores:', err);
      alert(`Error committing bulk scores: ${err.message}`);
    } finally {
      setBulkSaving(false);
    }
  };

  // Mass Team Assignment State
  const [massSelectedUserIds, setMassSelectedUserIds] = React.useState<string[]>([]);
  const [massTargetEventId, setMassTargetEventId] = React.useState<string>('active');
  const [massTargetTeam, setMassTargetTeam] = React.useState<Team | 'none'>('blue');
  const [isMassAssigning, setIsMassAssigning] = React.useState(false);
  const [massAssignSuccessMsg, setMassAssignSuccessMsg] = React.useState<string | null>(null);

  const fetchActivityLogs = React.useCallback(async () => {
    setLoadingActivityLogs(true);

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: rawSubs, error } = await supabase
          .from('submissions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (!error && Array.isArray(rawSubs)) {
          const adjustments = rawSubs.filter((s: any) => 
            (s.user_id && String(s.user_id).startsWith('team_pts_')) ||
            (s.game_name && (s.game_name.includes('Points') || s.game_name.includes('Award'))) ||
            (s.platform && (s.platform.includes('Points') || s.platform.includes('Award'))) ||
            (s.notes && s.notes.includes('adminId'))
          );

          // Get profile information for admins and users
          const profileIds = new Set<string>();
          adjustments.forEach((sub: any) => {
            if (sub.verifier_id) profileIds.add(String(sub.verifier_id));
            if (sub.user_id && !String(sub.user_id).startsWith('team_pts_')) profileIds.add(String(sub.user_id));
            const meta = parseNotesMeta(sub.notes || '');
            if (meta.adminId) profileIds.add(String(meta.adminId));
          });

          let profileMap: Record<string, any> = {};
          if (profileIds.size > 0) {
            const idList = Array.from(profileIds);
            const { data: profiles } = await supabase
              .from('profiles')
              .select('steamid, steam_name, steam_avatar, discord_name, discord_avatar, active_avatar, team, role, id, discord_id')
              .or(idList.map(id => `steamid.eq.${id},id.eq.${id},discord_id.eq.${id}`).join(','));

            (profiles || []).forEach((p: any) => {
              const keys = [p.steamid, p.id, p.discord_id].filter(Boolean);
              let avatar = p.steam_avatar || p.discord_avatar || 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png';
              if (p.active_avatar === 'discord' && p.discord_avatar) avatar = p.discord_avatar;
              
              keys.forEach(k => {
                profileMap[String(k)] = {
                  name: p.steam_name || p.discord_name || 'User',
                  avatar,
                  team: p.team,
                  role: p.role
                };
              });
            });
          }

          const formatted = adjustments.map((sub: any) => {
            const meta = parseNotesMeta(sub.notes || '');
            let adminId = meta.adminId || sub.verifier_id || null;
            let adminAvatar = 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png';
            let resolvedProfileName = (adminId && profileMap[String(adminId)]) ? profileMap[String(adminId)].name : null;

            if (adminId && profileMap[String(adminId)]) {
              adminAvatar = profileMap[String(adminId)].avatar;
            }

            let adminName = meta.adminName;
            if (!adminName || adminName === 'Admin' || adminName === 'Administrator') {
              adminName = resolvedProfileName || meta.adminName || 'Administrator';
            }

            const userProfile = profileMap[String(sub.user_id)];
            return {
              id: sub.id,
              user_id: sub.user_id,
              user_name: sub.user_name || (userProfile?.name) || (String(sub.user_id).startsWith('team_pts_') ? `${String(sub.user_id).replace('team_pts_', '').toUpperCase()} TEAM` : 'Team Adjustment'),
              user_avatar: sub.user_avatar || (userProfile?.avatar) || 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png',
              user_team: userProfile?.team || (String(sub.user_id).startsWith('team_pts_') ? String(sub.user_id).replace('team_pts_', '') : 'none'),
              game_name: sub.game_name,
              platform: sub.platform,
              points: Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0,
              notes: meta.userNotes,
              raw_notes: sub.notes,
              created_at: sub.created_at,
              event_id: sub.event_id,
              admin_name: adminName,
              admin_id: adminId,
              admin_avatar: adminAvatar
            };
          });

          setActivityLogs(formatted);
          setLoadingActivityLogs(false);
          return;
        }
      } catch (e) {
        console.warn('Supabase fetch activity logs warning:', e);
      }
    }

    try {
      const res = await fetch('/api/admin/activity-log');
      if (res.ok) {
        const data = await res.json();
        setActivityLogs(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
    } finally {
      setLoadingActivityLogs(false);
    }
  }, []);

  const fetchTeamAdjustments = React.useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: rawSubs, error } = await supabase
          .from('submissions')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(rawSubs)) {
          const adjustments = rawSubs.filter((s: any) => 
            (s.user_id && String(s.user_id).startsWith('team_pts_')) ||
            (s.game_name && (s.game_name.includes('Points') || s.game_name.includes('Award'))) ||
            (s.platform && (s.platform.includes('Points') || s.platform.includes('Award')))
          );
          setTeamAdjustments(adjustments);
          return;
        }
      } catch (e) {
        console.warn('Supabase fetch team adjustments warning:', e);
      }
    }

    try {
      const res = await fetch('/api/team-adjustments');
      if (res.ok) {
        const data = await res.json();
        setTeamAdjustments(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch team adjustments:', err);
    }
  }, []);

  const fetchEvents = React.useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .order('start_date', { ascending: false });

        if (!error && Array.isArray(data)) {
          setEvents(data);
          const active = data.find((e: any) => e.is_active || e.isActive);
          setActiveEvent(active || data[0] || null);
          return;
        }
      } catch (e) {
        console.warn('Supabase fetch events error in AdminPanel:', e);
      }
    }

    try {
      const res = await fetch('/api/events');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setEvents(list);
        const active = list.find((e: any) => e.is_active || e.isActive);
        setActiveEvent(active || list[0] || null);
      }
    } catch (err) {
      console.warn('Failed to fetch events inside AdminPanel:', err);
    }
  }, []);

  const handleAwardTeamPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    const isUser = awardTargetType === 'user';
    if (isUser && selectedUserIds.length === 0) {
      alert('Please select at least one user first!');
      return;
    }
    if (!isUser && !awardTeam) return;
    if (!awardPoints || parseInt(awardPoints) === 0) return;

    setIsAwarding(true);
    try {
      const teamToSend = isUser ? 'mixed' : awardTeam;
      const currentAdminName = currentUser?.steam_name || currentUser?.discord_name || currentUser?.displayName || 'Admin';
      const currentAdminId = currentUser?.steamId || currentUser?.steamid || currentUser?.id;

      const res = await fetch('/api/admin/team-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team: teamToSend,
          points: parseInt(awardPoints),
          notes: awardNotes,
          userIds: isUser ? selectedUserIds : null,
          adjustmentType: isUser ? awardAdjustmentType : 'screenshot',
          adminName: currentAdminName,
          adminId: currentAdminId
        })
      });
      if (res.ok) {
        setAwardPoints('');
        setAwardNotes('');
        setAwardUserId('');
        setSelectedUserIds([]);
        // Reload all data (including user points, adjustments log, and activity log)
        await Promise.all([fetchTeamAdjustments(), fetchUsers(), fetchActivityLogs()]);
        alert(isUser ? `Points successfully awarded to ${selectedUserIds.length} users!` : 'Points successfully awarded to the team!');
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown server error' }));
        alert(`Failed to award points: ${data.error}`);
      }
    } catch (err) {
      console.error('Failed to award points:', err);
      alert('An error occurred while awarding points.');
    } finally {
      setIsAwarding(false);
    }
  };

  const handleCleanupAuditLogs = async () => {
    if (!window.confirm(`Are you sure you want to permanently purge audit log adjustments older than ${cleanupDays} days? This will remove old audit trail records to maintain performance while preserving all current user scores.`)) {
      return;
    }
    setIsCleaningUp(true);
    try {
      const res = await fetch('/api/admin/audit-logs/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: cleanupDays })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message || `Successfully purged ${data.purgedCount} audit logs!`);
        setCleanupModalOpen(false);
        await Promise.all([fetchTeamAdjustments(), fetchActivityLogs(), fetchUsers()]);
      } else {
        alert(`Cleanup failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to cleanup audit logs:', err);
      alert('An error occurred during audit log cleanup.');
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleDeleteAdjustment = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this point adjustment?')) return;
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await Promise.all([fetchTeamAdjustments(), fetchUsers(), fetchActivityLogs()]);
        alert('Adjustment successfully revoked!');
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err) {
      console.error('Failed to delete adjustment:', err);
      alert('An error occurred.');
    }
  };

  const fetchHLTBForGame = async (title: string) => {
    if (hltbData[title] && !hltbData[title].notFound) return;
    
    setFetchingHLTB(title);
    try {
      const res = await fetch(`/api/hltb/${encodeURIComponent(title)}`);
      if (res.ok) {
        const data = await res.json();
        setHltbData(prev => ({ ...prev, [title]: data }));
      }
    } catch (err) {
      console.error(`Failed to fetch HLTB for ${title}:`, err);
    } finally {
      setFetchingHLTB(null);
    }
  };
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [editHours, setEditHours] = React.useState('0');
  const [editAchievements, setEditAchievements] = React.useState('0');
  const [editMultiplier, setEditMultiplier] = React.useState(1);

  const fetchUsers = React.useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const formatted = data.map((dbProfile: any) => {
            const isAdmin = dbProfile.role === 'admin' || dbProfile.role === 'admins' || dbProfile.role === 'owner' || dbProfile.is_admin === true || dbProfile.isAdmin === true;
            return {
              ...dbProfile,
              uid: String(dbProfile.steamid || dbProfile.id),
              steamId: String(dbProfile.steamid || dbProfile.id),
              steamName: dbProfile.steam_name || dbProfile.display_name || dbProfile.discord_name || 'Gamer',
              steamAvatar: dbProfile.steam_avatar || dbProfile.discord_avatar || 'https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
              team: dbProfile.team || 'none',
              isAdmin: Boolean(isAdmin),
              role: dbProfile.role || (isAdmin ? 'admin' : 'member'),
              status: dbProfile.status || 'Ready for Event',
              points: typeof dbProfile.points === 'number' ? dbProfile.points : 0,
              discordId: dbProfile.discord_id || dbProfile.id,
              discordName: dbProfile.discord_name,
              discordAvatar: dbProfile.discord_avatar,
              createdAt: dbProfile.created_at
            };
          });
          setUsers(formatted);
          return;
        }
      } catch (e) {
        console.warn('Supabase fetch users error in AdminPanel:', e);
      }
    }

    try {
      const res = await fetch('/api/admin/users');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Failed to fetch users:', err);
    } 
  }, []);

  const fetchSubmissions = React.useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('submissions')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          setSubmissions(data);

          const uniqueTitles = Array.from(new Set((data || []).map((s: any) => s.game_name || s.gameName).filter(Boolean)));
          if (uniqueTitles.length > 0) {
            try {
              const r = await fetch('/api/hltb-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ titles: uniqueTitles })
              });
              if (r.ok && r.headers.get('content-type')?.includes('application/json')) {
                const hltb = await r.json();
                if (hltb && typeof hltb === 'object') {
                  setHltbData(prev => ({ ...prev, ...hltb }));
                }
              }
            } catch (err) {
              console.warn('HLTB batch fetch failed:', err);
            }
          }
          return;
        }
      } catch (e) {
        console.warn('Supabase fetch submissions error in AdminPanel:', e);
      }
    }

    try {
      const res = await fetch('/api/admin/submissions');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data : []);
        
        const uniqueTitles = Array.from(new Set((data || []).map((s: any) => s.game_name || s.gameName).filter(Boolean)));
        if (uniqueTitles.length > 0) {
          try {
            const r = await fetch('/api/hltb-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ titles: uniqueTitles })
            });
            if (r.ok && r.headers.get('content-type')?.includes('application/json')) {
              const hltb = await r.json();
              if (hltb && typeof hltb === 'object') {
                setHltbData(prev => ({ ...prev, ...hltb }));
              }
            }
          } catch (err) {
            console.warn('HLTB batch fetch failed:', err);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch submissions:', err);
    }
  }, []);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchSubmissions(), fetchTeamAdjustments(), fetchEvents(), fetchActivityLogs()]);
    setLoading(false);
  }, [fetchUsers, fetchSubmissions, fetchTeamAdjustments, fetchEvents, fetchActivityLogs]);

  React.useEffect(() => {
    if (activeAdminTab) {
      setActiveTab(activeAdminTab);
      // Re-fetch when switching tabs to ensure data is fresh
      fetchData();
    }
  }, [activeAdminTab, fetchData]);

  React.useEffect(() => {
    fetchData();

    if (!isSupabaseConfigured) return;

    const channelProfiles = supabase
      .channel('admin-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
      })
      .subscribe();

    const channelSubmissions = supabase
      .channel('admin-submissions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, () => {
        fetchSubmissions();
        fetchTeamAdjustments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelProfiles);
      supabase.removeChannel(channelSubmissions);
    };
  }, [fetchData, fetchUsers, fetchSubmissions, fetchTeamAdjustments]);

  const assignTeam = async (targetSteamId: string, team: Team) => {
    setUpdating(targetSteamId);
    try {
      const res = await fetch('/api/admin/update-user-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSteamId, team })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setUsers(prev => prev.map(u => {
          const uId = u.steamid || u.steamId;
          return (uId && uId === targetSteamId) ? { ...u, team: team === 'none' ? null : team } : u;
        }));
      } else {
        alert(`Failed to update team: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to update team:', err);
    } finally {
      setUpdating(null);
    }
  };

  const assignEventTeam = async (targetSteamId: string, eventId: string, team: Team | 'none') => {
    setUpdating(targetSteamId);
    try {
      const res = await fetch('/api/admin/update-user-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSteamId, team, eventId })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setUsers(prev => prev.map(u => {
          const uId = u.steamid || u.steamId;
          if (uId && uId === targetSteamId) {
            const updatedEventTeams = { ...u.eventTeams, [eventId]: team === 'none' ? null : team };
            const isEventActive = events.find((e: any) => e.id === eventId)?.is_active;
            return {
              ...u,
              team: isEventActive ? (team === 'none' ? null : team) : u.team,
              eventTeams: updatedEventTeams
            };
          }
          return u;
        }));

        setEditingUserEventTeams(prev => {
          if (prev) {
            const prevId = prev.steamid || prev.steamId;
            if (prevId && prevId === targetSteamId) {
              const updatedEventTeams = { ...prev.eventTeams, [eventId]: team === 'none' ? null : team };
              const isEventActive = events.find((e: any) => e.id === eventId)?.is_active;
              return {
                ...prev,
                team: isEventActive ? (team === 'none' ? null : team) : prev.team,
                eventTeams: updatedEventTeams
              };
            }
          }
          return prev;
        });
      } else {
        alert(`Failed to update event team: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to update event team:', err);
    } finally {
      setUpdating(null);
    }
  };

  const handleKickUser = async (steamId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to KICK ${name}? This will PERMANENTLY delete their profile and all submissions. This action cannot be undone.`)) {
      return;
    }

    setUpdating(steamId);
    try {
      const res = await fetch(`/api/admin/users/${steamId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setUsers(prev => prev.filter(u => {
          const uId = u.steamid || u.steamId;
          return uId !== steamId;
        }));
        setSettingsUserId(null);
      } else {
        const data = await res.json();
        alert(`Failed to kick: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to kick user');
    } finally {
      setUpdating(null);
    }
  };

  const handleUpdateRole = async (targetSteamId: string, role: 'admin' | 'member') => {
    setUpdating(targetSteamId);
    try {
      const res = await fetch('/api/admin/update-user-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSteamId, role })
      });
      
      if (res.ok) {
        setUsers(prev => prev.map(u => {
          const uId = u.steamid || u.steamId;
          return (uId && uId === targetSteamId) ? { ...u, role } : u;
        }));
      } else {
        const data = await res.json();
        alert(`Failed to update role: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to update user role');
    } finally {
      setUpdating(null);
    }
  };

  const calculateReviewPoints = (achievementsVal: string, multiplierVal: number, levelVal: number, sub: any) => {
    if (sub?.game_name === 'Screenshot Points' || sub?.game_name === 'Bingo Points' || sub?.game_name === 'Team Award' || sub?.platform === 'System') {
      return String(sub?.points || 0);
    }
    const meta = parseNotesMeta(sub?.notes || '');
    const isBeatenPrev = sub?.beaten_previous === 'yes';
    const effectiveAdminStatus = (sub?.completion_status === 'beaten' && isBeatenPrev) ? 'unfinished' : (sub?.completion_status || 'unfinished');

    if (meta.hasNoAchievements) {
      const hoursPlayed = parseFloat(editHours) || Number(sub?.hours_during || 0);
      const hoursBefore = Number(sub?.hours_before || 0);
      const finalPlayTime = Math.max(0, hoursPlayed - hoursBefore);
      const hltb = hltbData[sub?.game_name || ''] || { hltb_main: sub?.hltb_main, hltb_extras: sub?.hltb_extras };
      const nonAchPts = calculateNonAchievementPoints(levelVal, finalPlayTime, hltb, effectiveAdminStatus);
      return String(nonAchPts);
    }
    const achs = parseInt(achievementsVal) || 0;
    let bonus = 0;
    if (effectiveAdminStatus === 'completed') {
      bonus = 30;
    } else if (effectiveAdminStatus === 'beaten') {
      bonus = 15;
    }
    const basePoints = Math.round(achs * multiplierVal) + bonus;
    return String(basePoints);
  };

  const handleVerify = async (status: 'verified' | 'rejected') => {
    if (!reviewingId) return;
    setUpdating(reviewingId);
    
    try {
      const sub = submissions.find(s => s.id === reviewingId);
      const meta = parseNotesMeta(sub?.notes || '');
      let updatedNotes = sub?.notes || '';
      if (meta.hasNoAchievements) {
        updatedNotes = serializeNotesMeta(true, selectedLevel, meta.userNotes);
      }

      const userIdHeader = currentUser?.steamId || currentUser?.uid || currentUser?.discordId || '';
      const res = await fetch('/api/admin/verify-submission', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userIdHeader,
          'x-steam-id': currentUser?.steamId || '',
          'x-discord-id': currentUser?.discordId || ''
        },
        body: JSON.stringify({
          submissionId: reviewingId,
          status,
          points: Math.round(parseFloat(pointsAwarded) || 0),
          rejectionReason: status === 'rejected' ? rejectionReason : '',
          hours: parseFloat(editHours),
          achievements: parseInt(editAchievements),
          multiplier: editMultiplier,
          notes: updatedNotes
        })
      });

      if (res.ok) {
        const finalPts = Math.round(parseFloat(pointsAwarded) || 0);

        // Trigger custom admin verification popup modal
        setVerifyPopupMsg({
          title: status === 'verified' ? 'Submission Approved!' : 'Submission Rejected',
          gameTitle: sub?.game_name || sub?.gameTitle || 'Game Submission',
          userName: sub?.steam_name || sub?.user_name || sub?.userName || 'Player',
          userTeam: sub?.team || 'none',
          points: finalPts,
          status,
          rejectionReason: status === 'rejected' ? rejectionReason : ''
        });

        // UI Live Update: Update local state immediately
        setSubmissions(prev => prev.map(s => s.id === reviewingId ? { 
          ...s, 
          status, 
          points: finalPts,
          rejection_reason: status === 'rejected' ? rejectionReason : '',
          hours_during: parseFloat(editHours),
          achievements_during: parseInt(editAchievements),
          multiplier: editMultiplier,
          notes: updatedNotes
        } : s));
        setReviewingId(null);
        setRejectionReason('');
        await fetchUsers();
        await fetchTeamAdjustments();
      } else {
        let errorMsg = `Server returned error (${res.status})`;
        try {
          const rawText = await res.text();
          try {
            const parsedData = JSON.parse(rawText);
            errorMsg = parsedData.error || errorMsg;
          } catch {
            if (rawText && rawText.length > 0) errorMsg = rawText.slice(0, 150);
          }
        } catch {}
        alert(`Verification failed: ${errorMsg}`);
      }
    } catch (err: any) {
      console.error('Verify submission error:', err);
      alert(`Failed to update submission: ${err?.message || 'Network error'}`);
    } finally {
      setUpdating(null);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this submission?')) {
      return;
    }

    setUpdating(id);
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setSubmissions(prev => prev.filter(s => s.id !== id));
      } else {
        const data = await res.json();
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to delete submission');
    } finally {
      setUpdating(null);
    }
  };

  const handleMassAccept = async (idsToAccept?: string[]) => {
    let finalIds = idsToAccept || selectedSubIds;
    if (finalIds.length === 0) {
      const pendingFiltered = filteredSubmissions.filter(s => s.status === 'pending').map(s => s.id);
      if (pendingFiltered.length === 0) {
        alert('No pending submissions found in current view.');
        return;
      }
      if (!window.confirm(`Are you sure you want to mass accept all ${pendingFiltered.length} pending submission(s)?`)) {
        return;
      }
      finalIds = pendingFiltered;
    } else {
      if (!window.confirm(`Are you sure you want to accept ${finalIds.length} selected submission(s)?`)) {
        return;
      }
    }

    setIsProcessingBulk(true);
    try {
      const res = await fetch('/api/admin/submissions/mass-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionIds: finalIds })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Successfully mass accepted ${data.count} submission(s)!`);
        setSelectedSubIds([]);
        fetchSubmissions();
        fetchUsers();
      } else {
        alert(`Error mass accepting submissions: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Mass accept error:', err);
      alert('Failed to execute mass accept.');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBatchDeleteSelected = async () => {
    if (selectedSubIds.length === 0) {
      alert('Please select at least one submission to delete.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete ${selectedSubIds.length} selected submission(s)?`)) {
      return;
    }

    setIsProcessingBulk(true);
    try {
      const res = await fetch('/api/admin/submissions/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionIds: selectedSubIds })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Successfully deleted ${data.count} submission(s)!`);
        setSelectedSubIds([]);
        fetchSubmissions();
        fetchUsers();
      } else {
        alert(`Error deleting submissions: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Batch delete error:', err);
      alert('Failed to execute batch deletion.');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleDeleteEventSubmissions = async (eventId: string) => {
    const evt = events.find(e => e.id === eventId);
    const evtName = evt?.title || eventId;

    if (!window.confirm(`DANGER: Are you sure you want to PERMANENTLY delete ALL submission data for event "${evtName}"? This action cannot be undone.`)) {
      return;
    }

    setIsProcessingBulk(true);
    try {
      const res = await fetch('/api/admin/submissions/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Successfully deleted ${data.count} submission(s) for event "${evtName}".`);
        setDeleteEventModalOpen(false);
        setTargetDeleteEventId('');
        fetchSubmissions();
        fetchUsers();
      } else {
        alert(`Error deleting event submissions: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Delete event submissions error:', err);
      alert('Failed to delete event submissions.');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleExportCSV = () => {
    const currentEventId = activeTab === 'submissions' && activeEvent ? activeEvent.id : undefined;
    let url = '/api/admin/submissions/export-csv';
    const params = new URLSearchParams();
    if (currentEventId && activeTab === 'submissions') {
      params.append('eventId', currentEventId);
    }
    if (subStatusFilter && subStatusFilter !== 'all') {
      params.append('status', subStatusFilter);
    }
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    window.open(url, '_blank');
  };

  const checkIsCurrentSub = React.useCallback((s: any) => {
    if (!activeEvent) return true;
    if (s.event_id === activeEvent.id || s.eventId === activeEvent.id) return true;
    const subTime = new Date(s.created_at || s.createdAt || 0).getTime();
    const eventStartTime = new Date(activeEvent.start_date || activeEvent.startDate || 0).getTime();
    return eventStartTime > 0 ? subTime >= eventStartTime : true;
  }, [activeEvent]);

  const safeUsers = Array.isArray(users) ? users : [];
  const teamsFilter: Team[] = ['blue', 'green', 'purple', 'red', 'none'];
  const [searchQuery, setSearchQuery] = React.useState('');
  const isAdmin = currentUser?.isAdmin || currentUser?.role === 'admin' || currentUser?.role === 'admins';

  // Handle Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (reviewingId) {
          setReviewingId(null);
        } else if (searchQuery) {
          setSearchQuery('');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reviewingId, searchQuery]);

  const isUserGameSubmission = React.useCallback((s: any) => {
    if (!s) return false;
    if (s.user_id === 'system_notification' || String(s.user_id || '').startsWith('team_pts_')) return false;
    if (
      s.game_name === 'Event Update' ||
      s.game_name === 'Screenshot Points' ||
      s.game_name === 'Bingo Points' ||
      s.game_name === 'Team Award' ||
      s.platform === 'System' ||
      s.platform === 'Screenshot Points' ||
      s.platform === 'Bingo Points'
    ) {
      return false;
    }
    return true;
  }, []);

  const filteredUsers = safeUsers.filter(u => {
    const matchesTeam = filterTeam === 'all' || (u.team || 'none') === filterTeam;
    const nameStr = (u.steam_name || u.steamName || u.discord_name || u.discordName || u.displayName || '').toLowerCase();
    const idStr = String(u.steamid || u.steamId || u.discord_id || u.id || '').toLowerCase();
    const searchLower = searchQuery.toLowerCase();
    return matchesTeam && (nameStr.includes(searchLower) || idStr.includes(searchLower));
  });

  const handleToggleSelectUser = (steamId: string) => {
    setMassSelectedUserIds(prev =>
      prev.includes(steamId) ? prev.filter(id => id !== steamId) : [...prev, steamId]
    );
  };

  const handleSelectAllFilteredUsers = () => {
    const allIds = filteredUsers.map(u => String(u.steamid || u.steamId)).filter(Boolean);
    setMassSelectedUserIds(allIds);
  };

  const handleDeselectAllUsers = () => {
    setMassSelectedUserIds([]);
  };

  const handleMassAssignTeam = async () => {
    if (massSelectedUserIds.length === 0) {
      alert('Please select at least one member to assign a team.');
      return;
    }
    setIsMassAssigning(true);
    setMassAssignSuccessMsg(null);
    try {
      const targetEvId = massTargetEventId === 'active' ? undefined : massTargetEventId;
      const res = await fetch('/api/admin/update-user-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSteamIds: massSelectedUserIds,
          team: massTargetTeam,
          eventId: targetEvId
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMassAssignSuccessMsg(`Successfully assigned ${massTargetTeam.toUpperCase()} team to ${massSelectedUserIds.length} selected member(s)!`);
        await fetchUsers();
        setMassSelectedUserIds([]);
        setTimeout(() => setMassAssignSuccessMsg(null), 5000);
      } else {
        alert(`Failed mass assignment: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Mass assign error:', err);
      alert('Failed to perform mass team assignment.');
    } finally {
      setIsMassAssigning(false);
    }
  };

  const filteredSubmissions = submissions.filter(sub => {
    if (!isUserGameSubmission(sub)) return false;

    // Distinguish based on activeTab: 'submissions' (current event specs) vs 'previous_submissions' (archive)
    const isCurrent = checkIsCurrentSub(sub);
    if (activeTab === 'submissions' && !isCurrent) return false;
    if (activeTab === 'previous_submissions' && isCurrent) return false;

    const matchesTeam = filterTeam === 'all' || (sub.userTeam || 'none') === filterTeam;
    const matchesStatus = subStatusFilter === 'all' || sub.status === subStatusFilter;
    const matchesCompletion = completionFilter === 'all' || sub.completion_status === completionFilter || (completionFilter === 'unfinished' && !sub.completion_status);
    const matchesSearch = (sub.game_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (sub.user_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          String(sub.user_id || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTeam && matchesStatus && matchesCompletion && matchesSearch;
  }).sort((a, b) => {
    if (subStatusFilter === 'pending') {
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    }
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Shield size={48} className="text-red-500 mb-4 opacity-50" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="opacity-50">You do not have permission to access the admin panel.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-center opacity-50">Loading database...</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-6 md:gap-12">
      {backfillProgress && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] w-full max-w-xl px-4 animate-in slide-in-from-top-4 duration-300">
           <div className="dark:bg-[#1a1a1a] bg-white border dark:border-blue-500/30 border-blue-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest dark:text-blue-400 text-blue-600">HLTB Library Backfill in Progress</span>
                </div>
                <span className="text-[10px] font-mono font-bold opacity-40 dark:text-white text-slate-900">
                  {Math.round((backfillProgress.processed / (backfillProgress.total || 1)) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-black/10 dark:bg-white/5 rounded-full overflow-hidden">
                 <div 
                   className="h-full bg-blue-500 transition-all duration-500 ease-out"
                   style={{ width: `${Math.min(100, (backfillProgress.processed / (backfillProgress.total || 1)) * 100)}%` }}
                 />
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold">
                 <span className="dark:text-white/40 text-slate-500 uppercase">Processed: {backfillProgress.processed} / {backfillProgress.total}</span>
                 <span className="dark:text-white/40 text-slate-500 uppercase">Remaining: {backfillProgress.remaining}</span>
              </div>
           </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row border-b border-white/5">
        <button 
          onClick={() => setActiveTab('users')}
          className={cn(
            "flex-1 sm:flex-none px-6 md:px-8 py-3 md:py-4 font-bold text-xs md:text-sm transition-all relative",
            activeTab === 'users' ? theme.text : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
          )}
        >
          User Management
          {activeTab === 'users' && <div className={cn("absolute bottom-0 left-0 right-0 h-1 rounded-t-full", theme.bg, theme.glow)} />}
        </button>
        <button 
          onClick={() => setActiveTab('submissions')}
          className={cn(
            "flex-1 sm:flex-none px-6 md:px-8 py-3 md:py-4 font-bold text-xs md:text-sm transition-all relative flex items-center justify-center gap-2",
            activeTab === 'submissions' ? theme.text : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
          )}
        >
          Game Submissions
          {submissions.filter(s => isUserGameSubmission(s) && s.status === 'pending' && checkIsCurrentSub(s)).length > 0 && (
            <span className={cn("w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center shrink-0", theme.bg)}>
              {submissions.filter(s => isUserGameSubmission(s) && s.status === 'pending' && checkIsCurrentSub(s)).length}
            </span>
          )}
          {activeTab === 'submissions' && <div className={cn("absolute bottom-0 left-0 right-0 h-1 rounded-t-full", theme.bg, theme.glow)} />}
        </button>
        <button 
          onClick={() => setActiveTab('previous_submissions')}
          className={cn(
            "flex-1 sm:flex-none px-6 md:px-8 py-3 md:py-4 font-bold text-xs md:text-sm transition-all relative flex items-center justify-center gap-2",
            activeTab === 'previous_submissions' ? theme.text : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
          )}
        >
          Submissions Archive
          {submissions.filter(s => isUserGameSubmission(s) && s.status === 'pending' && !checkIsCurrentSub(s)).length > 0 && (
            <span className={cn("w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center shrink-0 bg-amber-500")}>
              {submissions.filter(s => isUserGameSubmission(s) && s.status === 'pending' && !checkIsCurrentSub(s)).length}
            </span>
          )}
          {activeTab === 'previous_submissions' && <div className={cn("absolute bottom-0 left-0 right-0 h-1 rounded-t-full", theme.bg, theme.glow)} />}
        </button>
        <button 
          onClick={() => setActiveTab('team_points')}
          className={cn(
            "flex-1 sm:flex-none px-6 md:px-8 py-3 md:py-4 font-bold text-xs md:text-sm transition-all relative flex items-center justify-center gap-2",
            activeTab === 'team_points' ? theme.text : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
          )}
        >
          Team Points
          {activeTab === 'team_points' && <div className={cn("absolute bottom-0 left-0 right-0 h-1 rounded-t-full", theme.bg, theme.glow)} />}
        </button>
        <button 
          onClick={() => setActiveTab('activity_log')}
          className={cn(
            "flex-1 sm:flex-none px-6 md:px-8 py-3 md:py-4 font-bold text-xs md:text-sm transition-all relative flex items-center justify-center gap-2",
            activeTab === 'activity_log' ? theme.text : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
          )}
        >
          <History size={16} />
          Activity Log
          {activeTab === 'activity_log' && <div className={cn("absolute bottom-0 left-0 right-0 h-1 rounded-t-full", theme.bg, theme.glow)} />}
        </button>
      </div>

      {activeTab !== 'team_points' && activeTab !== 'activity_log' && (
        <section className="dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 rounded-3xl p-5 md:p-6 shadow-sm flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1 w-full max-w-xl">
              <span className="text-[10px] uppercase font-black tracking-widest opacity-40 block mb-2 dark:text-white text-slate-500">Query Database</span>
              <div className="relative group">
                <Search className={cn("absolute left-4 top-1/2 -translate-y-1/2 dark:text-white/20 text-slate-300 transition-colors", `group-focus-within:${theme.text}`)} size={18} />
                <input 
                  type="text"
                  placeholder={activeTab === 'users' ? "Search users by name, Discord or Steam ID..." : "Search by game title, player name or Steam ID..."}
                  className={cn("w-full dark:bg-[#181818] bg-slate-50 border dark:border-white/5 border-black/5 rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none transition-all font-sans text-sm dark:text-white text-slate-900", `focus:ring-1 focus:${theme.border}/50`)}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
              <div className="dark:bg-[#181818] bg-slate-50 px-6 py-3 rounded-2xl border dark:border-white/5 border-black/5 h-12 flex items-center justify-center w-full sm:w-auto">
                <span className={cn("text-xl font-mono font-bold leading-none", theme.text)}>
                  {activeTab === 'users' ? filteredUsers.length : filteredSubmissions.length}
                </span>
                <span className="text-[9px] uppercase font-extrabold opacity-30 ml-2 tracking-widest dark:text-white text-slate-500">
                  {activeTab === 'users' ? 'Users' : 'Submissions'} Found
                </span>
              </div>

              {activeTab === 'users' && (
                <div className="relative w-full sm:w-auto">
                  <button 
                    onClick={() => setIsAdminMenuOpen(!isAdminMenuOpen)}
                    className={cn(
                      "w-full sm:w-12 h-12 rounded-2xl transition-all border flex items-center justify-center gap-2 font-bold uppercase text-[10px] sm:text-transparent",
                      "dark:bg-[#181818] bg-slate-50 dark:border-white/5 border-black/5 hover:dark:bg-white/5 hover:bg-slate-100",
                      isAdminMenuOpen ? theme.text + " " + theme.border : "dark:text-white/40 text-slate-500"
                    )}
                    title="Global Admin Actions"
                  >
                    <Settings size={18} className={cn(isAdminMenuOpen && "animate-spin-slow")} />
                    <span className="sm:hidden">Global Config Menu</span>
                  </button>

                  {isAdminMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsAdminMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-3 w-64 dark:bg-[#1a1a1a] bg-white border dark:border-white/10 border-black/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-2 flex flex-col gap-1">
                        <div className="px-3 py-1.5 border-b dark:border-white/5 border-black/5 mb-1">
                           <span className="text-[9px] font-extrabold uppercase tracking-widest opacity-30 dark:text-white text-slate-500">Global Actions</span>
                        </div>

                        <button 
                          onClick={async () => {
                            if (!window.confirm('Search IGDB for missing IDs?')) return;
                            setIsAdminMenuOpen(false);
                            setLoading(true);
                            try {
                              const res = await fetch('/api/admin/repair-submissions', { method: 'POST' });
                              const result = await res.json();
                              alert(res.ok ? `Repair complete! Updated ${result.updatedCount} items.` : `Error: ${result.error}`);
                              fetchData();
                            } catch (err) { alert('Failed to trigger repair'); } finally { setLoading(false); }
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 text-[10px] font-bold uppercase dark:text-emerald-400 text-emerald-600 hover:dark:bg-emerald-500/10 hover:bg-emerald-50 rounded-xl transition-colors text-left"
                        >
                          <Settings size={14} />
                          Repair Missing IDs
                        </button>

                        <button 
                          onClick={async () => {
                            if (!window.confirm('Backfill HLTB times in batches? (Limited to games with existing submissions)')) return;
                            setIsAdminMenuOpen(false);
                            setBackfillProgress({ processed: 0, remaining: 1, total: 0 });
                            
                            let remaining = 1; 
                            let totalProcessed = 0;
                            let totalUpdated = 0;
                            let isFirst = true;

                            try {
                              while (remaining > 0) {
                                const res = await fetch('/api/admin/backfill-hltb', { method: 'POST' });
                                const data = await res.json();
                                if (data.error) throw new Error(data.error);
                                
                                if (isFirst) {
                                  const total = (data.processedCount || 0) + (data.remaining || 0);
                                  setBackfillProgress({ processed: 0, remaining: total, total: total });
                                  isFirst = false;
                                }

                                remaining = data.remaining || 0;
                                totalProcessed += (data.processedCount || 0);
                                totalUpdated += (data.updated || 0);
                                
                                setBackfillProgress(prev => prev ? ({ ...prev, processed: totalProcessed, remaining }) : null);

                                if (remaining > 0) await new Promise(r => setTimeout(r, 1000));
                              }
                              alert(`HLTB Backfill Complete! Successfully updated ${totalUpdated} games. Total processed: ${totalProcessed}`);
                              fetchSubmissions(); // Refresh the submissions list as HLTB data might have changed
                            } catch (err: any) { 
                              alert(`Backfill stopped: ${err.message}`); 
                            } finally { 
                              setBackfillProgress(null);
                            }
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 text-[10px] font-bold uppercase dark:text-blue-400 text-blue-600 hover:dark:bg-blue-500/10 hover:bg-blue-50 rounded-xl transition-colors text-left"
                        >
                          <Search size={14} />
                          Backfill HLTB Cache
                        </button>

                        <button 
                          onClick={async () => {
                            if (!window.confirm('Recalculate ALL points?')) return;
                            setIsAdminMenuOpen(false);
                            setLoading(true);
                            try {
                              const res = await fetch('/api/admin/recalculate-all', { method: 'POST' });
                              if (res.ok) { alert('Recalculated successfully!'); fetchData(); }
                              else { const d = await res.json(); alert(`Error: ${d.error}`); }
                            } catch (err) { alert('Failed to recalculate'); } finally { setLoading(false); }
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 text-[10px] font-bold uppercase dark:text-purple-400 text-purple-600 hover:dark:bg-purple-500/10 hover:bg-purple-50 rounded-xl transition-colors text-left"
                        >
                          <Clock size={14} />
                          Recalculate All
                        </button>
                        
                        <div className="h-[1px] dark:bg-white/5 bg-black/5 my-1" />
                        
                        <button 
                          onClick={() => { setIsAdminMenuOpen(false); fetchData(); }}
                          className="flex items-center gap-3 px-3 py-2.5 text-[10px] font-bold uppercase dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900 hover:dark:bg-white/5 hover:bg-black/5 rounded-xl transition-colors text-left"
                        >
                          <CheckCircle2 size={14} />
                          Refresh Data
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="h-[1px] dark:bg-white/5 bg-black/5 w-full -my-1" />

          <div className="flex flex-col gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest opacity-40 dark:text-white text-slate-500">Filter by Team Allocation</span>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => setFilterTeam('all')}
                className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all border dark:bg-[#181818] bg-slate-50 dark:border-white/5 border-black/5 hover:dark:bg-white/5 hover:bg-black/5 dark:text-white text-slate-700",
                    filterTeam === 'all' && `dark:bg-white/10 bg-black/10 ring-1 dark:ring-white/20 ring-black/10 ${theme.border}`
                )}
              >
                All Teams
              </button>
              {teamsFilter.map(team => (
                <button
                  key={team}
                  onClick={() => setFilterTeam(team)}
                  className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all border dark:border-white/5 border-black/5",
                      filterTeam === team 
                        ? `${TEAM_COLORS[team].primary} ${TEAM_COLORS[team].secondary} ring-1 ring-${team === 'none' ? 'white/20' : team + '-accent'}`
                        : "dark:bg-[#181818] bg-slate-50 dark:text-white/60 text-slate-500 opacity-65 hover:opacity-100"
                  )}
                >
                  {team.charAt(0).toUpperCase() + team.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab !== 'team_points' ? (
        activeTab === 'users' ? (
        <>
          <TeamPointContributionChart 
            users={users} 
            theme={theme} 
            onViewProfile={onViewProfile}
            filterTeam={filterTeam}
          />

          <section className="space-y-6">
            {/* Mass Select & Team Assignment Card */}
            <div className="p-5 md:p-6 dark:bg-[#121212] bg-white rounded-2xl border dark:border-white/10 border-black/10 shadow-lg flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b dark:border-white/5 border-black/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm md:text-base font-black uppercase tracking-wider dark:text-white text-slate-900 flex items-center gap-2">
                      Mass Select Members & Assign Team
                    </h3>
                    <p className="text-[11px] dark:text-white/50 text-slate-500 font-medium">
                      Select multiple members to assign or reassign team rosters for current or previous events.
                    </p>
                  </div>
                </div>
                
                {massSelectedUserIds.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-black self-start sm:self-auto">
                    <span>{massSelectedUserIds.length} member(s) selected</span>
                  </div>
                )}
              </div>

              {massAssignSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-between animate-in fade-in">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    {massAssignSuccessMsg}
                  </span>
                  <button onClick={() => setMassAssignSuccessMsg(null)} className="opacity-60 hover:opacity-100">
                    <XCircle size={14} />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Event Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider opacity-60 dark:text-white text-slate-600">
                    1. Target Event
                  </label>
                  <div className="relative">
                    <select
                      value={massTargetEventId}
                      onChange={(e) => setMassTargetEventId(e.target.value)}
                      className="appearance-none dark:bg-[#1a1a1a] bg-slate-50 border dark:border-white/10 border-black/10 rounded-xl px-3.5 py-2.5 pr-8 text-xs font-bold dark:text-white text-slate-800 focus:outline-none w-full cursor-pointer h-10"
                    >
                      <option value="active">🔥 Current Active Event & Profile Default</option>
                      {events.map((ev: any) => (
                        <option key={ev.id} value={ev.id}>
                          Event #{ev.event_number || ev.eventNumber}: {ev.name} {ev.is_active ? '(Active)' : '(Ended)'}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                      <ChevronDown size={14} />
                    </div>
                  </div>
                </div>

                {/* 2. Team Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider opacity-60 dark:text-white text-slate-600">
                    2. Target Team
                  </label>
                  <div className="relative">
                    <select
                      value={massTargetTeam}
                      onChange={(e) => setMassTargetTeam(e.target.value as Team | 'none')}
                      className={cn(
                        "appearance-none dark:bg-[#1a1a1a] bg-slate-50 border dark:border-white/10 border-black/10 rounded-xl px-3.5 py-2.5 pr-8 text-xs font-bold uppercase tracking-wider focus:outline-none w-full cursor-pointer h-10",
                        massTargetTeam !== 'none' && TEAM_COLORS[massTargetTeam]
                          ? `${TEAM_COLORS[massTargetTeam].secondary} ${TEAM_COLORS[massTargetTeam].primary}`
                          : "dark:text-white text-slate-800"
                      )}
                    >
                      <option value="blue" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Blue Team</option>
                      <option value="green" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Green Team</option>
                      <option value="purple" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Purple Team</option>
                      <option value="red" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Red Team</option>
                      <option value="none" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">None / Unassigned</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                      <ChevronDown size={14} />
                    </div>
                  </div>
                </div>

                {/* 3. Action Buttons */}
                <div className="flex flex-col gap-1.5 justify-end">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider opacity-60 dark:text-white text-slate-600">
                    3. Apply Batch Assignment
                  </label>
                  <button
                    onClick={handleMassAssignTeam}
                    disabled={massSelectedUserIds.length === 0 || isMassAssigning}
                    className="h-10 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-purple-500/20"
                  >
                    {isMassAssigning ? (
                      <span>Assigning...</span>
                    ) : (
                      <>
                        <Shield size={14} />
                        <span>Assign to {massSelectedUserIds.length} Selected</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Selection Helper Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectAllFilteredUsers}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold dark:bg-white/5 bg-slate-100 hover:dark:bg-white/10 hover:bg-slate-200 dark:text-white text-slate-700 transition-colors flex items-center gap-1.5 border dark:border-white/5 border-black/5"
                  >
                    <CheckSquare size={13} className="text-purple-400" />
                    <span>Select All Filtered ({filteredUsers.length})</span>
                  </button>
                  {massSelectedUserIds.length > 0 && (
                    <button
                      onClick={handleDeselectAllUsers}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5 border border-red-500/20"
                    >
                      <XCircle size={13} />
                      <span>Deselect All</span>
                    </button>
                  )}
                </div>

                <div className="text-[11px] dark:text-white/40 text-slate-400 font-medium">
                  {massTargetEventId === 'active' 
                    ? 'Updates profile team & current active event roster.' 
                    : `Updates team roster for historical ${events.find((e: any) => e.id === massTargetEventId)?.name || 'Selected Event'}.`}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-lg md:text-xl font-bold dark:text-white text-slate-900">User Directory</h2>
              <span className="text-xs font-bold dark:text-white/40 text-slate-500">
                {filteredUsers.length} member(s) listed
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {filteredUsers.map((u, idx) => {
                const userId = u.steamid || u.steamId || u.discord_id || u.id || `user-${idx}`;
                const userName = u.steam_name || u.steamName || u.discord_name || u.discordName || u.displayName || 'User';
                const userAvatar = u.steam_avatar || u.steamAvatar || u.discord_avatar || u.discordAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
                const teamColorObj = u.team && u.team !== 'none' && TEAM_COLORS[u.team as Team] ? TEAM_COLORS[u.team as Team] : null;
                const isMassSelected = massSelectedUserIds.includes(userId);

                return (
                <div 
                  key={userId} 
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 md:p-6 dark:bg-[#111111] bg-white rounded-2xl border relative group shadow-sm transition-all min-w-0",
                    isMassSelected 
                      ? "border-purple-500/60 dark:bg-purple-500/5 bg-purple-50/50 ring-1 ring-purple-500/30" 
                      : "dark:border-white/5 border-black/5 hover:dark:border-white/10 hover:border-black/10"
                  )}
                >
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                      <input
                        type="checkbox"
                        checked={isMassSelected}
                        onChange={() => handleToggleSelectUser(userId)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-white/20 text-purple-500 focus:ring-purple-500 cursor-pointer shrink-0"
                        title="Select for Mass Team Assignment"
                      />
                      <button 
                        onClick={() => onViewProfile?.(userId)}
                        className={cn(
                          "w-12 h-12 md:w-14 md:h-14 rounded-full border-2 p-1 shrink-0 transition-all hover:scale-105 active:scale-95",
                          teamColorObj ? teamColorObj.border : "dark:border-white/10 border-black/10"
                        )}
                        title="View Profile"
                      >
                        <img src={userAvatar} alt="" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                      </button>
                      <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span className="text-sm font-black text-blue-400 truncate">{userName}</span>
                            {u.role === 'admin' && (
                              <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">Admin</span>
                            )}
                            {u.discord_name && u.steam_name && (
                              <span className="text-[10px] font-bold dark:text-white/40 text-slate-400 truncate">
                                ({u.discord_name})
                              </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 shrink-0">
                          <div className="flex items-center gap-1.5">
                              <span className="text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">Points:</span>
                              <span className={cn("text-xs font-mono font-bold", theme.text)}>{u.points || 0}</span>
                          </div>
                          <span className="text-slate-300 dark:text-white/10">|</span>
                          <span className="text-[10px] font-mono opacity-40 dark:text-white/40 text-slate-400 select-all" title="Click to copy ID">ID: {userId}</span>
                        </div>
                      </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0 w-full sm:w-auto justify-end">
                    <div className="flex flex-col gap-1 w-32 md:w-36">
                      <span className="text-[9px] uppercase font-extrabold opacity-30 dark:text-white text-slate-500 tracking-wider">Assign Team</span>
                      <div className="relative">
                        <select
                          value={u.team || 'none'}
                          disabled={updating === userId}
                          onChange={(e) => assignTeam(userId, e.target.value as Team)}
                          className={cn(
                            "appearance-none dark:bg-[#181818] bg-slate-50 border dark:border-white/5 border-black/5 rounded-xl px-3 py-1.5 pr-8 text-[11px] font-bold uppercase tracking-wider focus:outline-none transition-all w-full cursor-pointer h-9",
                            teamColorObj 
                              ? `${teamColorObj.secondary} ${teamColorObj.primary} dark:border-${u.team}-500/30 border-${u.team}-500/20` 
                              : "dark:text-white/60 text-slate-600"
                          )}
                        >
                          <option value="none" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">None/Unassigned</option>
                          <option value="blue" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Blue Team</option>
                          <option value="green" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Green Team</option>
                          <option value="purple" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Purple Team</option>
                          <option value="red" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Red Team</option>
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                          <ChevronDown size={12} />
                        </div>
                      </div>
                    </div>

                    <div className="relative mt-4">
                       <button
                         onClick={() => setSettingsUserId(settingsUserId === userId ? null : userId)}
                         className="h-9 w-9 dark:bg-white/5 bg-slate-50 dark:text-white/40 text-slate-400 hover:dark:text-white hover:text-slate-900 rounded-xl transition-colors flex items-center justify-center border dark:border-transparent border-black/5 hover:border-black/10 shrink-0"
                         title="Account Actions"
                       >
                         <Settings size={14} className={cn(settingsUserId === userId && theme.text)} />
                       </button>
                       {settingsUserId === userId && (
                         <>
                           <div className="fixed inset-0 z-30" onClick={() => setSettingsUserId(null)} />
                           <div className="absolute right-0 bottom-full mb-2 w-48 dark:bg-[#1c1c1c] bg-white border dark:border-white/10 border-black/10 rounded-xl shadow-2xl z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                             <div className="p-1.5 flex flex-col gap-0.5">
                               <button 
                                 onClick={() => { setEditingUserEventTeams(u); setSettingsUserId(null); }}
                                 className="flex items-center gap-2 w-full px-3 py-2 text-left text-[10px] font-bold uppercase dark:text-white text-slate-700 hover:dark:bg-white/10 hover:bg-slate-50 rounded-lg transition-colors"
                               >
                                 <Trophy size={14} className="text-purple-400" />
                                 Manage Event Teams
                               </button>
                               <div className="h-[1px] dark:bg-white/5 bg-black/5 my-1" />
                               <button 
                                 onClick={() => { handleUpdateRole(userId, u.role === 'admin' ? 'member' : 'admin'); setSettingsUserId(null); }}
                                 disabled={updating === userId || userId === currentUser?.steamId || userId === currentUser?.discordId}
                                 className="flex items-center gap-2 w-full px-3 py-2 text-left text-[10px] font-bold uppercase dark:text-white text-slate-700 hover:dark:bg-white/10 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                               >
                                 <Shield size={14} className={u.role === 'admin' ? 'text-red-500' : 'text-emerald-500'} />
                                 {u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                               </button>
                               <div className="h-[1px] dark:bg-white/5 bg-black/5 my-1" />
                               <button 
                                 onClick={() => { handleKickUser(userId, userName); setSettingsUserId(null); }}
                                 disabled={updating === userId || userId === currentUser?.steamId || userId === currentUser?.discordId}
                                 className="flex items-center gap-2 w-full px-3 py-2 text-left text-[10px] font-bold uppercase text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                               >
                                 <XCircle size={14} />
                                 Kick Member
                               </button>
                             </div>
                           </div>
                         </>
                       )}
                     </div>
                  </div>
                </div>
              );
            })}
            </div>
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-6 md:gap-8">
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 md:gap-6">
            <div>
              <h2 className="text-lg md:text-xl font-bold dark:text-white text-slate-900">
                {activeTab === 'submissions' ? 'Review Submissions (Current Event)' : 'Submissions Archive (Previous Events)'}
              </h2>
              {activeTab === 'submissions' && activeEvent && (
                <p className="text-xs text-slate-500 dark:text-white/40 mt-1">Active Event: <span className={cn("font-black", theme.text)}>{activeEvent.title}</span></p>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-end gap-4 w-full xl:w-auto">
              {/* Review Status Filter */}
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-white/30 ml-1">Review Status</span>
                <div className="flex overflow-x-auto w-full sm:w-auto scrollbar-hide dark:bg-[#111111] bg-slate-100 rounded-xl border dark:border-white/5 border-black/5 p-1 shrink-0">
                  {(['all', 'pending', 'verified', 'rejected'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setSubStatusFilter(status)}
                      className={cn(
                        "px-3 md:px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap",
                        subStatusFilter === status ? theme.bg + " text-white" : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Completion Status Filter */}
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-white/30 ml-1">Completion Status</span>
                <div className="flex overflow-x-auto w-full sm:w-auto scrollbar-hide dark:bg-[#111111] bg-slate-100 rounded-xl border dark:border-white/5 border-black/5 p-1 shrink-0">
                  {(['all', 'unfinished', 'beaten', 'completed', 'abandoned'] as const).map((comp) => (
                    <button
                      key={comp}
                      onClick={() => setCompletionFilter(comp)}
                      className={cn(
                        "px-3 md:px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap",
                        completionFilter === comp ? theme.bg + " text-white" : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
                      )}
                    >
                      {comp}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 md:gap-4 text-[10px] uppercase tracking-widest font-bold opacity-40 sm:mb-2 ml-1">
                <span className="flex items-center gap-1">
                  <Clock size={12} /> 
                  {
                    submissions.filter(s => {
                      if (!isUserGameSubmission(s)) return false;
                      const isCurrent = checkIsCurrentSub(s);
                      const matchesTab = activeTab === 'submissions' ? isCurrent : !isCurrent;
                      return s.status === 'pending' && matchesTab;
                    }).length
                  } Pending
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 size={12} /> 
                  {
                    submissions.filter(s => {
                      if (!isUserGameSubmission(s)) return false;
                      const isCurrent = checkIsCurrentSub(s);
                      const matchesTab = activeTab === 'submissions' ? isCurrent : !isCurrent;
                      return s.status === 'verified' && matchesTab;
                    }).length
                  } Verified
                </span>
              </div>
            </div>
          </div>

          {/* Action Toolbar for Bulk Actions & Export */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 dark:bg-[#181818] bg-slate-50 border dark:border-white/5 border-black/5 rounded-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  const allFilteredIds = filteredSubmissions.map(s => s.id);
                  if (selectedSubIds.length === allFilteredIds.length && allFilteredIds.length > 0) {
                    setSelectedSubIds([]);
                  } else {
                    setSelectedSubIds(allFilteredIds);
                  }
                }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all border dark:bg-white/5 bg-white hover:bg-slate-100 dark:hover:bg-white/10 dark:text-white text-slate-700 border-black/10 dark:border-white/10"
              >
                {selectedSubIds.length === filteredSubmissions.length && filteredSubmissions.length > 0 ? 'Deselect All' : `Select All (${filteredSubmissions.length})`}
              </button>

              {activeTab === 'submissions' && (
                <button
                  onClick={() => handleMassAccept()}
                  disabled={isProcessingBulk}
                  className="px-3.5 py-1.5 rounded-xl text-[10px] font-extrabold uppercase transition-all bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 flex items-center gap-1.5 disabled:opacity-50"
                  title="Mass accept selected submissions or all pending submissions in current view"
                >
                  <CheckCircle2 size={13} />
                  {selectedSubIds.length > 0 ? `Mass Accept Selected (${selectedSubIds.length})` : 'Mass Accept Pending'}
                </button>
              )}

              {selectedSubIds.length > 0 && (
                <button
                  onClick={handleBatchDeleteSelected}
                  disabled={isProcessingBulk}
                  className="px-3.5 py-1.5 rounded-xl text-[10px] font-extrabold uppercase transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <XCircle size={13} />
                  Delete Selected ({selectedSubIds.length})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="px-3.5 py-1.5 rounded-xl text-[10px] font-extrabold uppercase transition-all bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/30 flex items-center gap-1.5 shadow-sm"
                title="Export submission data to a CSV file"
              >
                <Download size={13} />
                Export CSV
              </button>

              {activeTab === 'previous_submissions' && (
                <button
                  onClick={() => setDeleteEventModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl text-[10px] font-extrabold uppercase transition-all bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1.5"
                  title="Delete all submission data for a previous event"
                >
                  <Trash2 size={13} />
                  Delete Past Event Submissions
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:gap-6">
            {filteredSubmissions.length === 0 ? (
              <div className="p-8 md:p-12 border-2 border-dashed dark:border-white/5 border-black/5 rounded-3xl text-center">
                <p className="opacity-30 dark:text-white text-slate-500 text-sm">
                  No {subStatusFilter !== 'all' ? subStatusFilter : ''} {completionFilter !== 'all' ? `(${completionFilter})` : ''} submissions found.
                </p>
              </div>
            ) : (
              filteredSubmissions.map(sub => {
                // Custom Outer Glow Mapping
                let outerGlowClass = "shadow-[0_0_20px_-5px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_-5px_rgba(255,255,255,0.05)] hover:dark:shadow-[0_0_30px_-5px_rgba(255,255,255,0.1)] border-black/5 dark:border-white/5";
                
                if (sub.userTeam === 'blue') outerGlowClass = "shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)] hover:shadow-[0_0_40px_-5px_rgba(59,130,246,0.5)] border-blue-500/40 hover:border-blue-500/60";
                if (sub.userTeam === 'green') outerGlowClass = "shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_-5px_rgba(16,185,129,0.5)] border-green-500/40 hover:border-green-500/60";
                if (sub.userTeam === 'purple') outerGlowClass = "shadow-[0_0_30px_-5px_rgba(168,85,247,0.3)] hover:shadow-[0_0_40px_-5px_rgba(168,85,247,0.5)] border-purple-500/40 hover:border-purple-500/60";
                if (sub.userTeam === 'red') outerGlowClass = "shadow-[0_0_30px_-5px_rgba(239,68,68,0.3)] hover:shadow-[0_0_40px_-5px_rgba(239,68,68,0.5)] border-red-500/40 hover:border-red-500/60";

                return (
                  <div key={sub.id} className={cn(
                    "p-4 md:p-6 dark:bg-[#111111] bg-white rounded-2xl border flex flex-col md:flex-row gap-4 md:gap-8 items-stretch md:items-start relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:z-10",
                    outerGlowClass // Apply the custom glow here instead of TEAM_COLORS
                  )}>
                    
                    {/* Top Right Clickable ID (Conditional Steam / IGDB link) */}
                    {sub.steam_appid ? (
                    <a
                      href={`https://store.steampowered.com/app/${sub.steam_appid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute top-2 right-2 md:top-4 md:right-4 z-10 bg-[#1b2838]/80 backdrop-blur-md hover:bg-[#203044]/90 text-white text-[10px] font-mono px-2 py-1 rounded-md border border-white/10 transition-all flex items-center gap-1.5 shadow-lg"
                      title="Open Steam Store"
                    >
                      <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" className="w-3 h-3 filter invert opacity-90" alt="" />
                      Steam
                    </a>
                  ) : sub.game_name ? (
                    <a
                      // Uses the game title to search IGDB since they don't route by ID
                      href={`https://www.igdb.com/search?q=${encodeURIComponent(sub.game_name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute top-2 right-2 md:top-4 md:right-4 z-10 bg-purple-900/60 backdrop-blur-md hover:bg-purple-900/80 text-purple-100 text-[10px] font-mono px-2 py-1 rounded-md border border-purple-500/30 transition-all flex items-center gap-1.5 shadow-lg"
                      title="Search Game on IGDB"
                    >
                      <ExternalLink size={10} />
                      IGDB
                    </a>
                  ) : null}

                  {/* The Hybrid Cover Image */}
                  {/* Mobile: Bleeds to edges (-mx-4 -mt-4) as a banner. Desktop: Resets to normal vertical cover. */}
                  <div className="-mx-4 -mt-4 md:mx-0 md:mt-0 w-auto md:w-32 h-32 sm:h-48 md:h-auto md:aspect-[3/4] shrink-0 relative bg-black/20 md:rounded-xl overflow-hidden md:shadow-xl">
                      <img src={sub.game_image} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                  </div>

                  {/* Content - Forced min-w-0 prevents blowout */}
                  <div className="flex-1 min-w-0 flex flex-col gap-3 md:gap-4 justify-between md:justify-start">
                    
                    {/* Header Info */}
                    <div className="flex flex-col xl:flex-row justify-between xl:items-start gap-2 md:gap-4 min-w-0">
                      <div className="min-w-0 pr-16 md:pr-24"> {/* Added right padding so text doesn't overlap the absolute ID tag */}
                        <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                           <input
                             type="checkbox"
                             checked={selectedSubIds.includes(sub.id)}
                             onChange={(e) => {
                               if (e.target.checked) {
                                 setSelectedSubIds(prev => [...prev, sub.id]);
                               } else {
                                 setSelectedSubIds(prev => prev.filter(id => id !== sub.id));
                               }
                             }}
                             className="w-4 h-4 rounded border-slate-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                             title="Select for bulk action"
                           />
                           <div className={cn(
                             "px-1.5 md:px-2 py-0.5 rounded text-[7px] md:text-[8px] uppercase font-bold tracking-widest border shrink-0",
                             (sub.userTeam && TEAM_COLORS[sub.userTeam as Team]) ? TEAM_COLORS[sub.userTeam as Team].primary : TEAM_COLORS.none.primary,
                             (sub.userTeam && TEAM_COLORS[sub.userTeam as Team]) ? TEAM_COLORS[sub.userTeam as Team].border : TEAM_COLORS.none.border,
                             (sub.userTeam && TEAM_COLORS[sub.userTeam as Team]) ? TEAM_COLORS[sub.userTeam as Team].secondary : TEAM_COLORS.none.secondary
                           )}>
                             Team {sub.userTeam || 'none'}
                           </div>
                           <span className="text-[8px] md:text-[10px] opacity-30 font-bold uppercase tracking-widest dark:text-white text-slate-500 shrink-0">Submission</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                            <img src={sub.user_avatar} className="w-5 h-5 md:w-6 md:h-6 rounded-full shrink-0" alt="" referrerPolicy="no-referrer" />
                            <h3 className="font-bold text-xs md:text-sm truncate">{sub.user_name}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 shrink-0">
                            <a 
                              href={`https://steamcommunity.com/profiles/${sub.user_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[9px] md:text-[10px] text-blue-400 hover:underline flex items-center gap-1 shrink-0 w-fit"
                            >
                              <img src="https://www.google.com/s2/favicons?domain=steampowered.com&sz=16" className="w-2.5 h-2.5 md:w-3 md:h-3 grayscale" alt="" />
                              Profile
                            </a>
                            {sub.steam_appid && (
                              <a 
                                href={
                                  String(sub.user_id).match(/^\d+$/)
                                    ? `https://steamcommunity.com/profiles/${sub.user_id}/stats/${sub.steam_appid}`
                                    : `https://steamcommunity.com/id/${sub.user_id}/stats/appid/${sub.steam_appid}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] md:text-[10px] text-purple-400 hover:underline flex items-center gap-1 shrink-0 w-fit inline-flex items-center"
                                title="View User Steam Achievements"
                              >
                                <span className="scale-75 select-none font-sans">🏆</span> Achievements
                              </a>
                            )}
                            <span className="text-[9px] md:text-[10px] opacity-45 dark:text-white/60 text-slate-500 font-mono flex items-center gap-1 shrink-0" title="Submission received timestamp">
                              📅 {new Date(sub.created_at).toLocaleDateString()} {new Date(sub.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* HLTB & Stats Wrap */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 md:gap-3 w-full xl:w-auto min-w-0 overflow-hidden">
                         
                         <div className="flex overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-hide items-center gap-2">
                             {hltbData[sub.game_name] && !hltbData[sub.game_name].notFound && (
                               <div className="flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-lg md:rounded-xl bg-purple-500/10 border border-purple-500/20 shadow-lg shadow-purple-500/5 shrink-0">
                                 <div className="flex flex-col items-center min-w-[24px] md:min-w-[30px]">
                                   <span className="text-[6px] md:text-[7px] uppercase font-bold opacity-50 text-purple-400">Main</span>
                                   <span className="text-xs md:text-sm font-black text-purple-400 leading-none">{hltbData[sub.game_name].hltb_main}h</span>
                                 </div>
                                 <div className="w-px h-5 md:h-6 dark:bg-white/10 bg-black/5 mx-0.5 md:mx-1" />
                                 <div className="flex flex-col items-center min-w-[24px] md:min-w-[30px]">
                                   <span className="text-[6px] md:text-[7px] uppercase font-bold opacity-50 text-blue-400">Extra</span>
                                   <span className="text-xs md:text-sm font-black text-blue-400 leading-none">{hltbData[sub.game_name].hltb_extras}h</span>
                                 </div>
                                 <div className="w-px h-5 md:h-6 dark:bg-white/10 bg-black/5 mx-0.5 md:mx-1" />
                                 <div className="flex flex-col items-center min-w-[24px] md:min-w-[30px]">
                                   <span className="text-[6px] md:text-[7px] uppercase font-bold opacity-50 text-purple-400">Comp</span>
                                   <span className="text-xs md:text-sm font-black text-purple-400 leading-none">{hltbData[sub.game_name].hltb_completionist}h</span>
                                 </div>
                               </div>
                             )}

                             {hltbData[sub.game_name]?.notFound && (
                                <div className="flex flex-col items-center px-2 py-1 md:py-1.5 rounded-lg md:rounded-xl bg-slate-500/10 border border-slate-500/20 opacity-40 shrink-0">
                                  <span className="text-[7px] md:text-[8px] uppercase font-black tracking-widest text-slate-500">HLTB NA</span>
                                  <span className="text-[9px] md:text-[10px] font-bold text-slate-500">Not Found</span>
                                </div>
                             )}

                             {hltbData[sub.game_name] && !hltbData[sub.game_name].notFound && (
                                   <>
                                     {sub.hours_during >= (parseInt(hltbData[sub.game_name].hltb_main) || 1) * 5 ? (
                                       <div className="flex items-center gap-1.5 px-2 py-1.5 md:py-2 rounded-lg bg-red-600/20 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)] shrink-0">
                                         <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-red-500 animate-pulse ring-2 md:ring-4 ring-red-500/20" />
                                         <span className="text-[8px] md:text-[10px] font-black text-red-500 uppercase tracking-widest leading-none">Review!</span>
                                       </div>
                                     ) : (
                                       <div className="flex items-center gap-1.5 px-2 py-1.5 md:py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                                         <div className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-emerald-500/60" />
                                         <span className="text-[8px] md:text-[9px] font-bold text-emerald-500/80 uppercase tracking-widest leading-none">Normal</span>
                                       </div>
                                     )}
                                   </>
                                 )}
                                 {(!hltbData[sub.game_name] || hltbData[sub.game_name]?.loading || fetchingHLTB === sub.game_name) && (
                                   <div className="flex flex-col items-center px-3 py-1.5 md:py-2 border border-blue-500/20 rounded-lg md:rounded-xl bg-blue-500/5 animate-pulse shrink-0">
                                      <span className="text-[8px] md:text-[10px] font-black text-blue-400 uppercase tracking-widest">Searching</span>
                                      <div className="flex gap-1 mt-0.5 md:mt-1">
                                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce delay-75" />
                                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce delay-150" />
                                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce delay-225" />
                                      </div>
                                   </div>
                                 )}
                         </div>

                         <div className="hidden bg-black/5 dark:bg-white/5 px-2 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl flex items-center gap-3 md:gap-6 border border-black/5 dark:border-white/5 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
                          <div className="flex flex-col">
                            <span className="text-[8px] md:text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">🏆</span>
                            <span className="text-sm md:text-lg font-bold dark:text-white text-slate-800">
                              {sub.achievements_during}
                              {sub.totalAchievements > 0 ? <span className="text-xs md:text-sm font-normal opacity-50">/{sub.totalAchievements}</span> : ''}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] md:text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">🕒</span>
                            <span className="text-sm md:text-lg font-bold dark:text-white text-slate-800">{Number(sub.hours_during || 0).toFixed(1)}h</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] md:text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">Pts</span>
                            <span className={cn("text-sm md:text-lg font-bold", theme.text)}>{sub.calculated_score || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Game Title */}
                    <div className="flex flex-col min-w-0">
                       <h4 className="text-base sm:text-lg md:text-xl font-bold tracking-tight truncate dark:text-white text-slate-900 capitalize">{sub.game_name}</h4>
                    </div>

                    {/* Detailed Stats Tracking Grid (Slightly bigger per user request) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full bg-slate-50 dark:bg-white/[0.04] p-4 rounded-xl border border-black/5 dark:border-white/5 opacity-90">
                      {/* Achievements section */}
                      <div className="space-y-1.5 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🏆</span>
                          <span className="text-[10px] md:text-xs font-bold text-slate-500 dark:text-white/45 uppercase tracking-widest">Achievements</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-center font-mono rounded-lg">
                          <div className="bg-slate-200/50 dark:bg-white/5 p-2 rounded-xl border border-black/5 dark:border-white/5">
                            <span className="block text-[8px] uppercase tracking-tighter opacity-50 dark:text-white text-slate-600">Before</span>
                            <span className="text-xs md:text-sm font-bold dark:text-white text-slate-800">{sub.achievements_before || 0}</span>
                          </div>
                          <div className="p-2 rounded-xl border bg-emerald-500/10 border-emerald-500/20">
                            <span className="block text-[8px] uppercase tracking-tighter text-emerald-600 dark:text-emerald-400 font-bold font-sans">During</span>
                            <span className="text-xs md:text-sm font-black text-emerald-600 dark:text-emerald-400">+{sub.achievements_during}</span>
                          </div>
                          <div className="bg-slate-200/50 dark:bg-white/5 p-2 rounded-xl border border-black/5 dark:border-white/5">
                            <span className="block text-[8px] uppercase tracking-tighter opacity-50 dark:text-white text-slate-600">Current</span>
                            <span className="text-xs md:text-sm font-bold dark:text-white text-slate-800">
                              {(sub.achievements_before || 0) + sub.achievements_during}
                              {sub.totalAchievements > 0 && <span className="text-[9.5px] opacity-40">/{sub.totalAchievements}</span>}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Play Time section - with deduction! */}
                      <div className="space-y-1.5 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🕒</span>
                          <span className="text-[10px] md:text-xs font-bold text-slate-500 dark:text-white/45 uppercase tracking-widest">Play Time</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-center font-mono rounded-lg">
                          <div className="bg-slate-200/50 dark:bg-white/5 p-2 rounded-xl border border-black/5 dark:border-white/5">
                            <span className="block text-[8px] uppercase tracking-tighter opacity-50 dark:text-white text-slate-600">Before</span>
                            <span className="text-xs md:text-sm font-bold dark:text-white text-slate-800">{Number(sub.hours_before || 0).toFixed(1)}h</span>
                          </div>
                          <div className="bg-slate-200/50 dark:bg-white/5 p-2 rounded-xl border border-black/5 dark:border-white/5">
                            <span className="block text-[8px] uppercase tracking-tighter opacity-50 dark:text-white text-slate-600">Reported</span>
                            <span className="text-xs md:text-sm font-bold dark:text-white text-slate-800">{Number(sub.hours_during || 0).toFixed(1)}h</span>
                          </div>
                          <div className="p-2 rounded-xl border bg-blue-500/10 border-blue-500/20">
                            <span className="block text-[8px] uppercase tracking-tighter text-blue-600 dark:text-blue-400 font-bold font-sans">Adjusted</span>
                            <span className="text-xs md:text-sm font-black text-blue-600 dark:text-blue-400">{(Math.max(0, sub.hours_during - (sub.hours_before || 0))).toFixed(1)}h</span>
                          </div>
                        </div>
                      </div>

                      {/* Points & Multiplier Badge */}
                      <div className="flex sm:flex-col justify-between sm:justify-center items-center bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/10 dark:border-blue-500/20 rounded-xl px-4 py-3 sm:py-2 w-full col-span-1 sm:col-span-2 md:col-span-1">
                        <div className="text-left sm:text-center w-full sm:w-auto">
                          <span className="text-[8px] text-slate-500 dark:text-blue-300 uppercase tracking-widest block leading-none">Multiplier</span>
                          <span className="text-[11px] md:text-xs font-black text-blue-400 mt-1 block">
                            {parseNotesMeta(sub.notes).hasNoAchievements ? "Non-Ach Bracket" : `${sub.multiplier || 1.0}x`}
                          </span>
                        </div>
                        <div className="h-px w-full dark:bg-white/10 bg-black/10 my-1.5 hidden sm:block" />
                        <div className="text-right sm:text-center w-full sm:w-auto mt-0 sm:mt-1">
                          <span className="text-[8px] text-slate-500 dark:text-blue-300 uppercase tracking-widest block leading-none font-sans">Awarded</span>
                          <span className={cn("text-base md:text-lg font-black mt-0.5 block", theme.text)}>{sub.calculated_score || 0} pts</span>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    {(() => {
                      const meta = parseNotesMeta(sub.notes);
                      return (
                        <div className="space-y-2 mt-2">
                          {meta.hasNoAchievements && (
                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-[10px] font-bold uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-md">
                                No Achievements/Nintendo Game
                              </span>
                              {meta.level !== undefined && (
                                <span className="text-[10px] font-bold uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-md">
                                  Award Level: {meta.level === 0 ? 'Level 0 (x0.15)' : meta.level === 1 ? 'Level 1 (x0.40)' : 'Level 2 (Full)'}
                                </span>
                              )}
                            </div>
                          )}
                          {meta.userNotes && (
                            <div className="p-2 md:p-4 dark:bg-white/5 bg-slate-50 rounded-lg md:rounded-xl border dark:border-white/5 border-black/5 text-xs md:text-sm italic opacity-70 dark:text-white text-slate-600 max-h-24 md:max-h-32 overflow-y-auto scrollbar-thin dark:scrollbar-track-white/5 dark:scrollbar-thumb-white/20 hover:opacity-100 transition-all select-text">
                              <div className="break-words whitespace-pre-wrap">
                                {meta.userNotes.split(/(\s+)/).map((part: string, i: number) => {
                                  if (part.match(/^https?:\/\//)) {
                                     return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{part}</a>;
                                  }
                                  return part;
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Actions footer */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4 mt-1 w-full">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className={cn(
                            "text-[8px] md:text-[10px] font-bold uppercase py-1 px-2 md:px-3 rounded-full flex items-center gap-1.5 md:gap-2",
                            sub.status === 'pending' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                            sub.status === 'verified' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                            "bg-red-500/10 text-red-500 border border-red-500/20"
                          )}>
                            {sub.status === 'pending' ? <Clock className="w-2.5 h-2.5 md:w-3 md:h-3" /> : sub.status === 'verified' ? <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3" /> : <XCircle className="w-2.5 h-2.5 md:w-3 md:h-3" />}
                            {sub.status}
                          </div>

                          {sub.completion_status && (
                            <div className={cn(
                              "text-[8px] md:text-[10px] font-bold uppercase py-1 px-2 md:px-3 rounded-full border",
                              sub.completion_status === 'completed' ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                              sub.completion_status === 'beaten' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                              sub.completion_status === 'abandoned' ? "bg-slate-500/10 text-slate-400 border-slate-500/20" :
                              "bg-white/5 text-white/40 border-white/10"
                            )}>
                              {sub.completion_status}
                            </div>
                          )}

                          {sub.beaten_previous === 'yes' && (
                            <div className="text-[8px] md:text-[10px] font-bold uppercase py-1 px-2 md:px-3 rounded-full border bg-purple-500/10 text-purple-400 border-purple-500/20">
                              Prev Beaten
                            </div>
                          )}

                          {(() => {
                            const subEvent = events.find((e: any) => e.id === sub.event_id);
                            if (!subEvent) return null;
                            return (
                              <div className="text-[8px] md:text-[10px] font-bold uppercase py-1 px-2 md:px-3 rounded-full border bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20 flex items-center gap-1">
                                📅 {subEvent.title}
                              </div>
                            );
                          })()}
                        </div>

                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        {sub.steam_appid && (
                          <a 
                            href={
                              String(sub.user_id).match(/^\d+$/)
                                ? `https://steamcommunity.com/profiles/${sub.user_id}/stats/${sub.steam_appid}`
                                : `https://steamcommunity.com/id/${sub.user_id}/stats/appid/${sub.steam_appid}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-lg md:rounded-xl font-bold text-[10px] md:text-xs transition-all border shrink-0 flex items-center justify-center gap-1.5",
                              "bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20"
                            )}
                          >
                            🏆 Achievements Page
                          </a>
                        )}
                        <button 
                          onClick={() => {
                            setReviewingId(sub.id);
                            fetchHLTBForGame(sub.game_name);
                            
                            // Load existing values for editing
                            const hours = Number(sub.hours_during || 0);
                            const achievements = Number(sub.achievements_during || 0);
                            setEditHours(String(hours));
                            setEditAchievements(String(achievements));
                            
                            const hoursBefore = Number(sub.hours_before || 0);
                            const eventHours = Math.max(0, hours - hoursBefore);
                            
                            let m = 1.0;
                            if (eventHours < 8) m = 1.0;
                            else if (eventHours < 15) m = 2.0;
                            else if (eventHours < 25) m = 3.0;
                            else m = 4.0;
 
                            setEditMultiplier(m);
                            
                            const meta = parseNotesMeta(sub.notes);
                            let initialLvl = 2;
                            if (meta.hasNoAchievements) {
                              initialLvl = meta.level !== undefined ? meta.level : 2;
                            }
                            setSelectedLevel(initialLvl);

                            let basePoints = 0;
                            const isBeatenPrev = sub.beaten_previous === 'yes';
                            const effectiveReviewStatus = (sub.completion_status === 'beaten' && isBeatenPrev) ? 'unfinished' : (sub.completion_status || 'unfinished');

                            if (meta.hasNoAchievements) {
                              const hltb = hltbData[sub.game_name] || { hltb_main: sub.hltb_main, hltb_extras: sub.hltb_extras };
                              const hoursBefore = Number(sub.hours_before || 0);
                              const finalPlayTime = Math.max(0, hours - hoursBefore);
                              basePoints = calculateNonAchievementPoints(initialLvl, finalPlayTime, hltb, effectiveReviewStatus);
                            } else {
                              let bonus = 0;
                              if (effectiveReviewStatus === 'completed') {
                                bonus = 30;
                              } else if (effectiveReviewStatus === 'beaten') {
                                bonus = 15;
                              }
                              basePoints = Math.round(achievements * m) + bonus;
                            }
                            const initialPointsVal = (sub.points !== undefined && sub.points !== null && sub.status === 'verified') ? sub.points : basePoints;
                            setPointsAwarded(String(initialPointsVal));
                            setRejectionReason(sub.rejection_reason || '');
                          }}
                          className={cn(
                            "flex-1 sm:flex-none px-3 md:px-6 py-2 rounded-lg md:rounded-xl font-bold text-[10px] md:text-xs transition-all border shrink-0",
                            "dark:bg-white/5 bg-black/5 dark:hover:bg-white/10 hover:bg-black/10 dark:text-white text-slate-800 border-black/10 dark:border-white/5"
                          )}
                        >
                          {sub.status === 'pending' ? 'Review' : 'Modify'}
                        </button>
                        <button 
                          disabled={updating === sub.id}
                          onClick={() => handleDeleteSubmission(sub.id)}
                          className="flex-1 sm:flex-none bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 md:px-4 py-2 rounded-lg md:rounded-xl font-bold text-[10px] md:text-xs transition-all border border-red-500/20 shrink-0"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Review Dialog */}
                  {reviewingId === sub.id && (
                     <div className="absolute inset-0 z-20 backdrop-blur-xl bg-black/80 md:bg-black/60 p-4 md:p-6 flex flex-col gap-4 md:gap-6 justify-center animate-in fade-in zoom-in duration-200 overflow-y-auto">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex flex-col">
                          <h4 className={cn("font-bold uppercase tracking-widest text-sm md:text-base", theme.text)}>Modifying {sub.user_name}</h4>
                          <p className="text-[9px] md:text-[10px] opacity-40 uppercase font-black tracking-tighter dark:text-white">Reviewing: {sub.game_name}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 md:gap-4 w-full sm:w-auto">
                          {hltbData[sub.game_name] && !hltbData[sub.game_name].notFound && (
                            <div className="flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 rounded-lg md:rounded-xl bg-white/5 border border-white/10">
                               <div className="flex flex-col items-center">
                                 <span className="text-[7px] md:text-[8px] uppercase font-bold text-purple-400/50">Story</span>
                                 <span className="text-[10px] md:text-xs font-black text-purple-400">{hltbData[sub.game_name].hltb_main}h</span>
                               </div>
                               <div className="w-px h-5 md:h-6 bg-white/10" />
                               <div className="flex flex-col items-center">
                                 <span className="text-[7px] md:text-[8px] uppercase font-bold text-blue-400/50">Extra</span>
                                 <span className="text-[10px] md:text-xs font-black text-blue-400">{hltbData[sub.game_name].hltb_extras}h</span>
                               </div>
                               <div className="w-px h-5 md:h-6 bg-white/10" />
                               <div className="flex flex-col items-center">
                                 <span className="text-[7px] md:text-[8px] uppercase font-bold text-purple-400/50">Comp</span>
                                 <span className="text-[10px] md:text-xs font-black text-purple-400">{hltbData[sub.game_name].hltb_completionist}h</span>
                               </div>
                            </div>
                          )}
                          {fetchingHLTB === sub.game_name && (
                            <div className="text-[9px] md:text-[10px] font-bold uppercase animate-pulse text-purple-400">Fetching HLTB...</div>
                          )}
                          <button onClick={() => setReviewingId(null)} className="dark:text-white/40 text-slate-400 hover:dark:text-white hover:text-white transition-colors ml-auto sm:ml-0 p-2">
                            <Plus className="rotate-45" size={24} />
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const reviewingMeta = parseNotesMeta(sub.notes);
                        return (
                          <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4", reviewingMeta.hasNoAchievements ? "md:grid-cols-5" : "md:grid-cols-4")}>
                            <div className="space-y-1 md:space-y-2">
                              <label className="text-[9px] md:text-[10px] uppercase font-bold opacity-40 dark:text-white text-slate-300">Earned 🏆 {sub.totalAchievements > 0 && `(Total: ${sub.totalAchievements})`}</label>
                              <input 
                                type="number"
                                className={cn("w-full bg-white/10 border border-white/10 rounded-lg md:rounded-xl p-2.5 md:p-3 focus:outline-none dark:text-white text-white text-sm", `focus:${theme.border}`)}
                                value={editAchievements}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditAchievements(val);
                                  setPointsAwarded(calculateReviewPoints(val, editMultiplier, selectedLevel, sub));
                                }}
                              />
                            </div>
                            {reviewingMeta.hasNoAchievements && (
                              <div className="space-y-1 md:space-y-2">
                                <label className="text-[9px] md:text-[10px] uppercase font-bold text-purple-400">Award Level</label>
                                <select
                                  className={cn("w-full bg-slate-900 border border-white/10 rounded-lg md:rounded-xl p-2.5 md:p-3 focus:outline-none text-white text-sm focus:border-purple-500")}
                                  value={selectedLevel}
                                  onChange={(e) => {
                                    const lvl = parseInt(e.target.value);
                                    setSelectedLevel(lvl);
                                    setPointsAwarded(calculateReviewPoints(editAchievements, editMultiplier, lvl, sub));
                                  }}
                                >
                                  <option value="0">Level 0 (x0.1 HLTB)</option>
                                  <option value="1">Level 1 (x0.4 Time)</option>
                                  <option value="2">Level 2 (Full Bracketed)</option>
                                </select>
                              </div>
                            )}
                            <div className="space-y-1 md:space-y-2">
                              <label className="text-[9px] md:text-[10px] uppercase font-bold opacity-40 dark:text-white text-slate-300">Play Time (h)</label>
                              <input 
                                type="number"
                                step="0.1"
                                className={cn("w-full bg-white/10 border border-white/10 rounded-lg md:rounded-xl p-2.5 md:p-3 focus:outline-none dark:text-white text-white text-sm", `focus:${theme.border}`)}
                                value={editHours}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setEditHours(e.target.value);
                                  
                                  const hoursBefore = Number(sub.hours_before || 0);
                                  const eventHours = Math.max(0, val - hoursBefore);

                                  let m = 1.0;
                                  if (eventHours < 8) m = 1.0;
                                  else if (eventHours < 15) m = 2.0;
                                  else if (eventHours < 25) m = 3.0;
                                  else m = 4.0;
                                  
                                  setEditMultiplier(m);
                                  setPointsAwarded(calculateReviewPoints(editAchievements, m, selectedLevel, sub));
                                }}
                              />
                            </div>
                            <div className="space-y-1 md:space-y-2">
                              <label className="text-[9px] md:text-[10px] uppercase font-bold opacity-40 dark:text-white text-slate-300">Final Points</label>
                              <input 
                                type="number"
                                className={cn("w-full bg-white/10 border border-white/10 rounded-lg md:rounded-xl p-2.5 md:p-3 focus:outline-none dark:text-white text-white text-sm", `focus:${theme.border}`)}
                                value={pointsAwarded}
                                onChange={(e) => setPointsAwarded(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1 md:space-y-2">
                              <label className="text-[9px] md:text-[10px] uppercase font-bold opacity-40 text-red-100">Rejection Reason</label>
                              <input 
                                placeholder="Reason for rejection"
                                className="w-full bg-white/10 border border-white/10 rounded-lg md:rounded-xl p-2.5 md:p-3 focus:outline-none focus:border-red-500 dark:text-white text-white text-sm"
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex flex-col sm:flex-row gap-3 md:gap-4 mt-2">
                        <button 
                          disabled={updating === sub.id}
                          onClick={() => handleVerify('verified')}
                          className="w-full sm:flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 md:py-3 rounded-lg md:rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 text-sm"
                        >
                          Verify & Award
                        </button>
                        <button 
                          disabled={updating === sub.id}
                          onClick={() => handleVerify('rejected')}
                          className="w-full sm:flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 md:py-3 rounded-lg md:rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 disabled:opacity-50 text-sm"
                        >
                          Reject Submission
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
            )}
          </div>
        </section>
        )
      ) : (
        <div className="space-y-6">
          {/* Mode Switcher Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl dark:bg-[#111111] bg-white border border-black/5 dark:border-white/5 shadow-md">
            <div>
              <h2 className="text-base font-bold dark:text-white text-slate-900 flex items-center gap-2">
                <Trophy size={18} className={theme.text} />
                Score Editor & Team Adjustments
              </h2>
              <p className="text-xs opacity-50 mt-0.5">
                Award single adjustments or use Bulk Edit mode to adjust multiple member scores for an event simultaneously before re-syncing.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/50 p-1 rounded-xl border border-black/5 dark:border-white/5 self-stretch sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setScoreEditMode('single')}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                  scoreEditMode === 'single'
                    ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white"
                )}
              >
                <Plus size={14} />
                <span>Single Adjustment</span>
              </button>
              <button
                type="button"
                onClick={() => setScoreEditMode('bulk')}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                  scoreEditMode === 'bulk'
                    ? cn(theme.secondary, theme.text, theme.border, "border shadow-sm font-black")
                    : "text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white"
                )}
              >
                <CheckSquare size={14} />
                <span>Bulk Edit Mode</span>
              </button>
            </div>
          </div>

          {scoreEditMode === 'bulk' ? (
            /* BULK EDIT MODE COMPONENT */
            <div className="p-6 rounded-2xl dark:bg-[#111111] bg-white border border-black/5 dark:border-white/5 shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/5 dark:border-white/5">
                <div>
                  <h3 className="text-base font-bold dark:text-white text-slate-800">Bulk Event Score Editor</h3>
                  <p className="text-xs opacity-50">Select an event and adjust member scores simultaneously before committing the re-sync.</p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase opacity-50 shrink-0">Target Event:</span>
                  <select
                    value={bulkEditEventId}
                    onChange={(e) => setBulkEditEventId(e.target.value)}
                    className="dark:bg-black/40 bg-slate-50 border dark:border-white/10 border-black/10 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-purple-500 dark:text-white text-slate-900"
                  >
                    {events.map((evt: any) => (
                      <option key={evt.id} value={evt.id}>
                        {evt.title} {evt.is_active ? '(Active)' : '(Archived)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {bulkSuccessMsg && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in">
                  <span>✓ {bulkSuccessMsg}</span>
                  <span className="text-[10px] bg-emerald-500/20 px-2.5 py-1 rounded border border-emerald-500/30">0 Notifications Sent</span>
                </div>
              )}

              {/* Filters */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="Search member name or Steam ID..."
                  value={bulkSearch}
                  onChange={(e) => setBulkSearch(e.target.value)}
                  className="w-full sm:w-72 h-9 px-3 text-xs bg-slate-50 dark:bg-black/40 border dark:border-white/5 border-black/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500 dark:text-white text-slate-900"
                />

                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setBulkTeamFilter('all')}
                    className={cn(
                      "px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-colors border cursor-pointer",
                      bulkTeamFilter === 'all'
                        ? "bg-slate-200 dark:bg-white/10 dark:text-white text-slate-900 border-transparent"
                        : "bg-transparent dark:text-white/40 text-slate-500 border-black/5 dark:border-white/5"
                    )}
                  >
                    All
                  </button>
                  {(['blue', 'purple', 'green', 'red'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBulkTeamFilter(t)}
                      className={cn(
                        "px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-colors border cursor-pointer",
                        bulkTeamFilter === t
                          ? "bg-purple-500/20 text-purple-400 border-purple-500/30 font-black"
                          : "bg-transparent dark:text-white/40 text-slate-500 border-black/5 dark:border-white/5"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Members Score Grid */}
              {bulkLoading ? (
                <div className="py-12 text-center text-xs opacity-50">Loading event member scores...</div>
              ) : bulkUsers.length === 0 ? (
                <div className="py-12 text-center text-xs opacity-50">No members found for this event.</div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                  {bulkUsers
                    .filter(u => {
                      const nameMatch = (u.steam_name || u.discord_name || u.steamid || '').toLowerCase().includes(bulkSearch.toLowerCase());
                      const teamMatch = bulkTeamFilter === 'all' || u.team === bulkTeamFilter;
                      return nameMatch && teamMatch;
                    })
                    .map((u: any) => (
                      <div key={u.steamid} className="p-3.5 rounded-xl dark:bg-black/30 bg-slate-50 border dark:border-white/5 border-black/5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={u.steam_avatar || u.active_avatar || 'https://avatars.githubusercontent.com/u/0'}
                            alt=""
                            className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold dark:text-white text-slate-900 truncate">{u.steam_name || u.discord_name || 'Member'}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn(
                                "text-[9px] font-black uppercase px-2 py-0.5 rounded border tracking-wider",
                                TEAM_COLORS[u.team as Team]?.secondary,
                                TEAM_COLORS[u.team as Team]?.primary,
                                TEAM_COLORS[u.team as Team]?.border
                              )}>
                                Team {u.team || 'none'}
                              </span>
                              <span className="text-[10px] opacity-40 font-mono truncate">{u.steamid}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <label className="text-[10px] uppercase font-bold opacity-50 dark:text-white text-slate-800">Event Pts:</label>
                          <input
                            type="number"
                            value={bulkUserScores[u.steamid] ?? 0}
                            onChange={(e) => setBulkUserScores(prev => ({ ...prev, [u.steamid]: parseInt(e.target.value) || 0 }))}
                            className="w-28 bg-white dark:bg-black/50 border dark:border-white/10 border-black/10 rounded-xl px-3 py-1.5 font-mono text-xs font-bold text-purple-400 focus:outline-none focus:border-purple-500 text-right"
                          />
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Footer Commit Button */}
              <div className="pt-4 border-t border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-xs opacity-50">
                  Clicking commit will update all member score overrides for this event and recalculate team totals without notifying users.
                </p>
                <button
                  type="button"
                  disabled={bulkSaving || bulkLoading}
                  onClick={handleCommitBulkScores}
                  className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50 shrink-0"
                >
                  {bulkSaving ? 'Saving & Re-syncing...' : 'Commit & Re-Sync Event Scores'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Award Form */}
              <div className="lg:col-span-1 border dark:border-white/5 border-black/5 dark:bg-[#111111] bg-white p-6 rounded-2xl flex flex-col gap-6 h-fit shadow-xl">
                <div>
                  <h3 className="text-base font-bold dark:text-white text-slate-800 font-sans">Award Team Points</h3>
                  <p className="text-xs opacity-50 mt-1">Directly grant or deduct points from team totals.</p>
                </div>

            <form onSubmit={handleAwardTeamPoints} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-50 dark:text-white text-slate-800">Award Target</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-black/40 p-1 rounded-xl border dark:border-white/5 border-black/5">
                  <button
                    type="button"
                    onClick={() => setAwardTargetType('team')}
                    className={cn(
                      "py-2 rounded-lg text-xs font-bold transition-all",
                      awardTargetType === 'team'
                        ? "bg-white dark:bg-white/10 dark:text-white text-slate-900 shadow-sm"
                        : "dark:text-white/40 text-slate-500 hover:text-slate-700 dark:hover:text-white/60"
                    )}
                  >
                    Whole Team
                  </button>
                  <button
                    type="button"
                    onClick={() => setAwardTargetType('user')}
                    className={cn(
                      "py-2 rounded-lg text-xs font-bold transition-all",
                      awardTargetType === 'user'
                        ? "bg-white dark:bg-white/10 dark:text-white text-slate-900 shadow-sm"
                        : "dark:text-white/40 text-slate-500 hover:text-slate-700 dark:hover:text-white/60"
                    )}
                  >
                    Specific User
                  </button>
                </div>
              </div>

              {awardTargetType === 'team' ? (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-50 dark:text-white text-slate-800">Select Team</label>
                  <select
                    value={awardTeam}
                    onChange={(e) => setAwardTeam(e.target.value as any)}
                    className="w-full dark:bg-black/40 bg-slate-50 border dark:border-white/5 border-black/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans text-sm dark:text-white text-slate-900"
                  >
                    <option value="blue">Team Blue</option>
                    <option value="purple">Team Purple</option>
                    <option value="green">Team Green</option>
                    <option value="red">Team Red</option>
                  </select>
                </div>
              ) : (
                <>
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-50 dark:text-white text-slate-800">
                        Select Users ({selectedUserIds.length} selected)
                      </label>
                    </div>

                    {/* Filters & Search */}
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="w-full h-10 px-4 text-xs bg-slate-50 dark:bg-black/40 border dark:border-white/5 border-black/5 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-white text-slate-900"
                      />

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setUserTeamFilter('all')}
                          className={cn(
                            "px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-colors border",
                            userTeamFilter === 'all'
                              ? "bg-slate-200 dark:bg-white/10 dark:text-white text-slate-900 border-transparent"
                              : "bg-transparent dark:text-white/40 text-slate-500 border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5"
                          )}
                        >
                          All Teams
                        </button>
                        {(['blue', 'purple', 'green', 'red'] as const).map(team => (
                          <button
                            key={team}
                            type="button"
                            onClick={() => setUserTeamFilter(team)}
                            className={cn(
                              "px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-colors border",
                              userTeamFilter === team
                                ? "bg-white dark:bg-white/20 dark:text-white text-slate-900 border-transparent shadow-sm"
                                : "bg-transparent dark:text-white/40 text-slate-500 border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                          >
                            {team}
                          </button>
                        ))}
                      </div>

                      {/* Select/Deselect All Shortcuts */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const eligibleIds = users
                              .filter(u => u.steamid && !u.steamid.startsWith('team_pts_') && u.team && u.team !== 'none')
                              .filter(u => {
                                const matchesSearch = (u.steam_name || '').toLowerCase().includes(userSearchQuery.toLowerCase());
                                const matchesTeam = userTeamFilter === 'all' || u.team === userTeamFilter;
                                return matchesSearch && matchesTeam;
                              })
                              .map(u => u.steamid);
                            
                            // Union with existing selected IDs
                            setSelectedUserIds(prev => Array.from(new Set([...prev, ...eligibleIds])));
                          }}
                          className="text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 transition-colors"
                        >
                          Select Filtered
                        </button>
                        <span className="text-[10px] opacity-30">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            const eligibleIds = users
                              .filter(u => u.steamid && !u.steamid.startsWith('team_pts_') && u.team && u.team !== 'none')
                              .filter(u => {
                                const matchesSearch = (u.steam_name || '').toLowerCase().includes(userSearchQuery.toLowerCase());
                                const matchesTeam = userTeamFilter === 'all' || u.team === userTeamFilter;
                                return matchesSearch && matchesTeam;
                              })
                              .map(u => u.steamid);

                            // Subtract from selected IDs
                            setSelectedUserIds(prev => prev.filter(id => !eligibleIds.includes(id)));
                          }}
                          className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-white/60 transition-colors"
                        >
                          Deselect Filtered
                        </button>
                        <span className="text-[10px] opacity-30">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedUserIds([])}
                          className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-500 transition-colors"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    {/* Scrollable list with checkboxes */}
                    <div className="max-h-56 overflow-y-auto border dark:border-white/5 border-black/5 rounded-xl divide-y divide-black/5 dark:divide-white/5 bg-slate-50/50 dark:bg-black/20 p-1.5 space-y-0.5">
                      {(() => {
                        const eligibleUsers = users
                          .filter(u => u.steamid && !u.steamid.startsWith('team_pts_') && u.team && u.team !== 'none')
                          .filter(u => {
                            const nameMatch = (u.steam_name || '').toLowerCase().includes(userSearchQuery.toLowerCase());
                            const teamMatch = userTeamFilter === 'all' || u.team === userTeamFilter;
                            return nameMatch && teamMatch;
                          });

                        if (eligibleUsers.length === 0) {
                          return (
                            <div className="p-4 text-center text-xs opacity-40 italic">
                              No matching users found
                            </div>
                          );
                        }

                        return eligibleUsers.map(u => {
                          const isChecked = selectedUserIds.includes(u.steamid);
                          const getTeamColorBadge = (t: string) => {
                            switch (t) {
                              case 'blue': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                              case 'purple': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
                              case 'green': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                              case 'red': return 'bg-red-500/10 text-red-400 border-red-500/20';
                              default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
                            }
                          };

                          return (
                            <label
                              key={u.steamid}
                              className={cn(
                                "cursor-pointer flex items-center justify-between p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-all",
                                isChecked && "bg-black/5 dark:bg-white/5 font-medium"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setSelectedUserIds(prev => prev.filter(id => id !== u.steamid));
                                    } else {
                                      setSelectedUserIds(prev => [...prev, u.steamid]);
                                    }
                                  }}
                                  className="rounded border-slate-300 dark:border-white/10 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                />
                                {u.steam_avatar && (
                                  <img
                                    src={u.steam_avatar}
                                    alt=""
                                    className="w-5 h-5 rounded-full object-cover border border-black/10 dark:border-white/10 shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <span className="text-xs dark:text-white text-slate-900 truncate">
                                  {u.steam_name}
                                </span>
                              </div>
                              <span className={cn(
                                "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border leading-none shrink-0",
                                getTeamColorBadge(u.team)
                              )}>
                                {u.team}
                              </span>
                            </label>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  <div className="space-y-1.5 animate-in fade-in duration-150">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50 dark:text-white text-slate-800">Adjustment Type</label>
                    <select
                      value={awardAdjustmentType}
                      onChange={(e) => setAwardAdjustmentType(e.target.value as 'screenshot' | 'bingo')}
                      className="w-full dark:bg-black/40 bg-slate-50 border dark:border-white/5 border-black/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans text-sm dark:text-white text-slate-900"
                    >
                      <option value="screenshot">Screenshot Points</option>
                      <option value="bingo">Bingo Points</option>
                    </select>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-50 dark:text-white text-slate-800">Points</label>
                <input
                  type="number"
                  placeholder="e.g. 100 or -50"
                  value={awardPoints}
                  onChange={(e) => setAwardPoints(e.target.value)}
                  className="w-full dark:bg-black/40 bg-slate-50 border dark:border-white/5 border-black/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-sm dark:text-white text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-50 dark:text-white text-slate-800">What are these points for?</label>
                <textarea
                  placeholder="Note the reason for these points..."
                  value={awardNotes}
                  onChange={(e) => setAwardNotes(e.target.value)}
                  rows={4}
                  className="w-full dark:bg-black/40 bg-slate-50 border dark:border-white/5 border-black/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans text-sm dark:text-white text-slate-900"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isAwarding || !awardPoints || parseInt(awardPoints) === 0}
                className={cn(
                  "w-full py-3.5 rounded-xl font-bold text-white text-xs transition-all uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg cursor-pointer",
                  isAwarding ? "opacity-50 cursor-not-allowed" : theme.bg,
                  theme.glow
                )}
              >
                {isAwarding ? "Awarding..." : "Award Points"}
              </button>
            </form>
          </div>

          {/* Adjustments Log */}
          <div className="lg:col-span-2 border dark:border-white/5 border-black/5 dark:bg-[#111111] bg-white p-6 rounded-2xl flex flex-col gap-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b dark:border-white/5 border-black/5 pb-4">
              <div>
                <h3 className="text-base font-bold dark:text-white text-slate-800 font-sans flex items-center gap-2">
                  Point Adjustments Log
                  <span className="text-xs font-mono font-normal opacity-50">
                    ({teamAdjustments.length} total)
                  </span>
                </h3>
                <p className="text-xs opacity-50 mt-0.5">Audit trail of all administrative screenshot, bingo, and team adjustments.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCleanupModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Purge or archive audit logs older than 90 days"
                >
                  <Trash2 size={13} />
                  <span>Cleanup Logs</span>
                  {teamAdjustments.some(a => (Date.now() - new Date(a.created_at).getTime()) > 90 * 24 * 60 * 60 * 1000) && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={fetchTeamAdjustments}
                  className="p-1.5 rounded-xl border dark:border-white/10 border-black/10 text-xs font-bold dark:text-white text-slate-700 hover:dark:bg-white/5 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Refresh Adjustments"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col gap-3 p-3.5 rounded-xl dark:bg-black/30 bg-slate-50 border dark:border-white/5 border-black/5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input
                    type="text"
                    placeholder="Search by user, admin, reason notes, or points..."
                    value={adjSearchQuery}
                    onChange={(e) => setAdjSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 rounded-lg dark:bg-black/40 bg-white border dark:border-white/10 border-black/10 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                  />
                  {adjSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAdjSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs opacity-40 hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  {/* Type Filter */}
                  <select
                    value={adjTypeFilter}
                    onChange={(e) => setAdjTypeFilter(e.target.value as any)}
                    className="px-2.5 py-2 rounded-lg dark:bg-black/40 bg-white border dark:border-white/10 border-black/10 text-xs font-bold dark:text-white text-slate-800 focus:outline-none"
                  >
                    <option value="all">All Types</option>
                    <option value="screenshot">Screenshot Points</option>
                    <option value="bingo">Bingo Points</option>
                    <option value="team">Team Awards</option>
                  </select>

                  {/* Date Range Filter */}
                  <select
                    value={adjDateFilter}
                    onChange={(e) => setAdjDateFilter(e.target.value as any)}
                    className="px-2.5 py-2 rounded-lg dark:bg-black/40 bg-white border dark:border-white/10 border-black/10 text-xs font-bold dark:text-white text-slate-800 focus:outline-none"
                  >
                    <option value="all">All Dates</option>
                    <option value="today">Today</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="90d">Last 90 Days</option>
                    <option value="older_90d">Older than 90 Days</option>
                    <option value="custom">Custom Date Range</option>
                  </select>
                </div>
              </div>

              {/* Second Row: Specific User, Admin filters and Custom Date Pickers */}
              <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
                {/* Specific User Filter */}
                <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 shrink-0">User:</span>
                  <select
                    value={adjUserFilter}
                    onChange={(e) => setAdjUserFilter(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg dark:bg-black/40 bg-white border dark:border-white/10 border-black/10 text-xs font-medium dark:text-white text-slate-800 focus:outline-none truncate"
                  >
                    <option value="all">All Users & Teams</option>
                    {Array.from(new Set(teamAdjustments.map(a => {
                      const isUserAdj = !a.user_id?.startsWith('team_pts_');
                      const targetUser = isUserAdj ? users.find(u => u.steamid === a.user_id) : null;
                      return targetUser?.steam_name || a.user_name || (isUserAdj ? 'Member' : `Team ${a.user_id.replace('team_pts_', '').toUpperCase()}`);
                    }))).sort().map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Specific Admin Filter */}
                <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 shrink-0">Admin:</span>
                  <select
                    value={adjAdminFilter}
                    onChange={(e) => setAdjAdminFilter(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg dark:bg-black/40 bg-white border dark:border-white/10 border-black/10 text-xs font-medium dark:text-white text-slate-800 focus:outline-none truncate"
                  >
                    <option value="all">All Admins</option>
                    {Array.from(new Set(teamAdjustments.map(a => {
                      const meta = parseNotesMeta(a.notes || '');
                      const adminUser = users.find(u => u.steamid === (meta.adminId || a.verifier_id));
                      return meta.adminName || adminUser?.steam_name || 'Admin';
                    }))).sort().map(adm => (
                      <option key={adm} value={adm}>{adm}</option>
                    ))}
                  </select>
                </div>

                {/* Custom Date Inputs if active */}
                {adjDateFilter === 'custom' && (
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <input
                      type="date"
                      value={adjStartDate}
                      onChange={(e) => setAdjStartDate(e.target.value)}
                      className="px-2 py-1 rounded-lg dark:bg-black/40 bg-white border dark:border-white/10 border-black/10 text-xs font-mono dark:text-white text-slate-800"
                      title="Start date"
                    />
                    <span className="opacity-40 text-xs">to</span>
                    <input
                      type="date"
                      value={adjEndDate}
                      onChange={(e) => setAdjEndDate(e.target.value)}
                      className="px-2 py-1 rounded-lg dark:bg-black/40 bg-white border dark:border-white/10 border-black/10 text-xs font-mono dark:text-white text-slate-800"
                      title="End date"
                    />
                  </div>
                )}

                {/* Reset Filters button */}
                {(adjSearchQuery || adjUserFilter !== 'all' || adjAdminFilter !== 'all' || adjTypeFilter !== 'all' || adjDateFilter !== 'all' || adjStartDate || adjEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdjSearchQuery('');
                      setAdjUserFilter('all');
                      setAdjAdminFilter('all');
                      setAdjTypeFilter('all');
                      setAdjDateFilter('all');
                      setAdjStartDate('');
                      setAdjEndDate('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-colors shrink-0"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const filteredAdjustments = teamAdjustments.filter((adj) => {
                const meta = parseNotesMeta(adj.notes || '');
                const isUserAdj = !adj.user_id?.startsWith('team_pts_');
                const targetUser = isUserAdj ? users.find(u => u.steamid === adj.user_id) : null;
                const userName = isUserAdj
                  ? (targetUser?.steam_name || adj.user_name || 'Member')
                  : (adj.user_name || `Team ${adj.user_id.replace('team_pts_', '').toUpperCase()}`);
                
                const adminUser = users.find(u => u.steamid === (meta.adminId || adj.verifier_id));
                const adminName = meta.adminName || adminUser?.steam_name || 'Admin';

                const isScreenshot = adj.game_name === 'Screenshot Points' || adj.platform === 'Screenshot Points';
                const isBingo = adj.game_name === 'Bingo Points' || adj.platform === 'Bingo Points';
                const cleanReason = meta.userNotes || (isUserAdj ? 'No description provided.' : (adj.notes && !adj.notes.startsWith('__META_START__') ? adj.notes : 'Bonus points awarded'));

                // Search query
                if (adjSearchQuery.trim()) {
                  const q = adjSearchQuery.toLowerCase().trim();
                  const match = userName.toLowerCase().includes(q) ||
                                adminName.toLowerCase().includes(q) ||
                                cleanReason.toLowerCase().includes(q) ||
                                (adj.notes || '').toLowerCase().includes(q) ||
                                String(adj.points || adj.calculated_score || '').includes(q);
                  if (!match) return false;
                }

                // User filter
                if (adjUserFilter !== 'all') {
                  if (userName !== adjUserFilter && adj.user_id !== adjUserFilter && targetUser?.steam_name !== adjUserFilter) {
                    return false;
                  }
                }

                // Admin filter
                if (adjAdminFilter !== 'all') {
                  if (adminName !== adjAdminFilter && meta.adminName !== adjAdminFilter && adminUser?.steam_name !== adjAdminFilter) {
                    return false;
                  }
                }

                // Type filter
                if (adjTypeFilter !== 'all') {
                  if (adjTypeFilter === 'screenshot' && !isScreenshot) return false;
                  if (adjTypeFilter === 'bingo' && !isBingo) return false;
                  if (adjTypeFilter === 'team' && (isScreenshot || isBingo)) return false;
                }

                // Date filter
                if (adjDateFilter !== 'all') {
                  const logTime = new Date(adj.created_at).getTime();
                  const now = Date.now();
                  if (adjDateFilter === 'today') {
                    const startOfToday = new Date();
                    startOfToday.setHours(0, 0, 0, 0);
                    if (logTime < startOfToday.getTime()) return false;
                  } else if (adjDateFilter === '7d') {
                    if (now - logTime > 7 * 24 * 60 * 60 * 1000) return false;
                  } else if (adjDateFilter === '30d') {
                    if (now - logTime > 30 * 24 * 60 * 60 * 1000) return false;
                  } else if (adjDateFilter === '90d') {
                    if (now - logTime > 90 * 24 * 60 * 60 * 1000) return false;
                  } else if (adjDateFilter === 'older_90d') {
                    if (now - logTime <= 90 * 24 * 60 * 60 * 1000) return false;
                  } else if (adjDateFilter === 'custom') {
                    if (adjStartDate) {
                      const start = new Date(adjStartDate).setHours(0, 0, 0, 0);
                      if (logTime < start) return false;
                    }
                    if (adjEndDate) {
                      const end = new Date(adjEndDate).setHours(23, 59, 59, 999);
                      if (logTime > end) return false;
                    }
                  }
                }

                return true;
              });

              if (teamAdjustments.length === 0) {
                return (
                  <div className="p-12 text-center opacity-30 text-xs italic dark:text-white text-slate-500">
                    No adjustments recorded yet.
                  </div>
                );
              }

              if (filteredAdjustments.length === 0) {
                return (
                  <div className="p-12 text-center flex flex-col items-center justify-center gap-2">
                    <Filter size={24} className="opacity-30 text-slate-400" />
                    <span className="text-xs opacity-50 italic dark:text-white text-slate-500">
                      No point adjustments matched the selected filters.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAdjSearchQuery('');
                        setAdjUserFilter('all');
                        setAdjAdminFilter('all');
                        setAdjTypeFilter('all');
                        setAdjDateFilter('all');
                        setAdjStartDate('');
                        setAdjEndDate('');
                      }}
                      className="text-xs text-indigo-400 font-bold hover:underline mt-1"
                    >
                      Clear all filters
                    </button>
                  </div>
                );
              }

              return (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {filteredAdjustments.map((adj) => {
                    const meta = parseNotesMeta(adj.notes || '');
                    const isUserAdj = !adj.user_id?.startsWith('team_pts_');
                    const targetUser = isUserAdj ? users.find(u => u.steamid === adj.user_id) : null;
                    const userName = isUserAdj
                      ? (targetUser?.steam_name || adj.user_name || 'Member')
                      : (adj.user_name || `Team ${adj.user_id.replace('team_pts_', '').toUpperCase()}`);
                    const userAvatar = isUserAdj
                      ? (targetUser?.steam_avatar || adj.user_avatar || 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png')
                      : (adj.user_avatar || 'https://cdn-icons-png.flaticon.com/512/1471391.png');
                    const userTeam = isUserAdj ? (targetUser?.team || 'none') : adj.user_id.replace('team_pts_', '');

                    const isScreenshot = adj.game_name === 'Screenshot Points' || adj.platform === 'Screenshot Points';
                    const isBingo = adj.game_name === 'Bingo Points' || adj.platform === 'Bingo Points';

                    const adminUser = users.find(u => u.steamid === (meta.adminId || adj.verifier_id));
                    const adminName = meta.adminName || adminUser?.steam_name || 'Admin';

                    const points = Number(adj.points !== undefined && adj.points !== null ? adj.points : adj.calculated_score) || 0;
                    const cleanReason = meta.userNotes || (isUserAdj ? 'No description provided.' : (adj.notes && !adj.notes.startsWith('__META_START__') ? adj.notes : 'Bonus points awarded'));

                    return (
                      <div
                        key={adj.id}
                        className="p-4 rounded-2xl dark:bg-black/20 bg-slate-50 border dark:border-white/5 border-black/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:border-white/10 transition-colors"
                      >
                        {/* Left: [user avatar + team badge] [user name] [badge screenshots/bingo] [new line: reason] [timestamp] */}
                        <div className="flex items-start gap-3.5 flex-1 min-w-0">
                          <div className="relative shrink-0 mt-0.5">
                            <img
                              src={userAvatar}
                              alt={userName}
                              className="w-10 h-10 rounded-xl object-cover border dark:border-white/10 border-black/10"
                              referrerPolicy="no-referrer"
                            />
                            {userTeam && userTeam !== 'none' && (
                              <span className={cn(
                                "absolute -bottom-1 -right-1 text-[8px] font-black uppercase tracking-tighter px-1 py-0.2 rounded border leading-none shadow-sm",
                                TEAM_COLORS[userTeam as Team]?.primary || "text-slate-500",
                                TEAM_COLORS[userTeam as Team]?.border || "border-slate-500/15",
                                TEAM_COLORS[userTeam as Team]?.secondary || "bg-slate-500/5"
                              )}>
                                {userTeam}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold dark:text-white text-slate-900 truncate">
                                {userName}
                              </span>

                              {/* Type badge */}
                              {isScreenshot && (
                                <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0 flex items-center gap-1">
                                  <Camera size={10} /> Screenshot Points
                                </span>
                              )}
                              {isBingo && (
                                <span className="text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 shrink-0 flex items-center gap-1">
                                  <Grid size={10} /> Bingo Points
                                </span>
                              )}
                              {!isScreenshot && !isBingo && (
                                <span className="text-[9px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20 shrink-0 flex items-center gap-1">
                                  <Shield size={10} /> Team Award
                                </span>
                              )}
                            </div>

                            <p className="text-xs opacity-75 dark:text-slate-300 text-slate-700 select-text leading-relaxed">
                              {cleanReason}
                            </p>

                            <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[10px] font-mono opacity-50">
                              <span className="flex items-center gap-1">
                                <Clock size={11} />
                                {new Date(adj.created_at).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: approved by: [name of admin] [points] [delete button] */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 dark:border-white/5 border-black/5 shrink-0">
                          {/* Admin info badge */}
                          <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/30 px-3 py-1.5 rounded-xl border dark:border-white/5 border-black/5">
                            <ShieldCheck size={14} className={theme.text} />
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Approved By</span>
                              <span className="text-[11px] font-bold dark:text-white text-slate-800 leading-tight">
                                {adminName}
                              </span>
                            </div>
                          </div>

                          {/* Point Amount */}
                          <span className={cn(
                            "font-mono font-black text-sm px-3 py-1 rounded-xl border shrink-0",
                            points >= 0 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"
                          )}>
                            {points >= 0 ? `+${points}` : points} pts
                          </span>

                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteAdjustment(adj.id)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-500 text-[10px] font-bold tracking-widest uppercase transition-all cursor-pointer outline-none shrink-0"
                            title="Revoke adjustment"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  )}

      {activeTab === 'activity_log' && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          {/* Header & Stats banner */}
          <div className="border dark:border-white/5 border-black/5 dark:bg-[#111111] bg-white p-6 rounded-2xl flex flex-col gap-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b dark:border-white/5 border-black/5 pb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <History size={20} />
                  </span>
                  <h3 className="text-lg font-bold dark:text-white text-slate-800 font-sans">
                    Manual Point Additions Activity Log
                  </h3>
                </div>
                <p className="text-xs opacity-60">
                  Full transparency audit log of screenshot points, bingo points, and team point adjustments with timestamps and approving administrators.
                </p>
              </div>

              <button
                onClick={fetchActivityLogs}
                disabled={loadingActivityLogs}
                className="px-4 py-2 rounded-xl border dark:border-white/10 border-black/10 text-xs font-bold dark:text-white text-slate-700 hover:dark:bg-white/5 hover:bg-slate-100 transition-colors flex items-center gap-2 shrink-0 self-start md:self-auto cursor-pointer"
              >
                <Clock size={14} className={cn(loadingActivityLogs && "animate-spin")} />
                {loadingActivityLogs ? "Refreshing..." : "Refresh Activity Log"}
              </button>
            </div>

            {/* Summary Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl dark:bg-black/30 bg-slate-50 border dark:border-white/5 border-black/5 flex flex-col justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-40 dark:text-white text-slate-600">Total Manual Additions</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono dark:text-white text-slate-900">{activityLogs.length}</span>
                  <span className="text-[10px] font-bold opacity-50">records</span>
                </div>
              </div>

              <div className="p-4 rounded-xl dark:bg-black/30 bg-slate-50 border dark:border-white/5 border-black/5 flex flex-col justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Screenshot Points</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    +{activityLogs.filter(l => l.game_name === 'Screenshot Points' || l.platform === 'Screenshot Points').reduce((acc, curr) => acc + (curr.points || 0), 0)}
                  </span>
                  <span className="text-[10px] font-bold opacity-50">
                    ({activityLogs.filter(l => l.game_name === 'Screenshot Points' || l.platform === 'Screenshot Points').length})
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl dark:bg-black/30 bg-slate-50 border dark:border-white/5 border-black/5 flex flex-col justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Bingo Points</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono text-blue-400">
                    +{activityLogs.filter(l => l.game_name === 'Bingo Points' || l.platform === 'Bingo Points').reduce((acc, curr) => acc + (curr.points || 0), 0)}
                  </span>
                  <span className="text-[10px] font-bold opacity-50">
                    ({activityLogs.filter(l => l.game_name === 'Bingo Points' || l.platform === 'Bingo Points').length})
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl dark:bg-black/30 bg-slate-50 border dark:border-white/5 border-black/5 flex flex-col justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">Active Admins</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono text-purple-400">
                    {new Set(activityLogs.map(l => l.admin_name)).size}
                  </span>
                  <span className="text-[10px] font-bold opacity-50">approvers</span>
                </div>
              </div>
            </div>

            {/* Filter Controls Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
                <input
                  type="text"
                  placeholder="Filter by recipient, admin, or reason..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl dark:bg-black/40 bg-slate-100 border dark:border-white/5 border-black/5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
                <select
                  value={logTypeFilter}
                  onChange={(e) => setLogTypeFilter(e.target.value as any)}
                  className="px-3 py-2 rounded-xl dark:bg-black/40 bg-slate-100 border dark:border-white/5 border-black/5 text-xs font-bold dark:text-white text-slate-800 focus:outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="screenshot">Screenshot Points</option>
                  <option value="bingo">Bingo Points</option>
                  <option value="team">Team Awards</option>
                </select>

                <select
                  value={logTeamFilter}
                  onChange={(e) => setLogTeamFilter(e.target.value as any)}
                  className="px-3 py-2 rounded-xl dark:bg-black/40 bg-slate-100 border dark:border-white/5 border-black/5 text-xs font-bold dark:text-white text-slate-800 focus:outline-none uppercase"
                >
                  <option value="all">All Teams</option>
                  <option value="blue">Blue</option>
                  <option value="purple">Purple</option>
                  <option value="green">Green</option>
                  <option value="red">Red</option>
                </select>
              </div>
            </div>
          </div>

          {/* Activity Logs List */}
          <div className="space-y-3">
            {(() => {
              const filteredLogs = activityLogs.filter(log => {
                const matchSearch = !logSearchQuery.trim() ||
                  (log.user_name || '').toLowerCase().includes(logSearchQuery.toLowerCase()) ||
                  (log.admin_name || '').toLowerCase().includes(logSearchQuery.toLowerCase()) ||
                  (log.notes || '').toLowerCase().includes(logSearchQuery.toLowerCase());

                let matchType = true;
                if (logTypeFilter === 'screenshot') {
                  matchType = log.game_name === 'Screenshot Points' || log.platform === 'Screenshot Points';
                } else if (logTypeFilter === 'bingo') {
                  matchType = log.game_name === 'Bingo Points' || log.platform === 'Bingo Points';
                } else if (logTypeFilter === 'team') {
                  matchType = log.game_name === 'Team Award' || String(log.user_id || '').startsWith('team_pts_');
                }

                let matchTeam = true;
                if (logTeamFilter !== 'all') {
                  matchTeam = (log.user_team || 'none').toLowerCase() === logTeamFilter.toLowerCase();
                }

                return matchSearch && matchType && matchTeam;
              });

              if (filteredLogs.length === 0) {
                return (
                  <div className="p-12 text-center opacity-40 text-xs italic border dark:border-white/5 border-black/5 dark:bg-[#111111] bg-white rounded-2xl">
                    No manual point additions match your filter criteria.
                  </div>
                );
              }

              return filteredLogs.map(log => {
                const isScreenshot = log.game_name === 'Screenshot Points' || log.platform === 'Screenshot Points';
                const isBingo = log.game_name === 'Bingo Points' || log.platform === 'Bingo Points';

                return (
                  <div
                    key={log.id}
                    className="p-4 rounded-2xl dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:border-white/10 transition-colors"
                  >
                    {/* Recipient & Details */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <div className="relative shrink-0 mt-0.5">
                        <img
                          src={log.user_avatar || 'https://cdn-icons-png.flaticon.com/512/1471/1471391.png'}
                          alt={log.user_name}
                          className="w-10 h-10 rounded-xl object-cover border dark:border-white/10 border-black/10"
                          referrerPolicy="no-referrer"
                        />
                        {log.user_team && log.user_team !== 'none' && (
                          <span className={cn(
                            "absolute -bottom-1 -right-1 text-[8px] font-black uppercase tracking-tighter px-1 py-0.2 rounded border leading-none shadow-sm",
                            TEAM_COLORS[log.user_team as Team]?.primary || "text-slate-500",
                            TEAM_COLORS[log.user_team as Team]?.border || "border-slate-500/15",
                            TEAM_COLORS[log.user_team as Team]?.secondary || "bg-slate-500/5"
                          )}>
                            {log.user_team}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold dark:text-white text-slate-900 truncate">
                            {log.user_name}
                          </span>

                          {/* Type badge */}
                          {isScreenshot && (
                            <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0 flex items-center gap-1">
                              <Camera size={10} /> Screenshot Points
                            </span>
                          )}
                          {isBingo && (
                            <span className="text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 shrink-0 flex items-center gap-1">
                              <Grid size={10} /> Bingo Points
                            </span>
                          )}
                          {!isScreenshot && !isBingo && (
                            <span className="text-[9px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20 shrink-0 flex items-center gap-1">
                              <Shield size={10} /> Team Award
                            </span>
                          )}
                        </div>

                        <p className="text-xs opacity-75 dark:text-slate-300 text-slate-700 select-text leading-relaxed">
                          {log.notes || 'No description provided.'}
                        </p>

                        <div className="flex items-center gap-3 mt-1 flex-wrap text-[10px] font-mono opacity-50">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Admin Approver & Points */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 dark:border-white/5 border-black/5 shrink-0">
                      {/* Admin info badge */}
                      <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/30 px-3 py-1.5 rounded-xl border dark:border-white/5 border-black/5">
                        <ShieldCheck size={14} className="text-purple-400 shrink-0" />
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Approved By</span>
                          <span className="text-[11px] font-bold dark:text-white text-slate-800 leading-tight">
                            {log.admin_name}
                          </span>
                        </div>
                      </div>

                      {/* Point Amount */}
                      <span className={cn(
                        "font-mono font-black text-sm px-3 py-1 rounded-xl border shrink-0",
                        log.points >= 0 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"
                      )}>
                        {log.points >= 0 ? `+${log.points}` : log.points} pts
                      </span>

                      {/* Revoke Action */}
                      <button
                        onClick={async () => {
                          await handleDeleteAdjustment(log.id);
                          await fetchActivityLogs();
                        }}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-500 text-[10px] font-bold tracking-widest uppercase transition-all cursor-pointer outline-none"
                        title="Revoke adjustment"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Manage Event Teams Modal */}
      {editingUserEventTeams && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="fixed inset-0" onClick={() => setEditingUserEventTeams(null)} />
          <div className="relative w-full max-w-2xl dark:bg-[#121212] bg-white rounded-2xl shadow-2xl border dark:border-white/10 border-black/10 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b dark:border-white/5 border-black/5 flex items-center justify-between bg-slate-50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Trophy size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider dark:text-white text-slate-900">Manage Event Teams</h3>
                  <p className="text-[10px] dark:text-white/40 text-slate-500 font-bold">Assign team rosters per specific event historical records</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingUserEventTeams(null)}
                className="h-7 w-7 rounded-lg hover:dark:bg-white/10 hover:bg-slate-200 flex items-center justify-center dark:text-white/40 text-slate-400 hover:text-slate-900 transition-colors"
              >
                <XCircle size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex flex-col gap-6">
              {/* User Info card */}
              <div className="flex items-center gap-3 p-4 dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-black/5 rounded-xl">
                <img 
                  src={editingUserEventTeams.steam_avatar || editingUserEventTeams.steamAvatar} 
                  alt="" 
                  className="w-10 h-10 rounded-full object-cover border dark:border-white/10 border-black/5" 
                  referrerPolicy="no-referrer"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-black dark:text-white text-slate-900">{editingUserEventTeams.steam_name || editingUserEventTeams.steamName}</span>
                  <span className="text-[10px] font-mono dark:text-white/40 text-slate-400">ID: {editingUserEventTeams.steamid || editingUserEventTeams.steamId}</span>
                </div>
              </div>

              {/* Events list */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-40 dark:text-white text-slate-500">Event Assignments</span>
                {events.length === 0 ? (
                  <div className="text-center py-6 border border-dashed dark:border-white/10 border-black/10 rounded-xl">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">No events loaded.</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {events.map((e: any) => {
                      const userTeamForEvent = editingUserEventTeams.eventTeams?.[e.id] || 'none';
                      const isUpdatingThisUser = updating === editingUserEventTeams.steamid;

                      return (
                        <div 
                          key={e.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 dark:bg-[#181818] bg-slate-50 border dark:border-white/5 border-black/5 rounded-xl hover:dark:bg-zinc-800/80 hover:bg-slate-100/50 transition-all"
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black dark:text-white text-slate-800">
                                Event #{e.event_number || e.eventNumber}: {e.name}
                              </span>
                              {e.is_active ? (
                                <span className="text-[8px] px-1.5 py-0.5 rounded-full font-extrabold tracking-wider bg-emerald-500/10 text-emerald-500 uppercase">
                                  Active
                                </span>
                              ) : (
                                <span className="text-[8px] px-1.5 py-0.5 rounded-full font-extrabold tracking-wider bg-slate-500/10 dark:text-slate-400 text-slate-500 uppercase">
                                  Ended
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] dark:text-white/30 text-slate-400 font-bold">
                              {e.is_active ? 'Updates both profile & event rosters' : 'Roster update only (preserves current profile)'}
                            </span>
                          </div>

                          <div className="relative w-full sm:w-44 shrink-0">
                            <select
                              value={userTeamForEvent || 'none'}
                              disabled={isUpdatingThisUser}
                              onChange={(selEvt) => assignEventTeam(editingUserEventTeams.steamid || editingUserEventTeams.steamId, e.id, selEvt.target.value as Team | 'none')}
                              className={cn(
                                "appearance-none dark:bg-[#222] bg-white border dark:border-white/10 border-black/10 rounded-xl px-3 py-1.5 pr-8 text-[11px] font-bold uppercase tracking-wider focus:outline-none transition-all w-full cursor-pointer h-9",
                                userTeamForEvent && userTeamForEvent !== 'none' 
                                  ? `${TEAM_COLORS[userTeamForEvent as Team].secondary} ${TEAM_COLORS[userTeamForEvent as Team].primary} dark:border-${userTeamForEvent}-500/30 border-${userTeamForEvent}-500/20` 
                                  : "dark:text-white/60 text-slate-600"
                              )}
                            >
                              <option value="none" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">None/Unassigned</option>
                              <option value="blue" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Blue Team</option>
                              <option value="green" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Green Team</option>
                              <option value="purple" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Purple Team</option>
                              <option value="red" className="dark:bg-[#181818] bg-white text-slate-800 dark:text-white">Red Team</option>
                            </select>
                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                              <ChevronDown size={12} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Database Instruction Block */}
              <div className="p-4 dark:bg-purple-500/5 bg-purple-500/5 border border-purple-500/20 rounded-xl flex flex-col gap-3">
                <div className="flex items-center gap-2 text-purple-400">
                  <Database size={16} />
                  <span className="text-xs font-black uppercase tracking-wider">Required Supabase Setup Configuration</span>
                </div>
                <p className="text-[10px] dark:text-white/60 text-slate-600 font-medium leading-relaxed">
                  Custom event team overrides require the <code className="font-mono bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-purple-400">user_event_teams</code> mapping table in Supabase. If you have not created it yet or are getting database errors, run the following script in your <strong className="dark:text-white text-slate-800">Supabase SQL Editor</strong>:
                </p>
                
                <div className="relative">
                  <pre className="text-[9px] font-mono dark:bg-black/40 bg-slate-900 p-3 rounded-lg overflow-x-auto text-zinc-300 border dark:border-white/5 border-black/10 max-h-36">
                    {`CREATE TABLE IF NOT EXISTS public.user_event_teams (
    steamid TEXT NOT NULL REFERENCES public.profiles(steamid) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    team TEXT NOT NULL,
    PRIMARY KEY (steamid, event_id)
);

ALTER TABLE public.user_event_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.user_event_teams
    FOR SELECT USING (true);`}
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      const sql = `CREATE TABLE IF NOT EXISTS public.user_event_teams (
    steamid TEXT NOT NULL REFERENCES public.profiles(steamid) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    team TEXT NOT NULL,
    PRIMARY KEY (steamid, event_id)
);

ALTER TABLE public.user_event_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.user_event_teams
    FOR SELECT USING (true);`;
                      navigator.clipboard.writeText(sql);
                      alert("SQL configuration script copied to clipboard!");
                    }}
                    className="absolute top-2 right-2 p-1.5 dark:bg-white/5 bg-slate-800 text-slate-300 dark:text-white/40 hover:dark:bg-white/10 hover:bg-slate-700 hover:text-white rounded-md transition-all border dark:border-white/5 border-black/10"
                    title="Copy SQL to Clipboard"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal to cleanup/purge old audit logs */}
      {cleanupModalOpen && (
        <div className="fixed inset-0 z-50 backdrop-blur-md bg-black/70 flex items-center justify-center p-4">
          <div className="dark:bg-[#181818] bg-white border dark:border-white/10 border-black/10 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b dark:border-white/10 border-black/10 pb-3">
              <h3 className="font-bold text-lg dark:text-white text-slate-900 flex items-center gap-2">
                <Trash2 className="text-amber-500" size={20} />
                Audit Logs Cleanup
              </h3>
              <button
                onClick={() => setCleanupModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Purge historical administrative point adjustment audit records older than a selected threshold. This improves dashboard loading speeds and keeps audit logs focused on recent seasons.
            </p>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500/90 flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                <strong>Note:</strong> Purging audit logs removes the adjustment history trail records. Current user total points and leaderboard standing are <strong>preserved</strong>.
              </span>
            </div>

            <div className="flex flex-col gap-2 my-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-white/40">Purge records older than:</label>
              <div className="grid grid-cols-3 gap-2">
                {[30, 60, 90, 180, 365].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setCleanupDays(d)}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer",
                      cleanupDays === d
                        ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-sm"
                        : "dark:bg-black/30 bg-slate-100 dark:border-white/5 border-black/5 dark:text-slate-300 text-slate-700 hover:border-amber-500/30"
                    )}
                  >
                    {d} Days
                  </button>
                ))}
              </div>
            </div>

            {/* Estimated log count */}
            {(() => {
              const cutoffTime = Date.now() - cleanupDays * 24 * 60 * 60 * 1000;
              const matchingLogs = teamAdjustments.filter(a => new Date(a.created_at).getTime() < cutoffTime);
              return (
                <div className="p-3 rounded-xl dark:bg-black/40 bg-slate-100 border dark:border-white/5 border-black/5 flex items-center justify-between text-xs">
                  <span className="opacity-70 dark:text-white text-slate-800">Records to be purged:</span>
                  <span className="font-mono font-bold text-amber-400">
                    {matchingLogs.length} adjustment{matchingLogs.length === 1 ? '' : 's'}
                  </span>
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-3 pt-2 border-t dark:border-white/10 border-black/10">
              <button
                type="button"
                onClick={() => setCleanupModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold dark:bg-white/5 bg-slate-100 hover:bg-slate-200 dark:hover:bg-white/10 dark:text-white text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCleaningUp}
                onClick={handleCleanupAuditLogs}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Trash2 size={14} />
                {isCleaningUp ? 'Purging...' : `Purge Logs Older Than ${cleanupDays} Days`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal to delete all submissions for a previous event */}
      {deleteEventModalOpen && (
        <div className="fixed inset-0 z-50 backdrop-blur-md bg-black/70 flex items-center justify-center p-4">
          <div className="dark:bg-[#181818] bg-white border dark:border-white/10 border-black/10 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b dark:border-white/10 border-black/10 pb-3">
              <h3 className="font-bold text-lg dark:text-white text-slate-900 flex items-center gap-2">
                <Trash2 className="text-red-500" size={20} />
                Clear Event Submissions
              </h3>
              <button
                onClick={() => setDeleteEventModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Select an event to permanently delete all associated submission records. User leaderboard totals will be synchronized automatically.
            </p>

            <div className="flex flex-col gap-2 my-2">
              <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-white/40">Select Event:</label>
              <select
                value={targetDeleteEventId}
                onChange={(e) => setTargetDeleteEventId(e.target.value)}
                className="w-full dark:bg-[#111111] bg-slate-50 border dark:border-white/10 border-black/10 rounded-xl px-3 py-2 text-sm font-semibold dark:text-white text-slate-800"
              >
                <option value="">-- Choose an Event --</option>
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.title} {evt.is_active ? '(Active Event)' : '(Past Event)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t dark:border-white/10 border-black/10">
              <button
                onClick={() => setDeleteEventModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold dark:bg-white/5 bg-slate-100 hover:bg-slate-200 dark:hover:bg-white/10 dark:text-white text-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={!targetDeleteEventId || isProcessingBulk}
                onClick={() => {
                  if (targetDeleteEventId) {
                    handleDeleteEventSubmissions(targetDeleteEventId);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                Delete All Event Submissions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submission Verification Popup Modal */}
      {verifyPopupMsg && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className={cn(
            "border rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-center flex flex-col items-center gap-4 animate-in zoom-in-95 duration-150 dark:bg-[#141414] bg-white",
            verifyPopupMsg.status === 'verified' ? "border-emerald-500/30" : "border-red-500/30"
          )}>
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl border shadow-lg shrink-0",
              verifyPopupMsg.status === 'verified'
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/20 text-red-400 border-red-500/30"
            )}>
              {verifyPopupMsg.status === 'verified' ? <CheckCircle size={32} /> : <XCircle size={32} />}
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black dark:text-white text-slate-900">{verifyPopupMsg.title}</h3>
              <p className="text-xs font-bold opacity-60 dark:text-white text-slate-700">
                {verifyPopupMsg.userName} • {verifyPopupMsg.gameTitle}
              </p>
            </div>

            <div className="w-full p-4 rounded-2xl dark:bg-black/40 bg-slate-100 border border-black/5 dark:border-white/5 flex flex-col items-center gap-2">
              {verifyPopupMsg.status === 'verified' ? (
                <>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    +{verifyPopupMsg.points} PTS
                  </div>
                  <p className="text-xs opacity-75 dark:text-slate-300 text-slate-600">
                    Points verified and synced to <span className={cn(
                      "font-black uppercase px-1.5 py-0.5 rounded text-[10px] border",
                      TEAM_COLORS[verifyPopupMsg.userTeam as Team]?.secondary || "bg-purple-500/10",
                      TEAM_COLORS[verifyPopupMsg.userTeam as Team]?.primary || "text-purple-400",
                      TEAM_COLORS[verifyPopupMsg.userTeam as Team]?.border || "border-purple-500/20"
                    )}>Team {verifyPopupMsg.userTeam}</span> total.
                  </p>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold text-red-400 uppercase tracking-wider">
                    Submission Status: Rejected
                  </div>
                  {verifyPopupMsg.rejectionReason && (
                    <p className="text-xs italic dark:text-slate-300 text-slate-600 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20 text-left w-full">
                      "{verifyPopupMsg.rejectionReason}"
                    </p>
                  )}
                </>
              )}
            </div>

            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 py-1.5 px-3 rounded-full border border-emerald-500/20 inline-block">
              ✓ Leaderboard & Event Scores Synchronized
            </p>

            <button
              onClick={() => setVerifyPopupMsg(null)}
              className={cn(
                "w-full py-3.5 rounded-2xl text-white font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg mt-1",
                verifyPopupMsg.status === 'verified'
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-red-600 hover:bg-red-500"
              )}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Visual contribution pie chart of each member to their team's points
function TeamPointContributionChart({ 
  users, 
  theme, 
  onViewProfile,
  filterTeam 
}: { 
  users: any[]; 
  theme: any; 
  onViewProfile?: (id: string) => void;
  filterTeam: Team | 'all';
}) {
  const [selectedChartTeam, setSelectedChartTeam] = React.useState<Team>('blue');
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  // Sync with main team filter if a valid team is selected
  React.useEffect(() => {
    if (filterTeam !== 'all' && filterTeam !== 'none') {
      setSelectedChartTeam(filterTeam);
    }
  }, [filterTeam]);

  const teamMembers = React.useMemo(() => {
    return users
      .filter(u => u.team === selectedChartTeam)
      .sort((a, b) => Number(b.points || 0) - Number(a.points || 0));
  }, [users, selectedChartTeam]);

  const totalPoints = React.useMemo(() => {
    return teamMembers.reduce((sum, m) => sum + Number(m.points || 0), 0);
  }, [teamMembers]);

  // Slices are members with actual points > 0
  const chartSlices = React.useMemo(() => {
    return teamMembers.filter(m => Number(m.points || 0) > 0);
  }, [teamMembers]);

  const chartTeams: Team[] = ['blue', 'green', 'purple', 'red'];

  const getSliceColor = (index: number, total: number) => {
    const hues: Record<Team, number> = {
      blue: 217,
      green: 142,
      purple: 270,
      red: 0,
      none: 200
    };
    const baseHue = hues[selectedChartTeam] || 0;
    // Sequential lightness from 42% to 74%
    const step = total > 1 ? index / (total - 1) : 0.5;
    const lightness = 42 + step * 32; 
    const saturation = 75 + (index % 3) * 5; 
    return `hsl(${baseHue}, ${saturation}%, ${lightness}%)`;
  };

  // Convert angles for pie slices
  const wedges = React.useMemo(() => {
    let currentAngle = 0;
    return chartSlices.map((slide, index) => {
      const percentage = totalPoints > 0 ? Number(slide.points || 0) / totalPoints : 0;
      const angleSweep = percentage * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angleSweep;
      currentAngle = endAngle;

      return {
        member: slide,
        percentage,
        startAngle,
        endAngle,
        color: getSliceColor(index, chartSlices.length)
      };
    });
  }, [chartSlices, totalPoints, selectedChartTeam]);

  // Helper to construct SVG Path
  const getWedgePath = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    let diff = endAngle - startAngle;
    if (diff >= 360) {
      diff = 359.99;
    }
    const safeEnd = startAngle + diff;

    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (safeEnd - 90) * Math.PI / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArcFlag = diff > 180 ? 1 : 0;

    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  };

  const activeWidget = hoveredIndex !== null ? wedges[hoveredIndex] : null;

  return (
    <div className="dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 rounded-2xl p-6 mb-8 shadow-sm dark:shadow-none">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h3 className="text-base font-black dark:text-white text-slate-900 tracking-wide">
            Team Point Contributions
          </h3>
          <p className="text-xs dark:text-white/40 text-slate-400 mt-1">
            Visual breakdown of member point contribution percentage of each member towards their team's score.
          </p>
        </div>

        {/* Team Selector tabs */}
        <div className="flex bg-black/10 dark:bg-white/5 p-1 rounded-xl border border-black/5 dark:border-white/5 self-stretch sm:self-auto justify-between sm:justify-start">
          {chartTeams.map(t => (
            <button
              key={t}
              onClick={() => setSelectedChartTeam(t)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                selectedChartTeam === t 
                  ? `${TEAM_COLORS[t].primary} ${TEAM_COLORS[t].secondary} shadow-sm ring-1 ring-${t}-accent/20`
                  : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center min-h-[220px]">
        {/* Chart View */}
        <div className="md:col-span-5 flex flex-col items-center justify-center relative">
          {totalPoints === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-full dark:bg-white/5 bg-slate-50 flex items-center justify-center mb-2 border dark:border-white/5 border-black/5">
                <Settings size={20} className="dark:text-white/20 text-slate-400 font-bold" />
              </div>
              <span className="text-xs font-black dark:text-white/60 text-slate-700 capitalize">
                No Points Awarded Yet
              </span>
              <span className="text-[10px] dark:text-white/30 text-slate-400 mt-1">
                No players on Team {selectedChartTeam} have points.
              </span>
            </div>
          ) : (
            <div className="relative w-44 h-44 md:w-48 md:h-48 flex items-center justify-center group/donut">
              <svg 
                viewBox="0 0 200 200" 
                className="w-full h-full transform -rotate-180 select-none scale-x-[-1]"
              >
                {wedges.map((wedge, idx) => {
                  const isHovered = hoveredIndex === idx;
                  const pathD = getWedgePath(100, 100, isHovered ? 88 : 80, wedge.startAngle, wedge.endAngle);
                  return (
                    <path
                      key={idx}
                      d={pathD}
                      fill={wedge.color}
                      className="transition-all duration-300 cursor-pointer origin-center"
                      style={{
                        opacity: hoveredIndex === null || isHovered ? 1 : 0.45,
                        transform: isHovered ? 'scale(1.025)' : 'scale(1)',
                      }}
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => onViewProfile?.(wedge.member.steamid || wedge.member.steamId || wedge.member.discord_id || wedge.member.id)}
                    />
                  );
                })}
                {/* Center cut-out circle to make it a donut */}
                <circle 
                  cx="100" 
                  cy="100" 
                  r="52" 
                  className="fill-white dark:fill-[#111111] transition-colors" 
                />
              </svg>

              {/* Dynamic Center Panel */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-4">
                {activeWidget ? (
                  <div className="animate-in fade-in zoom-in-95 duration-200">
                    <span className="block text-[10px] uppercase tracking-widest font-extrabold dark:text-white/40 text-slate-400 truncate max-w-[120px]">
                      {activeWidget.member.steam_name || activeWidget.member.steamName || activeWidget.member.discord_name || 'User'}
                    </span>
                    <span className="block text-lg font-mono font-black dark:text-white text-slate-900 leading-tight">
                      {Number(activeWidget.member.points || 0)} pts
                    </span>
                    <span className={cn("inline-block text-[10px] font-black uppercase mt-0.5 px-1.5 py-0.5 rounded-full", TEAM_COLORS[selectedChartTeam]?.secondary || 'bg-slate-500/10', TEAM_COLORS[selectedChartTeam]?.primary || 'text-slate-400')}>
                      {(activeWidget.percentage * 100).toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-200">
                    <span className="block text-[9px] uppercase tracking-widest font-black dark:text-white/30 text-slate-400">
                      Total Points
                    </span>
                    <span className={cn("block text-2xl font-mono font-black", TEAM_COLORS[selectedChartTeam]?.primary || 'text-blue-500')}>
                      {totalPoints}
                    </span>
                    <span className="block text-[9px] font-bold dark:text-white/40 text-slate-400">
                      {chartSlices.length} contributor{chartSlices.length === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Legend Panel */}
        <div className="md:col-span-7 flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
          {teamMembers.length === 0 ? (
            <div className="text-center py-6">
              <span className="text-xs dark:text-white/40 text-slate-400 font-bold uppercase tracking-wider">
                No members found in this team.
              </span>
            </div>
          ) : (
            teamMembers.map((member, idx) => {
              const mId = member.steamid || member.steamId || member.discord_id || member.id || `member-${idx}`;
              const mName = member.steam_name || member.steamName || member.discord_name || member.discordName || mId;
              const mAvatar = member.steam_avatar || member.steamAvatar || member.discord_avatar || member.discordAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';

              const points = Number(member.points || 0);
              const percentage = totalPoints > 0 ? points / totalPoints : 0;
              const hasPoints = points > 0;
              const sliceIndex = chartSlices.findIndex(s => (s.steamid || s.discord_id) === mId);
              const sliceColor = hasPoints && sliceIndex !== -1 ? getSliceColor(sliceIndex, chartSlices.length) : 'transparent';
              
              const isHovered = hoveredIndex === sliceIndex && hasPoints;

              return (
                <div
                  key={mId}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-xl transition-all border border-transparent cursor-pointer",
                    isHovered 
                      ? "dark:bg-white/5 bg-slate-50 dark:border-white/10 border-black/10 scale-[1.01]" 
                      : "hover:dark:bg-white/5 hover:bg-slate-50"
                  )}
                  onMouseEnter={() => hasPoints && sliceIndex !== -1 && setHoveredIndex(sliceIndex)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => onViewProfile?.(mId)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Visual point indicator node */}
                    <div 
                      className="w-3 h-3 rounded-full shrink-0 border border-black/10 dark:border-white/10"
                      style={{ 
                        backgroundColor: hasPoints ? sliceColor : 'rgba(156, 163, 175, 0.15)',
                      }}
                    />

                    <img 
                      src={mAvatar} 
                      alt="" 
                      className="w-7 h-7 rounded-full object-cover shrink-0 border border-black/5 dark:border-white/10 animate-fade-in" 
                      referrerPolicy="no-referrer"
                    />

                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black dark:text-white text-slate-800 truncate">
                        {mName}
                      </span>
                      {member.discord_name && member.steam_name && (
                        <span className="text-[9px] font-bold dark:text-white/30 text-slate-400 truncate">
                          @{member.discord_name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 text-right font-mono">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold dark:text-white text-slate-800">
                        {points} pts
                      </span>
                      <span className="text-[10px] font-bold dark:text-white/40 text-slate-400 leading-none">
                        {(percentage * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}