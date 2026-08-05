import React from 'react';
import { Trophy, Medal, Users, Shield, Bell, Loader2, History, Calendar, Award, Sparkles, Star, ChevronRight, Search, X, Filter, RotateCw, RefreshCw, CheckCircle } from 'lucide-react';
import { Team, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { parseNotesMeta } from '@/components/AdminPanel';

export default function Leaderboard({ onViewProfile }: { onViewProfile?: (id: string) => void }) {
  const { theme, user } = useAuth();
  const isAdmin = user?.isAdmin || user?.role === 'admin' || user?.role === 'admins';
  
  // Tabs: 'current' | 'previous'
  const [activeTab, setActiveTab] = React.useState<'current' | 'previous'>('current');
  
  // Current Event state
  const [users, setUsers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingEvent, setLoadingEvent] = React.useState(true);
  const [activeEvent, setActiveEvent] = React.useState<any | null>(null);
  const [adjustments, setAdjustments] = React.useState<any[]>([]);

  // Search & Filter state for Current Event
  const [searchQuery, setSearchQuery] = React.useState('');
  const [teamFilter, setTeamFilter] = React.useState<string>('all');

  // Search & Filter state for Previous Events
  const [prevSearchQuery, setPrevSearchQuery] = React.useState('');
  const [prevTeamFilter, setPrevTeamFilter] = React.useState<string>('all');

  // Previous Events state
  const [events, setEvents] = React.useState<any[]>([]);
  const [selectedPreviousEventId, setSelectedPreviousEventId] = React.useState<string | null>(null);
  const [previousEventData, setPreviousEventData] = React.useState<any | null>(null);
  const [loadingPrevious, setLoadingPrevious] = React.useState(false);

  // Admin Resync state
  const [resyncingEventId, setResyncingEventId] = React.useState<string | null>(null);
  const [resyncSuccessMsg, setResyncSuccessMsg] = React.useState<string | null>(null);

  // Force Scores Modal State
  const [forceScoresModalOpen, setForceScoresModalOpen] = React.useState(false);
  const [forceModalEventId, setForceModalEventId] = React.useState<string | null>(null);
  const [forceModalEventTitle, setForceModalEventTitle] = React.useState<string>('');
  const [forceTeamTotals, setForceTeamTotals] = React.useState<Record<string, number>>({ blue: 0, green: 0, purple: 0, red: 0 });
  const [forceUserScores, setForceUserScores] = React.useState<Record<string, number>>({});
  const [forceMemberDetails, setForceMemberDetails] = React.useState<any[]>([]);
  const [forceMemberSearch, setForceMemberSearch] = React.useState('');
  const [isSavingForcedScores, setIsSavingForcedScores] = React.useState(false);
  const [adminPopupMsg, setAdminPopupMsg] = React.useState<{ title: string; message: string } | null>(null);

  const handleResyncEventScores = async (eventId: string, title?: string) => {
    if (!eventId) return;
    setResyncingEventId(eventId);
    setResyncSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/resync-event-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to re-sync event scores');

      if (activeTab === 'previous' && selectedPreviousEventId === eventId) {
        fetchPreviousEventLeaderboard(eventId);
      }
      fetchUsers();

      fetch('/api/events')
        .then(async r => {
          if (r.ok && r.headers.get('content-type')?.includes('application/json')) {
            return r.json();
          }
          return [];
        })
        .then(evts => {
          if (Array.isArray(evts)) setEvents(evts);
        })
        .catch(() => {});

      setAdminPopupMsg({
        title: 'Scores Re-Synced Successfully',
        message: `Scores for ${title || 'Event'} have been recalculated from snapshot data & verified submissions. 0 user notifications were sent.`
      });
    } catch (err: any) {
      console.error('Failed to resync event scores:', err);
      alert(`Error re-syncing scores: ${err.message}`);
    } finally {
      setResyncingEventId(null);
    }
  };

  const openForceScoresModal = async (eventId: string, title: string) => {
    setForceModalEventId(eventId);
    setForceModalEventTitle(title);
    setForceScoresModalOpen(true);
    setForceMemberSearch('');
    
    try {
      const res = await fetch(`/api/leaderboard/event/${eventId}`);
      const data = await res.json();
      if (res.ok) {
        const totals: Record<string, number> = { blue: 0, green: 0, purple: 0, red: 0 };
        (data.standings || []).forEach((s: any) => {
          if (s.team) totals[s.team] = s.points || 0;
        });
        setForceTeamTotals(totals);

        const uScores: Record<string, number> = {};
        const members: any[] = [];
        (data.topUsers || []).forEach((u: any) => {
          uScores[u.steamid] = u.points || 0;
          members.push(u);
        });
        setForceUserScores(uScores);
        setForceMemberDetails(members);
      }
    } catch (err) {
      console.error('Failed to prefill force scores modal:', err);
    }
  };

  const handleSaveForcedScores = async () => {
    if (!forceModalEventId) return;
    setIsSavingForcedScores(true);
    try {
      const res = await fetch('/api/admin/force-event-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: forceModalEventId,
          teamTotals: forceTeamTotals,
          userScores: forceUserScores
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to force scores');

      setForceScoresModalOpen(false);
      
      if (activeTab === 'previous' && selectedPreviousEventId === forceModalEventId) {
        fetchPreviousEventLeaderboard(forceModalEventId);
      }
      fetchUsers();

      setAdminPopupMsg({
        title: 'Scores Forced Successfully',
        message: `Scores for ${forceModalEventTitle || 'Event'} have been locked to exact forced values. 0 user notifications were sent.`
      });
    } catch (err: any) {
      console.error('Error forcing scores:', err);
      alert(`Failed to force scores: ${err.message}`);
    } finally {
      setIsSavingForcedScores(false);
    }
  };

  const fetchUsers = React.useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('steamid, steam_name, steam_avatar, discord_id, discord_name, discord_avatar, active_avatar, team, status, points, role')
          .not('team', 'is', null)
          .neq('team', 'none');

        if (error) throw error;

        const transformed = (data || []).map((u: any) => ({
          ...u,
          steam_avatar: (u.active_avatar === 'discord' && u.discord_avatar) ? u.discord_avatar : (u.steam_avatar || u.discord_avatar || ''),
          points: u.points || 0
        })).sort((a: any, b: any) => b.points - a.points);

        setUsers(transformed);
        setLoading(false);
        return;
      } catch (err) {
        console.warn('Direct Supabase fetch for users failed, trying API fallback:', err);
      }
    }

    fetch('/api/leaderboard/users')
      .then(res => res.json())
      .then(data => {
        setUsers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch leaderboard users:', err);
        setLoading(false);
      });
  }, []);

  const fetchAdjustments = React.useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('team_adjustments')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setAdjustments(data);
          return;
        }
      } catch (err) {
        console.warn('Direct Supabase fetch for team adjustments failed:', err);
      }
    }

    fetch('/api/team-adjustments')
      .then(res => res.json())
      .then(data => {
        setAdjustments(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        console.error('Failed to fetch team adjustments:', err);
      });
  }, []);

  const fetchPreviousEventLeaderboard = React.useCallback((eventId: string) => {
    setLoadingPrevious(true);
    fetch(`/api/leaderboard/event/${eventId}`)
      .then(res => res.json())
      .then(data => {
        setPreviousEventData(data);
        setLoadingPrevious(false);
      })
      .catch(err => {
        console.error('Failed to fetch previous event leaderboard:', err);
        setLoadingPrevious(false);
      });
  }, []);

  React.useEffect(() => {
    fetchUsers();
    fetchAdjustments();

    // Fetch all events for active check & previous events list
    const loadEvents = async () => {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('start_date', { ascending: true });

          if (!error && data && Array.isArray(data)) {
            setEvents(data);
            const active = data.find((e: any) => e.is_active);
            setActiveEvent(active);

            const pastEvts = data.filter((e: any) => !e.is_active);
            if (pastEvts.length > 0) {
              const lastPast = pastEvts[pastEvts.length - 1];
              setSelectedPreviousEventId(lastPast.id);
              fetchPreviousEventLeaderboard(lastPast.id);
            }
            setLoadingEvent(false);
            return;
          }
        } catch (err) {
          console.warn('Direct Supabase fetch for events failed:', err);
        }
      }

      fetch('/api/events')
        .then(async res => {
          if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
            return res.json();
          }
          return [];
        })
        .then(data => {
          const allEvts = Array.isArray(data) ? data : [];
          setEvents(allEvts);
          
          const active = allEvts.find((e: any) => e.is_active);
          setActiveEvent(active);

          const pastEvts = allEvts.filter((e: any) => !e.is_active);
          if (pastEvts.length > 0) {
            const lastPast = pastEvts[pastEvts.length - 1];
            setSelectedPreviousEventId(lastPast.id);
            fetchPreviousEventLeaderboard(lastPast.id);
          }

          setLoadingEvent(false);
        })
        .catch(err => {
          console.warn('Failed to fetch events:', err);
          setLoadingEvent(false);
        });
    };

    loadEvents();

    if (!isSupabaseConfigured) return;

    // Subscribe to real-time updates for profiles
    const channel = supabase
      .channel('leaderboard-profiles')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'profiles' 
      }, () => {
        fetchUsers();
      })
      .subscribe();

    const subChannel = supabase
      .channel('leaderboard-submissions')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'submissions' 
      }, () => {
        fetchAdjustments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(subChannel);
    };
  }, [fetchUsers, fetchAdjustments, fetchPreviousEventLeaderboard]);

  const hideScores = !!activeEvent?.hide_scores;

  const safeUsers = Array.isArray(users) 
    ? [...users].sort((a, b) => {
        if (hideScores) {
          return (a.steam_name || '').localeCompare(b.steam_name || '');
        }
        return (Number(b.points) || 0) - (Number(a.points) || 0);
      }) 
    : [];

  const filteredUsers = React.useMemo(() => {
    return safeUsers.map((u, originalRankIndex) => ({ ...u, originalRank: originalRankIndex + 1 })).filter(u => {
      const matchesTeam = teamFilter === 'all' || u.team === teamFilter;
      const nameStr = (u.steam_name || u.steamName || '').toLowerCase();
      const discordStr = (u.discord_name || u.discordName || '').toLowerCase();
      const idStr = String(u.steamid || u.steamId || '').toLowerCase();
      const statusStr = (u.status || '').toLowerCase();
      const query = searchQuery.toLowerCase().trim();
      
      const matchesSearch = !query || 
        nameStr.includes(query) || 
        discordStr.includes(query) || 
        idStr.includes(query) || 
        statusStr.includes(query);

      return matchesTeam && matchesSearch;
    });
  }, [safeUsers, teamFilter, searchQuery]);

  const filteredPreviousUsers = React.useMemo(() => {
    if (!previousEventData?.topUsers) return [];
    return previousEventData.topUsers.filter((u: any) => {
      const matchesTeam = prevTeamFilter === 'all' || u.team === prevTeamFilter;
      const nameStr = (u.steam_name || '').toLowerCase();
      const discordStr = (u.discord_name || '').toLowerCase();
      const idStr = String(u.steamid || '').toLowerCase();
      const statusStr = (u.status || '').toLowerCase();
      const query = prevSearchQuery.toLowerCase().trim();

      const matchesSearch = !query || 
        nameStr.includes(query) || 
        discordStr.includes(query) || 
        idStr.includes(query) || 
        statusStr.includes(query);

      return matchesTeam && matchesSearch;
    });
  }, [previousEventData, prevTeamFilter, prevSearchQuery]);

  const getTeamAdjustmentPoints = (teamName: string) => {
    return adjustments
      .filter(a => a.user_id === `team_pts_${teamName}`)
      .reduce((acc, a) => acc + Number(a.points || 0), 0);
  };

  const standings = [
    { team: 'blue', points: safeUsers.filter(u => u.team === 'blue').reduce((acc, u) => acc + Number(u.points || 0), 0) + getTeamAdjustmentPoints('blue'), members: safeUsers.filter(u => u.team === 'blue').length, rank: 1 },
    { team: 'purple', points: safeUsers.filter(u => u.team === 'purple').reduce((acc, u) => acc + Number(u.points || 0), 0) + getTeamAdjustmentPoints('purple'), members: safeUsers.filter(u => u.team === 'purple').length, rank: 2 },
    { team: 'green', points: safeUsers.filter(u => u.team === 'green').reduce((acc, u) => acc + Number(u.points || 0), 0) + getTeamAdjustmentPoints('green'), members: safeUsers.filter(u => u.team === 'green').length, rank: 3 },
    { team: 'red', points: safeUsers.filter(u => u.team === 'red').reduce((acc, u) => acc + Number(u.points || 0), 0) + getTeamAdjustmentPoints('red'), members: safeUsers.filter(u => u.team === 'red').length, rank: 4 },
  ].sort((a, b) => hideScores ? a.team.localeCompare(b.team) : b.points - a.points).map((s, i) => ({ ...s, rank: i + 1 }));

  const previousEvents = events.filter((e: any) => !e.is_active);

  if (loading || loadingEvent) {
    return (
      <div className="p-8 text-center min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className={cn("animate-spin", theme.text)} size={32} />
        <span className="text-sm opacity-50 font-medium tracking-wide">Loading standings and settings...</span>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-6 md:gap-8">
      {/* Submenu Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b dark:border-white/10 border-black/10 pb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Trophy className={theme.text} size={28} />
            Leaderboards
          </h1>
          <p className="text-xs opacity-60 mt-1">View team standings and top user rankings.</p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-900/90 p-1.5 rounded-2xl border dark:border-white/10 border-black/10 shrink-0 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('current')}
            className={cn(
              "flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2",
              activeTab === 'current'
                ? cn("bg-white dark:bg-[#181818] shadow-md dark:shadow-none dark:text-white text-slate-900", theme.border)
                : "text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Trophy size={14} className={activeTab === 'current' ? theme.text : ''} />
            Current Event
            {activeEvent && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
          
          <button
            onClick={() => {
              setActiveTab('previous');
              if (previousEvents.length > 0 && !selectedPreviousEventId) {
                const firstPast = previousEvents[previousEvents.length - 1];
                setSelectedPreviousEventId(firstPast.id);
                fetchPreviousEventLeaderboard(firstPast.id);
              }
            }}
            className={cn(
              "flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2",
              activeTab === 'previous'
                ? cn("bg-white dark:bg-[#181818] shadow-md dark:shadow-none dark:text-white text-slate-900", theme.border)
                : "text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <History size={14} className={activeTab === 'previous' ? theme.text : ''} />
            Previous Events
            {previousEvents.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/20 text-sky-400 border border-sky-500/30">
                {previousEvents.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: CURRENT EVENT LEADERBOARD */}
      {activeTab === 'current' && (
        <div className="flex flex-col gap-8 md:gap-12">
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">Team Standings</h2>
                <p className="text-xs opacity-60">Real-time competition progress for active event.</p>
              </div>
              <div className="flex items-center gap-2">
                {activeEvent && isAdmin && (
                  <>
                    <button
                      onClick={() => handleResyncEventScores(activeEvent.id, activeEvent.title)}
                      disabled={resyncingEventId === activeEvent.id}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                      title="Re-sync current event scores from snapshot data & verified submissions"
                    >
                      <RotateCw size={13} className={cn(resyncingEventId === activeEvent.id && "animate-spin")} />
                      <span>{resyncingEventId === activeEvent.id ? 'Re-syncing...' : 'Re-sync Scores'}</span>
                    </button>
                    <button
                      onClick={() => openForceScoresModal(activeEvent.id, activeEvent.title)}
                      className={cn("px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer", theme.secondary, theme.text, theme.border)}
                      title="Force & lock exact score numbers for this event"
                    >
                      <Sparkles size={13} />
                      <span>Force Scores Mode</span>
                    </button>
                  </>
                )}
                {activeEvent && (
                  <span className={cn("text-xs font-black px-3 py-1.5 rounded-full border", theme.bg + "/10", theme.border, theme.text)}>
                    {activeEvent.title}
                  </span>
                )}
              </div>
            </div>

            {resyncSuccessMsg && (
              <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-2.5 shadow-sm animate-in fade-in">
                <CheckCircle size={18} className="shrink-0" />
                <span>{resyncSuccessMsg}</span>
              </div>
            )}

            {hideScores && (
              <div className="mb-8 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 font-bold text-center text-sm tracking-wide shadow-sm animate-in fade-in">
                Leaderboard is hidden!
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {standings.map((s) => (
                <div 
                  key={s.team}
                  className={cn(
                    "p-5 md:p-6 rounded-2xl border dark:bg-[#111111] bg-white flex flex-col items-center justify-between gap-4 shadow-lg transition-all hover:scale-[1.01]",
                    TEAM_COLORS[s.team as Team].border
                  )}
                >
                  <div className="flex flex-col items-center gap-4 w-full">
                    <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center dark:bg-black/40 bg-slate-50 rounded-xl font-bold text-lg md:text-xl border border-black/5 dark:border-white/5 shrink-0">
                       {hideScores ? '—' : (s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : s.rank)}
                    </div>
                    <div className="text-center">
                      <h3 className={cn("text-lg md:text-xl font-bold capitalize truncate", TEAM_COLORS[s.team as Team].primary)}>
                        Team {s.team}
                      </h3>
                      <div className="flex items-center justify-center gap-2 opacity-50 dark:text-white text-slate-500 text-xs mt-1">
                        <Users size={14} />
                        <span>{s.members} members</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center w-full border-t dark:border-white/5 border-black/5 pt-4">
                    <span className="text-2xl md:text-3xl font-mono font-bold dark:text-white text-slate-800">
                      {hideScores ? '—' : s.points.toLocaleString()}
                    </span>
                    <span className="text-[9px] md:text-[10px] uppercase tracking-widest font-bold opacity-30 mt-1 dark:text-white text-slate-500">Total Points</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <Trophy className={theme.text} size={24} />
                  All Members
                </h2>
                <p className="text-xs opacity-60 mt-0.5">Search and filter community members by name, handle, or team.</p>
              </div>

              {/* Search & Team Filter Bar */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 sm:w-64 min-w-[200px]">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search player, tag, steamid..."
                    className={cn(
                      "w-full pl-9 pr-8 py-2 text-xs rounded-xl dark:bg-[#111111] bg-white border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 shadow-sm transition-all placeholder:opacity-40",
                      user?.team === 'blue' ? "focus:ring-sky-500/50" :
                      user?.team === 'green' ? "focus:ring-green-500/50" :
                      user?.team === 'red' ? "focus:ring-red-500/50" :
                      user?.team === 'purple' ? "focus:ring-purple-500/50" :
                      "focus:ring-slate-500/50"
                    )}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Team Selector Filter */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900/80 p-1 rounded-xl border border-black/5 dark:border-white/5 text-[11px] font-bold">
                  {['all', 'blue', 'purple', 'green', 'red'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTeamFilter(t)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg capitalize transition-all",
                        teamFilter === t
                          ? t === 'all'
                            ? "bg-white dark:bg-[#1e1e1e] shadow-sm text-slate-900 dark:text-white font-black"
                            : cn("shadow-sm font-black", TEAM_COLORS[t as Team]?.secondary, TEAM_COLORS[t as Team]?.primary, TEAM_COLORS[t as Team]?.border, "border")
                          : "opacity-50 hover:opacity-100"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Members Counter */}
            {!loading && (
              <div className="mb-4 flex items-center justify-between text-[11px] font-bold opacity-50 px-1">
                <span>Showing {filteredUsers.length} of {safeUsers.length} members</span>
                {(searchQuery || teamFilter !== 'all') && (
                  <button
                    onClick={() => { setSearchQuery(''); setTeamFilter('all'); }}
                    className={cn("hover:underline flex items-center gap-1 font-bold", theme.text)}
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loading ? (
                <div className="p-8 text-center opacity-30 col-span-2">Loading...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-12 text-center col-span-2 border-2 border-dashed dark:border-white/5 border-black/5 rounded-2xl flex flex-col items-center justify-center gap-2">
                  <Search size={32} className="opacity-20" />
                  <p className="text-sm font-bold opacity-60">No members match your search or filter</p>
                  <p className="text-xs opacity-40">Try searching with a different username, Steam ID, or team faction.</p>
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const hasScreenshotPoints = adjustments.some(adj => adj.user_id === u.steamid && adj.game_name === 'Screenshot Points');
                  const hasBingoPoints = adjustments.some(adj => adj.user_id === u.steamid && adj.game_name === 'Bingo Points');
                  return (
                    <div key={u.steamid} className="flex items-center gap-4 p-4 dark:bg-[#111111] bg-white rounded-2xl border border-black/5 dark:border-white/5 group hover:border-black/10 dark:hover:border-white/10 transition-all shadow-sm dark:shadow-none">
                      <div className="text-sm font-bold opacity-30 w-4 dark:text-white text-slate-500">
                        {hideScores ? '—' : u.originalRank}
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewProfile?.(u.steamid);
                        }}
                        title="View App Profile"
                        className={cn(
                          "w-12 h-12 rounded-full p-1 border-2 transition-transform hover:scale-110 active:scale-95 cursor-pointer outline-none focus:ring-2 shrink-0", 
                          `focus:${theme.ring}/50`,
                          u.team && u.team !== 'none' ? TEAM_COLORS[u.team as Team]?.border : 'border-white/10'
                        )}
                      >
                        <img src={u.steam_avatar} className="w-full h-full rounded-full object-cover" alt="" referrerPolicy="no-referrer" />
                      </button>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2 flex-wrap">
                           <a 
                            href={`https://steamcommunity.com/profiles/${u.steamid}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={cn("font-bold truncate transition-colors relative z-10 hover:underline inline-block max-w-full", `hover:${theme.text}`)}
                           >
                            {u.steam_name}
                           </a>
                           {(u.role === 'admin' || u.role === 'admins') && <Shield size={12} className={theme.text} />}
                           {u.discord_name && (
                            <span className={cn("text-[10px] font-bold opacity-80 shrink-0", theme.text)}>@{u.discord_name}</span>
                           )}
                           {u.team && u.team !== 'none' && (
                             <span className={cn(
                               "text-[8px] md:text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                               TEAM_COLORS[u.team as Team]?.secondary,
                               TEAM_COLORS[u.team as Team]?.primary,
                               TEAM_COLORS[u.team as Team]?.border
                             )}>
                               Team {u.team}
                             </span>
                           )}
                           {hasScreenshotPoints && (
                             <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                               screenshot points
                             </span>
                           )}
                           {hasBingoPoints && (
                             <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 shrink-0">
                               bingo points
                             </span>
                           )}
                        </div>
                        <p className="text-xs opacity-50 italic truncate">"{u.status || 'Chasing achievements...'}"</p>
                      </div>
                      <div className="text-right">
                        <div className={cn(
                          "font-mono font-bold",
                          theme.text
                        )}>
                          {hideScores ? '—' : (u.points || 0)}
                        </div>
                        <div className="text-[10px] uppercase opacity-30 font-bold">Points</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {adjustments.length > 0 && !hideScores && (
            <section className="mt-8 dark:bg-zinc-950/20 p-6 rounded-3xl border border-black/5 dark:border-white/5 bg-slate-50/50">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-3 dark:text-white text-slate-800">
                <Bell className="text-indigo-400" size={24} />
                Team Point Adjustments log
              </h2>
              <div className="grid grid-cols-1 gap-3">
                {adjustments.map((adj) => {
                  const meta = parseNotesMeta(adj.notes || '');
                  const isUserAdj = !adj.user_id.startsWith('team_pts_');
                  const targetUser = isUserAdj ? users.find(u => u.steamid === adj.user_id) : null;
                  const teamName = isUserAdj ? (targetUser?.team || 'none') : adj.user_id.replace('team_pts_', '');
                  const cleanReason = meta.userNotes || (isUserAdj ? 'No description provided.' : (adj.notes && !adj.notes.startsWith('__META_START__') ? adj.notes : 'Bonus points awarded by Admin'));
                  const isScreenshot = adj.game_name === 'Screenshot Points' || adj.platform === 'Screenshot Points';
                  const isBingo = adj.game_name === 'Bingo Points' || adj.platform === 'Bingo Points';

                  return (
                    <div key={adj.id} className="p-4 rounded-xl dark:bg-[#111111] bg-white border border-black/5 dark:border-white/5 flex items-center justify-between gap-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "font-black tracking-widest text-[10px] uppercase px-2.5 py-1 rounded-lg border shrink-0",
                          TEAM_COLORS[teamName as Team]?.primary || "text-slate-500",
                          TEAM_COLORS[teamName as Team]?.border || "border-slate-500/10",
                          TEAM_COLORS[teamName as Team]?.secondary || "bg-slate-500/5"
                        )}>
                          Team {teamName}
                        </span>
                        <div>
                          <p className="text-sm dark:text-white/80 text-slate-705">
                            {isUserAdj ? (
                              <>
                                Awarded to <span className="font-bold underline underline-offset-2">{adj.user_name}</span>: {cleanReason}
                              </>
                            ) : (
                              cleanReason
                            )}
                          </p>
                          {isUserAdj && (
                            <div className="mt-1 flex items-center gap-2">
                              {isScreenshot && (
                                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                                  screenshot points
                                </span>
                              )}
                              {isBingo && (
                                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 shrink-0">
                                  bingo points
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={cn(
                        "font-mono font-black text-sm shrink-0 px-3 py-1 rounded-lg",
                        adj.points >= 0 ? "text-emerald-500 bg-emerald-500/5 border border-emerald-500/10" : "text-red-500 bg-red-500/5 border border-red-500/10"
                      )}>
                        {adj.points >= 0 ? `+${adj.points}` : adj.points} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 2: PREVIOUS EVENTS ARCHIVE */}
      {activeTab === 'previous' && (
        <div className="flex flex-col gap-6 md:gap-8">
          {previousEvents.length === 0 ? (
            <div className="p-12 text-center dark:bg-[#111111] bg-white rounded-3xl border border-dashed dark:border-white/10 border-black/10 flex flex-col items-center justify-center gap-3">
              <History size={40} className="opacity-30" />
              <h3 className="text-lg font-bold">No Previous Events Found</h3>
              <p className="text-xs opacity-50 max-w-md">
                Leaderboards and team standings from previous events will appear here once an event is completed.
              </p>
            </div>
          ) : (
            <>
              {/* Event selector tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-rounded border-b dark:border-white/5 border-black/5">
                {previousEvents.map((evt, idx) => {
                  const isSelected = selectedPreviousEventId === evt.id;
                  const evtNumber = evt.event_number || (idx + 1);
                  return (
                    <button
                      key={evt.id}
                      onClick={() => {
                        setSelectedPreviousEventId(evt.id);
                        fetchPreviousEventLeaderboard(evt.id);
                      }}
                      className={cn(
                        "px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 border flex items-center gap-2.5",
                        isSelected
                          ? "bg-slate-500/10 border-slate-500/30 text-slate-400 shadow-sm"
                          : "dark:bg-zinc-900/50 bg-slate-100 border-transparent dark:text-white/50 text-slate-600 hover:dark:text-white hover:text-slate-900"
                      )}
                    >
                      <Calendar size={13} />
                      <span>Event #{evtNumber}</span>
                      {evt.winner_team && (
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider",
                          TEAM_COLORS[evt.winner_team as Team]?.secondary || "bg-slate-500/20",
                          TEAM_COLORS[evt.winner_team as Team]?.primary || "text-slate-400"
                        )}>
                          🏆 {evt.winner_team}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Event Details & Standings */}
              {loadingPrevious ? (
                <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
                  <Loader2 className={cn("animate-spin", theme.text)} size={28} />
                  <span className="text-xs opacity-50 font-medium">Loading event leaderboard archive...</span>
                </div>
              ) : !previousEventData ? (
                <div className="p-8 text-center opacity-40 font-bold text-xs uppercase tracking-wider">
                  Select a previous event to view its leaderboard.
                </div>
              ) : (
                <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-200">
                  {/* Event Overview Banner */}
                  <div className="p-6 md:p-8 rounded-3xl dark:bg-[#111111] bg-white border border-black/5 dark:border-white/10 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Archived Event Standings
                        </span>
                        {previousEventData.event.winner_team && (
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1",
                            TEAM_COLORS[previousEventData.event.winner_team as Team]?.secondary,
                            TEAM_COLORS[previousEventData.event.winner_team as Team]?.primary,
                            TEAM_COLORS[previousEventData.event.winner_team as Team]?.border
                          )}>
                            <Award size={12} />
                            Winner: Team {previousEventData.event.winner_team}
                          </span>
                        )}
                      </div>
                      <h2 className="text-2xl md:text-3xl font-black">{previousEventData.event.title}</h2>
                      <p className="text-xs opacity-50 mt-1">
                        Total Participants: <span className="font-bold dark:text-white text-slate-900">{previousEventData.totalParticipants} users</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {isAdmin && previousEventData?.event && (
                        <>
                          <button
                            onClick={() => handleResyncEventScores(previousEventData.event.id, previousEventData.event.title)}
                            disabled={resyncingEventId === previousEventData.event.id}
                            className="px-4 py-2.5 rounded-2xl text-xs font-black bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer shadow-sm active:scale-95 shrink-0"
                            title="Re-sync and recalculate event scores from verified submissions and snapshots"
                          >
                            <RotateCw size={14} className={cn(resyncingEventId === previousEventData.event.id && "animate-spin")} />
                            <span>{resyncingEventId === previousEventData.event.id ? 'Re-syncing Scores...' : 'Re-sync Event Scores'}</span>
                          </button>
                          <button
                            onClick={() => openForceScoresModal(previousEventData.event.id, previousEventData.event.title)}
                            className={cn("px-4 py-2.5 rounded-2xl text-xs font-black border flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0", theme.secondary, theme.text, theme.border)}
                            title="Force exact score numbers for this event (Useful for Event #4)"
                          >
                            <Sparkles size={14} />
                            <span>Force Scores Mode</span>
                          </button>
                        </>
                      )}

                      {previousEventData.event.winner_team && (
                        <div className={cn(
                          "p-4 rounded-2xl border flex items-center gap-3 shrink-0",
                          TEAM_COLORS[previousEventData.event.winner_team as Team]?.secondary || "bg-slate-500/10",
                          TEAM_COLORS[previousEventData.event.winner_team as Team]?.border || "border-slate-500/20"
                        )}>
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0",
                            TEAM_COLORS[previousEventData.event.winner_team as Team]?.secondary || "bg-slate-500/20"
                          )}>
                            🏆
                          </div>
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-wider opacity-60">Event Champion</div>
                            <div className={cn("text-base font-black capitalize", TEAM_COLORS[previousEventData.event.winner_team as Team]?.primary)}>
                              Team {previousEventData.event.winner_team}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Team Standings Section */}
                  <section>
                    <div className="mb-6">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <Users className={theme.text} size={22} />
                        Team Points (Previous Event)
                      </h3>
                      <p className="text-xs opacity-60 mt-0.5">Total points earned by each team during this event.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                      {previousEventData.standings.map((s: any) => {
                        const isWinner = previousEventData.event.winner_team === s.team;
                        const winnerBg = s.team === 'blue' ? 'bg-sky-500' : s.team === 'green' ? 'bg-green-500' : s.team === 'red' ? 'bg-red-500' : 'bg-purple-500';
                        const winnerRing = s.team === 'blue' ? 'ring-2 ring-sky-500/50 shadow-sky-500/10' : s.team === 'green' ? 'ring-2 ring-green-500/50 shadow-green-500/10' : s.team === 'red' ? 'ring-2 ring-red-500/50 shadow-red-500/10' : 'ring-2 ring-purple-500/50 shadow-purple-500/10';
                        return (
                          <div 
                            key={s.team}
                            className={cn(
                              "p-5 md:p-6 rounded-2xl border dark:bg-[#111111] bg-white flex flex-col items-center justify-between gap-4 shadow-md transition-all relative overflow-hidden",
                              TEAM_COLORS[s.team as Team]?.border || "border-black/5 dark:border-white/5",
                              isWinner && winnerRing
                            )}
                          >
                            {isWinner && (
                              <div className={cn("absolute top-0 right-0 text-black text-[9px] font-black uppercase px-2.5 py-0.5 rounded-bl-xl tracking-wider", winnerBg)}>
                                Winner
                              </div>
                            )}

                            <div className="flex flex-col items-center gap-3 w-full">
                              <div className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center dark:bg-black/40 bg-slate-50 rounded-xl font-bold text-lg md:text-xl border border-black/5 dark:border-white/5 shrink-0">
                                {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : s.rank}
                              </div>
                              <div className="text-center">
                                <h4 className={cn("text-lg md:text-xl font-bold capitalize truncate", TEAM_COLORS[s.team as Team]?.primary)}>
                                  Team {s.team}
                                </h4>
                                <div className="flex items-center justify-center gap-1.5 opacity-50 text-xs mt-0.5">
                                  <Users size={12} />
                                  <span>{s.members} members</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-center w-full border-t dark:border-white/5 border-black/5 pt-4">
                              <span className="text-2xl md:text-3xl font-mono font-black dark:text-white text-slate-800">
                                {s.points.toLocaleString()}
                              </span>
                              <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 mt-1 dark:text-white text-slate-500">
                                Total Points
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* All Event Users Section */}
                  <section>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                      <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                          <Trophy className={theme.text} size={22} />
                          Event User Standings
                        </h3>
                        <p className="text-xs opacity-60 mt-0.5">Individual member standings in this archived event.</p>
                      </div>

                      {/* Search & Team Filter Bar */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative flex-1 sm:w-64 min-w-[200px]">
                          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
                          <input
                            type="text"
                            value={prevSearchQuery}
                            onChange={(e) => setPrevSearchQuery(e.target.value)}
                            placeholder="Search archived player..."
                            className={cn(
                              "w-full pl-9 pr-8 py-2 text-xs rounded-xl dark:bg-[#111111] bg-white border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 shadow-sm transition-all placeholder:opacity-40",
                              user?.team === 'blue' ? "focus:ring-sky-500/50" :
                              user?.team === 'green' ? "focus:ring-green-500/50" :
                              user?.team === 'red' ? "focus:ring-red-500/50" :
                              user?.team === 'purple' ? "focus:ring-purple-500/50" :
                              "focus:ring-slate-500/50"
                            )}
                          />
                          {prevSearchQuery && (
                            <button
                              onClick={() => setPrevSearchQuery('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity p-0.5"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        {/* Team Selector Filter */}
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900/80 p-1 rounded-xl border border-black/5 dark:border-white/5 text-[11px] font-bold">
                          {['all', 'blue', 'purple', 'green', 'red'].map((t) => (
                            <button
                              key={t}
                              onClick={() => setPrevTeamFilter(t)}
                              className={cn(
                                "px-2.5 py-1 rounded-lg capitalize transition-all",
                                prevTeamFilter === t
                                  ? t === 'all'
                                    ? "bg-white dark:bg-[#1e1e1e] shadow-sm text-slate-900 dark:text-white font-black"
                                    : cn("shadow-sm font-black", TEAM_COLORS[t as Team]?.secondary, TEAM_COLORS[t as Team]?.primary, TEAM_COLORS[t as Team]?.border, "border")
                                  : "opacity-50 hover:opacity-100"
                              )}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Members Counter */}
                    {previousEventData.topUsers.length > 0 && (
                      <div className="mb-4 flex items-center justify-between text-[11px] font-bold opacity-50 px-1">
                        <span>Showing {filteredPreviousUsers.length} of {previousEventData.topUsers.length} members</span>
                        {(prevSearchQuery || prevTeamFilter !== 'all') && (
                          <button
                            onClick={() => { setPrevSearchQuery(''); setPrevTeamFilter('all'); }}
                            className={cn("hover:underline flex items-center gap-1 font-bold", theme.text)}
                          >
                            Reset Filters
                          </button>
                        )}
                      </div>
                    )}

                    {previousEventData.topUsers.length === 0 ? (
                      <div className="p-12 text-center rounded-2xl border border-dashed border-black/10 dark:border-white/10 opacity-40 italic font-bold">
                        No user points logged for this event.
                      </div>
                    ) : filteredPreviousUsers.length === 0 ? (
                      <div className="p-12 text-center border-2 border-dashed dark:border-white/5 border-black/5 rounded-2xl flex flex-col items-center justify-center gap-2">
                        <Search size={32} className="opacity-20" />
                        <p className="text-sm font-bold opacity-60">No archived members match your filter</p>
                        <p className="text-xs opacity-40">Try searching with a different name or team.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredPreviousUsers.map((u: any) => {
                          const isTop3 = u.rank <= 3;
                          return (
                            <div 
                              key={u.steamid} 
                              className={cn(
                                "flex items-center gap-4 p-4 dark:bg-[#111111] bg-white rounded-2xl border transition-all shadow-sm",
                                isTop3 
                                  ? cn(theme.border, theme.secondary) 
                                  : "border-black/5 dark:border-white/5 hover:border-black/10 dark:hover:border-white/10"
                              )}
                            >
                              {/* Rank badge */}
                              <div className="w-6 flex items-center justify-center shrink-0">
                                {u.rank === 1 ? (
                                  <span className="text-lg">🥇</span>
                                ) : u.rank === 2 ? (
                                  <span className="text-lg">🥈</span>
                                ) : u.rank === 3 ? (
                                  <span className="text-lg">🥉</span>
                                ) : (
                                  <span className="text-xs font-black opacity-40">{u.rank}</span>
                                )}
                              </div>

                              {/* Avatar */}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewProfile?.(u.steamid);
                                }}
                                title="View App Profile"
                                className={cn(
                                  "w-12 h-12 rounded-full p-0.5 border-2 transition-transform hover:scale-110 active:scale-95 cursor-pointer outline-none focus:ring-2 shrink-0", 
                                  `focus:${theme.ring}/50`,
                                  u.team && u.team !== 'none' ? TEAM_COLORS[u.team as Team]?.border || 'border-white/10' : 'border-white/10'
                                )}
                              >
                                <img src={u.steam_avatar} className="w-full h-full rounded-full object-cover" alt="" referrerPolicy="no-referrer" />
                              </button>

                              {/* Info */}
                              <div className="flex-1 overflow-hidden">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <a 
                                    href={`https://steamcommunity.com/profiles/${u.steamid}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className={cn("font-bold truncate transition-colors relative z-10 hover:underline inline-block max-w-full text-sm", `hover:${theme.text}`)}
                                  >
                                    {u.steam_name}
                                  </a>
                                  {(u.role === 'admin' || u.role === 'admins') && <Shield size={12} className={theme.text} />}
                                  {u.discord_name && (
                                    <span className={cn("text-[10px] font-bold opacity-80 shrink-0", theme.text)}>@{u.discord_name}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {u.team && u.team !== 'none' && (
                                    <span className={cn(
                                      "text-[9px] font-black uppercase px-2 py-0.5 rounded border tracking-wider",
                                      TEAM_COLORS[u.team as Team]?.secondary,
                                      TEAM_COLORS[u.team as Team]?.primary,
                                      TEAM_COLORS[u.team as Team]?.border
                                    )}>
                                      Team {u.team}
                                    </span>
                                  )}
                                  {u.status && (
                                    <p className="text-[11px] opacity-40 italic truncate max-w-[150px]">"{u.status}"</p>
                                  )}
                                </div>
                              </div>

                              {/* Points */}
                              <div className="text-right shrink-0">
                                <div className={cn(
                                  "font-mono font-black text-base",
                                  theme.text
                                )}>
                                  {u.points.toLocaleString()}
                                </div>
                                <div className="text-[9px] uppercase opacity-40 font-bold">Event Pts</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Point Adjustments Log if available for this event */}
                  {previousEventData.adjustments && previousEventData.adjustments.length > 0 && (
                    <section className="dark:bg-zinc-950/20 p-6 rounded-3xl border border-black/5 dark:border-white/5 bg-slate-50/50">
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Bell className="text-indigo-400" size={20} />
                        Event Adjustments Log
                      </h3>
                      <div className="grid grid-cols-1 gap-2.5">
                        {previousEventData.adjustments.map((adj: any) => {
                          const meta = parseNotesMeta(adj.notes || '');
                          const teamName = adj.user_id?.startsWith('team_pts_') ? adj.user_id.replace('team_pts_', '') : 'none';
                          const cleanReason = meta.userNotes || (adj.notes && !adj.notes.startsWith('__META_START__') ? adj.notes : 'Bonus points awarded');
                          return (
                            <div key={adj.id} className="p-3.5 rounded-xl dark:bg-[#111111] bg-white border border-black/5 dark:border-white/5 flex items-center justify-between gap-4 text-xs">
                              <div className="flex items-center gap-2.5">
                                <span className={cn(
                                  "font-black text-[9px] uppercase px-2 py-0.5 rounded border shrink-0",
                                  TEAM_COLORS[teamName as Team]?.primary || "text-slate-500",
                                  TEAM_COLORS[teamName as Team]?.border || "border-slate-500/10",
                                  TEAM_COLORS[teamName as Team]?.secondary || "bg-slate-500/5"
                                )}>
                                  Team {teamName}
                                </span>
                                <span className="opacity-80">{cleanReason}</span>
                              </div>
                              <span className="font-mono font-bold text-emerald-500">
                                {adj.points >= 0 ? `+${adj.points}` : adj.points} pts
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Admin Notification Popup */}
      {adminPopupMsg && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#141414] border border-slate-500/30 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-center flex flex-col items-center gap-4 animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-2xl bg-slate-500/20 border border-slate-500/30 flex items-center justify-center text-slate-400 text-2xl">
              <Shield size={28} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">{adminPopupMsg.title}</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">{adminPopupMsg.message}</p>
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-3 bg-emerald-500/10 py-1 px-3 rounded-full border border-emerald-500/20 inline-block">
                ✓ 0 User Notifications Sent
              </p>
            </div>
            <button
              onClick={() => setAdminPopupMsg(null)}
              className="w-full py-3 rounded-2xl bg-slate-500 hover:bg-slate-400 text-white font-black text-xs uppercase tracking-wider transition-all cursor-pointer mt-2 shadow-lg"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {/* Force Scores Modal */}
      {forceScoresModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#121212] border border-slate-500/30 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-slate-500/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-500/20 border border-slate-500/30 flex items-center justify-center text-slate-400">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Force Scores Mode (Admin)</h3>
                  <p className="text-xs text-slate-300/80">
                    {forceModalEventTitle ? `Target: ${forceModalEventTitle}` : 'Override Scores'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setForceScoresModalOpen(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="p-4 rounded-2xl bg-slate-500/10 border border-slate-500/20 text-slate-300 text-xs leading-relaxed">
                <strong>Admin Override:</strong> Manually force exact team totals or member scores into event metadata. This allows locked scores for events where submissions were removed (e.g. Event #4). No user notifications will be generated.
              </div>

              {/* Team Totals Override */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Team Totals Override</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['blue', 'purple', 'green', 'red'] as const).map(team => (
                    <div key={team} className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                      <span className={cn("text-[10px] font-black uppercase tracking-wider block", TEAM_COLORS[team]?.primary)}>
                        {team} Team
                      </span>
                      <input
                        type="number"
                        value={forceTeamTotals[team] ?? 0}
                        onChange={(e) => setForceTeamTotals(prev => ({ ...prev, [team]: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 font-mono text-sm font-bold text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Member Scores Override */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Member Score Overrides</h4>
                  <input
                    type="text"
                    placeholder="Filter member..."
                    value={forceMemberSearch}
                    onChange={(e) => setForceMemberSearch(e.target.value)}
                    className="px-3 py-1 text-xs bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-slate-500 w-44"
                  />
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {forceMemberDetails
                    .filter(m => (m.steam_name || m.discord_name || m.steamid || '').toLowerCase().includes(forceMemberSearch.toLowerCase()))
                    .map(m => (
                      <div key={m.steamid} className="p-3 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img src={m.steam_avatar || m.active_avatar || 'https://avatars.githubusercontent.com/u/0'} className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" referrerPolicy="no-referrer" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{m.steam_name || m.discord_name || 'Member'}</p>
                            <p className="text-[10px] text-white/40 font-mono">Team: {m.team || 'none'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] uppercase text-white/40 font-bold">Pts:</span>
                          <input
                            type="number"
                            value={forceUserScores[m.steamid] ?? 0}
                            onChange={(e) => setForceUserScores(prev => ({ ...prev, [m.steamid]: parseInt(e.target.value) || 0 }))}
                            className="w-24 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1 font-mono text-xs font-bold text-slate-400 focus:outline-none focus:border-slate-500 text-right"
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-black/40 flex items-center justify-end gap-3">
              <button
                onClick={() => setForceScoresModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveForcedScores}
                disabled={isSavingForcedScores}
                className="px-5 py-2.5 rounded-xl bg-slate-500 hover:bg-slate-400 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isSavingForcedScores ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                <span>Apply & Lock Forced Scores</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
