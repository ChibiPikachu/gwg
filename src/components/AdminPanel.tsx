import React from 'react';
import { UserProfile, Team, TEAM_COLORS } from '@/types';
import { useAuth } from '@/components/AuthProvider';
import { Search, Settings, Shield, Clock, CheckCircle2, XCircle, ExternalLink, Plus, ChevronDown, Trophy, Database, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface SubmissionNotesMeta {
  hasNoAchievements: boolean;
  level?: number;
  userNotes: string;
}

export function parseNotesMeta(notes: string): SubmissionNotesMeta {
  if (notes && notes.startsWith('__META_START__')) {
    const endIdx = notes.indexOf('__META_END__');
    if (endIdx !== -1) {
      try {
        const jsonStr = notes.slice('__META_START__'.length, endIdx);
        const meta = JSON.parse(jsonStr);
        const userNotes = notes.slice(endIdx + '__META_END__'.length);
        return {
          hasNoAchievements: !!meta.hasNoAchievements,
          level: meta.level,
          userNotes
        };
      } catch (e) {
        // Fallback
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

type AdminTab = 'users' | 'submissions' | 'previous_submissions' | 'team_points';

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

  const fetchTeamAdjustments = React.useCallback(async () => {
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
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setEvents(list);
        const active = list.find((e: any) => e.is_active);
        setActiveEvent(active || null);
      }
    } catch (err) {
      console.error('Failed to fetch events inside AdminPanel:', err);
    }
  }, []);

  const handleAwardTeamPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    const isUser = awardTargetType === 'user';
    if (isUser && !awardUserId) {
      alert('Please select a user first!');
      return;
    }
    if (!isUser && !awardTeam) return;
    if (!awardPoints || parseInt(awardPoints) === 0) return;

    setIsAwarding(true);
    try {
      const selectedU = users.find(u => u.steamid === awardUserId);
      const teamToSend = isUser ? (selectedU?.team || 'blue') : awardTeam;

      const res = await fetch('/api/admin/team-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team: teamToSend,
          points: parseInt(awardPoints),
          notes: awardNotes,
          userId: isUser ? awardUserId : null
        })
      });
      if (res.ok) {
        setAwardPoints('');
        setAwardNotes('');
        setAwardUserId('');
        // Reload all data (including user points and adjustments log)
        await fetchTeamAdjustments();
        await fetchUsers(); // Refresh leaderboard data
        alert(isUser ? 'Points successfully awarded to the user!' : 'Points successfully awarded to the team!');
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

  const handleDeleteAdjustment = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this point adjustment?')) return;
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchTeamAdjustments();
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
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } 
  }, []);

  const fetchSubmissions = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/submissions');
      if (res.ok) {
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data : []);
        
        // Batch fetch HLTB data for these submissions
        const uniqueTitles = Array.from(new Set((data || []).map((s: any) => s.game_name)));
        if (uniqueTitles.length > 0) {
          fetch('/api/hltb-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titles: uniqueTitles })
          })
          .then(r => r.json())
          .then(hltb => {
             console.log('[Admin] HLTB Data received:', hltb);
             setHltbData(prev => ({ ...prev, ...hltb }));
          })
          .catch(err => console.error('HLTB batch fetch failed:', err));
        }
      }
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    }
  }, []);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchSubmissions(), fetchTeamAdjustments(), fetchEvents()]);
    setLoading(false);
  }, [fetchUsers, fetchSubmissions, fetchTeamAdjustments, fetchEvents]);

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
    const meta = parseNotesMeta(sub?.notes || '');
    if (meta.hasNoAchievements) {
      const hoursPlayed = parseFloat(editHours) || Number(sub?.hours_during || 0);
      const hoursBefore = Number(sub?.hours_before || 0);
      const finalPlayTime = Math.max(0, hoursPlayed - hoursBefore);
      const hltb = hltbData[sub?.game_name || ''] || { hltb_main: sub?.hltb_main, hltb_extras: sub?.hltb_extras };
      const nonAchPts = calculateNonAchievementPoints(levelVal, finalPlayTime, hltb, sub?.completion_status);
      return String(nonAchPts);
    }
    const achs = parseInt(achievementsVal) || 0;
    let bonus = 0;
    if (sub?.completion_status === 'completed') {
      bonus = 30;
    } else if (sub?.completion_status === 'beaten') {
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

      const res = await fetch('/api/admin/verify-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        // UI Live Update: Update local state immediately
        setSubmissions(prev => prev.map(s => s.id === reviewingId ? { 
          ...s, 
          status, 
          points: Math.round(parseFloat(pointsAwarded) || 0),
          rejection_reason: status === 'rejected' ? rejectionReason : '',
          hours_during: parseFloat(editHours),
          achievements_during: parseInt(editAchievements),
          multiplier: editMultiplier,
          notes: updatedNotes
        } : s));
        setReviewingId(null);
        setRejectionReason('');
      } else {
        const data = await res.json();
        alert(`Verification failed: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to update submission');
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

  const checkIsCurrentSub = React.useCallback((s: any) => {
    if (!activeEvent) return false;
    if (s.event_id === activeEvent.id) return true;
    const subTime = new Date(s.created_at || 0).getTime();
    const eventStartTime = new Date(activeEvent.start_date || activeEvent.startDate).getTime();
    return subTime >= eventStartTime;
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

  const filteredUsers = safeUsers.filter(u => {
    const matchesTeam = filterTeam === 'all' || (u.team || 'none') === filterTeam;
    const matchesSearch = (u.steam_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (u.discord_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          String(u.steamid || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTeam && matchesSearch;
  });

  const filteredSubmissions = submissions.filter(sub => {
    if (sub.game_name === 'Event Update' || sub.game_name === 'Screenshot Points') return false;

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
          {submissions.filter(s => s.status === 'pending' && checkIsCurrentSub(s)).length > 0 && (
            <span className={cn("w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center shrink-0", theme.bg)}>
              {submissions.filter(s => s.status === 'pending' && checkIsCurrentSub(s)).length}
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
          {submissions.filter(s => s.status === 'pending' && !checkIsCurrentSub(s)).length > 0 && (
            <span className={cn("w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center shrink-0 bg-amber-500")}>
              {submissions.filter(s => s.status === 'pending' && !checkIsCurrentSub(s)).length}
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
      </div>

      {activeTab !== 'team_points' && (
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

          <section>
            <h2 className="text-lg md:text-xl font-bold mb-4 md:mb-8 dark:text-white text-slate-900">User Directory</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {filteredUsers.map((u) => (
                <div key={u.steamid} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 md:p-6 dark:bg-[#111111] bg-white rounded-2xl border dark:border-white/5 border-black/5 relative group shadow-sm hover:dark:border-white/10 hover:border-black/10 transition-all min-w-0">
                  <div className="flex items-center gap-4 min-w-0">
                      <button 
                        onClick={() => onViewProfile?.(u.steamid)}
                        className={cn(
                          "w-12 h-12 md:w-14 md:h-14 rounded-full border-2 p-1 shrink-0 transition-all hover:scale-105 active:scale-95",
                          u.team && u.team !== 'none' ? TEAM_COLORS[u.team as Team].border : "dark:border-white/10 border-black/10"
                        )}
                        title="View Profile"
                      >
                        <img src={u.steam_avatar} alt="" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                      </button>
                      <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span className="text-sm font-black text-blue-400 truncate">{u.steam_name}</span>
                            {u.role === 'admin' && (
                              <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">Admin</span>
                            )}
                            {u.discord_name && (
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
                          <span className="text-[10px] font-mono opacity-40 dark:text-white/40 text-slate-400 select-all" title="Click to select Steam ID">ID: {u.steamid}</span>
                        </div>
                      </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0 w-full sm:w-auto justify-end">
                    <div className="flex flex-col gap-1 w-32 md:w-36">
                      <span className="text-[9px] uppercase font-extrabold opacity-30 dark:text-white text-slate-500 tracking-wider">Assign Team</span>
                      <div className="relative">
                        <select
                          value={u.team || 'none'}
                          disabled={updating === u.steamid}
                          onChange={(e) => assignTeam(u.steamid, e.target.value as Team)}
                          className={cn(
                            "appearance-none dark:bg-[#181818] bg-slate-50 border dark:border-white/5 border-black/5 rounded-xl px-3 py-1.5 pr-8 text-[11px] font-bold uppercase tracking-wider focus:outline-none transition-all w-full cursor-pointer h-9",
                            u.team && u.team !== 'none' 
                              ? `${TEAM_COLORS[u.team as Team].secondary} ${TEAM_COLORS[u.team as Team].primary} dark:border-${u.team}-500/30 border-${u.team}-500/20` 
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
                         onClick={() => setSettingsUserId(settingsUserId === u.steamid ? null : u.steamid)}
                         className="h-9 w-9 dark:bg-white/5 bg-slate-50 dark:text-white/40 text-slate-400 hover:dark:text-white hover:text-slate-900 rounded-xl transition-colors flex items-center justify-center border dark:border-transparent border-black/5 hover:border-black/10 shrink-0"
                         title="Account Actions"
                       >
                         <Settings size={14} className={cn(settingsUserId === u.steamid && theme.text)} />
                       </button>
                       {settingsUserId === u.steamid && (
                         <>
                           <div className="fixed inset-0 z-30" onClick={() => setSettingsUserId(null)} />
                           <div className="absolute right-0 bottom-full mb-2 w-48 dark:bg-[#1c1c1c] bg-white border dark:border-white/10 border-black/10 rounded-xl shadow-2xl z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                             <div className="p-1.5 flex flex-col gap-0.5">
                               <button 
                                 onClick={() => { setEditingUserEventTeams(u); setSettingsUserId(null); }}
                                 className="flex items-center gap-2 w-full px-3 py-2 text-left text-[10px] font-bold uppercase dark:text-white text-slate-700 hover:dark:bg-white/10 hover:bg-slate-50 rounded-lg transition-colors"
                               >
                                 <Trophy size={14} className="text-amber-500" />
                                 Manage Event Teams
                               </button>
                               <div className="h-[1px] dark:bg-white/5 bg-black/5 my-1" />
                               <button 
                                 onClick={() => { handleUpdateRole(u.steamid, u.role === 'admin' ? 'member' : 'admin'); setSettingsUserId(null); }}
                                 disabled={updating === u.steamid || u.steamid === currentUser?.steamId}
                                 className="flex items-center gap-2 w-full px-3 py-2 text-left text-[10px] font-bold uppercase dark:text-white text-slate-700 hover:dark:bg-white/10 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                               >
                                 <Shield size={14} className={u.role === 'admin' ? 'text-red-500' : 'text-emerald-500'} />
                                 {u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                               </button>
                               <div className="h-[1px] dark:bg-white/5 bg-black/5 my-1" />
                               <button 
                                 onClick={() => { handleKickUser(u.steamid, u.steam_name); setSettingsUserId(null); }}
                                 disabled={updating === u.steamid || u.steamid === currentUser?.steamId}
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
              ))}
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
                      const isCurrent = checkIsCurrentSub(s);
                      const matchesTab = activeTab === 'submissions' ? isCurrent : !isCurrent;
                      return s.status === 'verified' && matchesTab;
                    }).length
                  } Verified
                </span>
              </div>
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
                      className="absolute top-2 right-2 md:top-4 md:right-4 z-10 bg-blue-900/60 backdrop-blur-md hover:bg-blue-900/80 text-blue-100 text-[10px] font-mono px-2 py-1 rounded-md border border-blue-500/30 transition-all flex items-center gap-1.5 shadow-lg"
                      title="Open Steam Store"
                    >
                      <ExternalLink size={10} />
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
                                className="text-[9px] md:text-[10px] text-amber-500 dark:text-amber-400 hover:underline flex items-center gap-1 shrink-0 w-fit inline-flex items-center"
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
                               <div className="flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-lg md:rounded-xl bg-amber-500/10 border border-amber-500/20 shadow-lg shadow-amber-500/5 shrink-0">
                                 <div className="flex flex-col items-center min-w-[24px] md:min-w-[30px]">
                                   <span className="text-[6px] md:text-[7px] uppercase font-bold opacity-50 text-amber-500">Main</span>
                                   <span className="text-xs md:text-sm font-black text-amber-500 leading-none">{hltbData[sub.game_name].hltb_main}h</span>
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
                              <span className="text-[10px] font-bold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-md">
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
                              "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/20"
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
                            
                            let m = sub.multiplier || 1.0;
                            if (hours >= 25) m = 4.0;
                            else if (hours >= 15) m = 3.0;
                            else if (hours >= 8) m = 2.0;
                            else if (hours > 0) m = 1.0;
 
                            setEditMultiplier(m);
                            
                            const meta = parseNotesMeta(sub.notes);
                            let initialLvl = 2;
                            if (meta.hasNoAchievements) {
                              initialLvl = meta.level !== undefined ? meta.level : 2;
                            }
                            setSelectedLevel(initialLvl);

                            let basePoints = 0;
                            if (meta.hasNoAchievements) {
                              const hltb = hltbData[sub.game_name] || { hltb_main: sub.hltb_main, hltb_extras: sub.hltb_extras };
                              const hoursBefore = Number(sub.hours_before || 0);
                              const finalPlayTime = Math.max(0, hours - hoursBefore);
                              basePoints = calculateNonAchievementPoints(initialLvl, finalPlayTime, hltb, sub.completion_status);
                            } else {
                              let bonus = 0;
                              if (sub.completion_status === 'completed') {
                                bonus = 30;
                              } else if (sub.completion_status === 'beaten') {
                                bonus = 15;
                              }
                              basePoints = Math.round(achievements * m) + bonus;
                            }
                            setPointsAwarded(String(basePoints));
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
                                 <span className="text-[7px] md:text-[8px] uppercase font-bold text-amber-500/50">Story</span>
                                 <span className="text-[10px] md:text-xs font-black text-amber-500">{hltbData[sub.game_name].hltb_main}h</span>
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
                            <div className="text-[9px] md:text-[10px] font-bold uppercase animate-pulse text-amber-500">Fetching HLTB...</div>
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
                                <label className="text-[9px] md:text-[10px] uppercase font-bold text-amber-400">Award Level</label>
                                <select
                                  className={cn("w-full bg-slate-900 border border-white/10 rounded-lg md:rounded-xl p-2.5 md:p-3 focus:outline-none text-white text-sm focus:border-amber-500")}
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
                                  
                                  let m = 1.0;
                                  if (val >= 25) m = 4.0;
                                  else if (val >= 15) m = 3.0;
                                  else if (val >= 8) m = 2.0;
                                  
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
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-50 dark:text-white text-slate-800">Select User</label>
                  <select
                    value={awardUserId}
                    onChange={(e) => setAwardUserId(e.target.value)}
                    className="w-full dark:bg-black/40 bg-slate-50 border dark:border-white/5 border-black/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans text-sm dark:text-white text-slate-900"
                    required
                  >
                    <option value="">-- Choose User --</option>
                    {users
                      .filter(u => u.steamid && !u.steamid.startsWith('team_pts_') && u.team && u.team !== 'none')
                      .map(u => (
                        <option key={u.steamid} value={u.steamid}>
                          {u.steam_name} (Team {u.team})
                        </option>
                      ))}
                  </select>
                </div>
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
            <div>
              <h3 className="text-base font-bold dark:text-white text-slate-800 font-sans">Point Adjustments Log</h3>
              <p className="text-xs opacity-50 mt-1">Audit trail of all administrative adjustments.</p>
            </div>

            {teamAdjustments.length === 0 ? (
              <div className="p-12 text-center opacity-30 text-xs italic dark:text-white text-slate-500">
                No adjustments recorded yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {teamAdjustments.map((adj) => {
                  const isUserAdj = !adj.user_id.startsWith('team_pts_');
                  const targetUser = isUserAdj ? users.find(u => u.steamid === adj.user_id) : null;
                  const teamName = isUserAdj ? (targetUser?.team || 'none') : adj.user_id.replace('team_pts_', '');
                  return (
                    <div key={adj.id} className="p-4 rounded-xl dark:bg-black/20 bg-slate-50 border dark:border-white/5 border-black/5 flex items-center justify-between gap-4 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "font-black tracking-widest text-[9px] uppercase px-2 py-0.5 rounded border shrink-0",
                          TEAM_COLORS[teamName as Team]?.primary || "text-slate-500",
                          TEAM_COLORS[teamName as Team]?.border || "border-slate-500/15",
                          TEAM_COLORS[teamName as Team]?.secondary || "bg-slate-500/5"
                        )}>
                          {teamName}
                        </span>
                        <div>
                          <p className="text-xs font-bold dark:text-white text-slate-850 select-text">
                            {isUserAdj ? (
                              <>
                                Awarded to <span className="underline decoration-slate-200 dark:decoration-white/10 underline-offset-2">{adj.user_name}</span>: {adj.notes}
                              </>
                            ) : (
                              adj.notes
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] opacity-40 font-mono">{new Date(adj.created_at).toLocaleString()}</span>
                            {isUserAdj && (
                              <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-500/20 shrink-0">
                                Screenshot Points
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className={cn(
                          "font-mono font-bold text-xs shrink-0 px-2 py-0.5 rounded",
                          adj.points >= 0 ? "text-emerald-500 bg-emerald-500/5 border border-emerald-500/10" : "text-red-500 bg-red-500/5 border border-red-500/10"
                        )}>
                          {adj.points >= 0 ? `+${adj.points}` : adj.points} pts
                        </span>

                        <button
                          onClick={() => handleDeleteAdjustment(adj.id)}
                          className="p-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded text-red-500 text-[10px] font-bold tracking-widest uppercase transition-all cursor-pointer outline-none"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
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
              <div className="p-4 dark:bg-amber-500/5 bg-amber-500/5 border border-amber-500/20 rounded-xl flex flex-col gap-3">
                <div className="flex items-center gap-2 text-amber-500">
                  <Database size={16} />
                  <span className="text-xs font-black uppercase tracking-wider">Required Supabase Setup Configuration</span>
                </div>
                <p className="text-[10px] dark:text-white/60 text-slate-600 font-medium leading-relaxed">
                  Custom event team overrides require the <code className="font-mono bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-amber-500">user_event_teams</code> mapping table in Supabase. If you have not created it yet or are getting database errors, run the following script in your <strong className="dark:text-white text-slate-800">Supabase SQL Editor</strong>:
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
                      onClick={() => onViewProfile?.(wedge.member.steamid)}
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
                      {activeWidget.member.steam_name}
                    </span>
                    <span className="block text-lg font-mono font-black dark:text-white text-slate-900 leading-tight">
                      {Number(activeWidget.member.points || 0)} pts
                    </span>
                    <span className={cn("inline-block text-[10px] font-black uppercase mt-0.5 px-1.5 py-0.5 rounded-full", TEAM_COLORS[selectedChartTeam].secondary, TEAM_COLORS[selectedChartTeam].primary)}>
                      {(activeWidget.percentage * 100).toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-200">
                    <span className="block text-[9px] uppercase tracking-widest font-black dark:text-white/30 text-slate-400">
                      Total Points
                    </span>
                    <span className={cn("block text-2xl font-mono font-black", TEAM_COLORS[selectedChartTeam].primary)}>
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
              const points = Number(member.points || 0);
              const percentage = totalPoints > 0 ? points / totalPoints : 0;
              const hasPoints = points > 0;
              const sliceIndex = chartSlices.findIndex(s => s.steamid === member.steamid);
              const sliceColor = hasPoints && sliceIndex !== -1 ? getSliceColor(sliceIndex, chartSlices.length) : 'transparent';
              
              const isHovered = hoveredIndex === sliceIndex && hasPoints;

              return (
                <div
                  key={member.steamid}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-xl transition-all border border-transparent cursor-pointer",
                    isHovered 
                      ? "dark:bg-white/5 bg-slate-50 dark:border-white/10 border-black/10 scale-[1.01]" 
                      : "hover:dark:bg-white/5 hover:bg-slate-50"
                  )}
                  onMouseEnter={() => hasPoints && sliceIndex !== -1 && setHoveredIndex(sliceIndex)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => onViewProfile?.(member.steamid)}
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
                      src={member.steam_avatar} 
                      alt="" 
                      className="w-7 h-7 rounded-full object-cover shrink-0 border border-black/5 dark:border-white/10 animate-fade-in" 
                      referrerPolicy="no-referrer"
                    />

                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black dark:text-white text-slate-800 truncate">
                        {member.steam_name}
                      </span>
                      {member.discord_name && (
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