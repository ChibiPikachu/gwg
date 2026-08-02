import React from 'react';
import { Trophy, Medal, Users, Shield, Bell, Loader2, History, Calendar, Award, Sparkles, Star, ChevronRight } from 'lucide-react';
import { Team, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function Leaderboard({ onViewProfile }: { onViewProfile?: (id: string) => void }) {
  const { theme } = useAuth();
  
  // Tabs: 'current' | 'previous'
  const [activeTab, setActiveTab] = React.useState<'current' | 'previous'>('current');
  
  // Current Event state
  const [users, setUsers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingEvent, setLoadingEvent] = React.useState(true);
  const [activeEvent, setActiveEvent] = React.useState<any | null>(null);
  const [adjustments, setAdjustments] = React.useState<any[]>([]);

  // Previous Events state
  const [events, setEvents] = React.useState<any[]>([]);
  const [selectedPreviousEventId, setSelectedPreviousEventId] = React.useState<string | null>(null);
  const [previousEventData, setPreviousEventData] = React.useState<any | null>(null);
  const [loadingPrevious, setLoadingPrevious] = React.useState(false);

  const fetchUsers = React.useCallback(() => {
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

  const fetchAdjustments = React.useCallback(() => {
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
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        const allEvts = Array.isArray(data) ? data : [];
        setEvents(allEvts);
        
        const active = allEvts.find((e: any) => e.is_active);
        setActiveEvent(active);

        // Auto select the latest previous event if available
        const pastEvts = allEvts.filter((e: any) => !e.is_active);
        if (pastEvts.length > 0) {
          const lastPast = pastEvts[pastEvts.length - 1];
          setSelectedPreviousEventId(lastPast.id);
          fetchPreviousEventLeaderboard(lastPast.id);
        }

        setLoadingEvent(false);
      })
      .catch(err => {
        console.error('Failed to fetch events for leaderboard:', err);
        setLoadingEvent(false);
      });

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
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-500 border border-amber-500/30">
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
              {activeEvent && (
                <span className={cn("text-xs font-black px-3 py-1 rounded-full border", theme.bg + "/10", theme.border, theme.text)}>
                  {activeEvent.title}
                </span>
              )}
            </div>

            {hideScores && (
              <div className="mb-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-500 font-bold text-center text-sm tracking-wide animate-pulse">
                Leaderboard is hidden right now!
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
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
              <Trophy className="text-amber-400" size={24} />
              All Members
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loading ? (
                <div className="p-8 text-center opacity-30 col-span-2">Loading...</div>
              ) : (
                safeUsers.map((u, i) => {
                  const hasScreenshotPoints = adjustments.some(adj => adj.user_id === u.steamid && adj.game_name === 'Screenshot Points');
                  const hasBingoPoints = adjustments.some(adj => adj.user_id === u.steamid && adj.game_name === 'Bingo Points');
                  return (
                    <div key={u.steamid} className="flex items-center gap-4 p-4 dark:bg-[#111111] bg-white rounded-2xl border border-black/5 dark:border-white/5 group hover:border-black/10 dark:hover:border-white/10 transition-all shadow-sm dark:shadow-none">
                      <div className="text-sm font-bold opacity-30 w-4 dark:text-white text-slate-500">
                        {hideScores ? '—' : i + 1}
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
                          u.team && u.team !== 'none' ? TEAM_COLORS[u.team as Team].border : 'border-white/10'
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
                            <span className="text-[10px] text-purple-400 font-bold opacity-80 shrink-0">@{u.discord_name}</span>
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
                        <div className="font-mono font-bold text-amber-400">
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
                  const isUserAdj = !adj.user_id.startsWith('team_pts_');
                  const targetUser = isUserAdj ? users.find(u => u.steamid === adj.user_id) : null;
                  const teamName = isUserAdj ? (targetUser?.team || 'none') : adj.user_id.replace('team_pts_', '');
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
                                Awarded to <span className="font-bold underline underline-offset-2">{adj.user_name}</span>: {adj.notes}
                              </>
                            ) : (
                              adj.notes || "Bonus points awarded by Admin"
                            )}
                          </p>
                          {isUserAdj && (
                            <div className="mt-1">
                              <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                                screenshot points
                              </span>
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
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-500 shadow-sm"
                          : "dark:bg-zinc-900/50 bg-slate-100 border-transparent dark:text-white/50 text-slate-600 hover:dark:text-white hover:text-slate-900"
                      )}
                    >
                      <Calendar size={13} />
                      <span>Event #{evtNumber}: {evt.title}</span>
                      {evt.winner_team && (
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider",
                          TEAM_COLORS[evt.winner_team as Team]?.secondary || "bg-amber-500/20",
                          TEAM_COLORS[evt.winner_team as Team]?.primary || "text-amber-400"
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
                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
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

                    {previousEventData.event.winner_team && (
                      <div className={cn(
                        "p-4 rounded-2xl border flex items-center gap-3 shrink-0",
                        TEAM_COLORS[previousEventData.event.winner_team as Team]?.secondary || "bg-amber-500/10",
                        TEAM_COLORS[previousEventData.event.winner_team as Team]?.border || "border-amber-500/20"
                      )}>
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl shrink-0">
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
                        return (
                          <div 
                            key={s.team}
                            className={cn(
                              "p-5 md:p-6 rounded-2xl border dark:bg-[#111111] bg-white flex flex-col items-center justify-between gap-4 shadow-md transition-all relative overflow-hidden",
                              TEAM_COLORS[s.team as Team]?.border || "border-black/5 dark:border-white/5",
                              isWinner && "ring-2 ring-amber-500/50 shadow-amber-500/10"
                            )}
                          >
                            {isWinner && (
                              <div className="absolute top-0 right-0 bg-amber-500 text-black text-[9px] font-black uppercase px-2.5 py-0.5 rounded-bl-xl tracking-wider">
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

                  {/* Top 16 Users Section */}
                  <section>
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                          <Trophy className="text-amber-400" size={22} />
                          Top 16 Users (Most Event Points)
                        </h3>
                        <p className="text-xs opacity-60 mt-0.5">Top performing individual members in this previous event.</p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        Top 16
                      </span>
                    </div>

                    {previousEventData.topUsers.length === 0 ? (
                      <div className="p-12 text-center rounded-2xl border border-dashed border-black/10 dark:border-white/10 opacity-40 italic font-bold">
                        No user points logged for this event.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {previousEventData.topUsers.map((u: any) => {
                          const isTop3 = u.rank <= 3;
                          return (
                            <div 
                              key={u.steamid} 
                              className={cn(
                                "flex items-center gap-4 p-4 dark:bg-[#111111] bg-white rounded-2xl border transition-all shadow-sm",
                                isTop3 
                                  ? "border-amber-500/30 dark:bg-amber-500/[0.02]" 
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
                                    <span className="text-[10px] text-purple-400 font-bold opacity-80 shrink-0">@{u.discord_name}</span>
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
                                <div className="font-mono font-black text-amber-400 text-base">
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
                          const teamName = adj.user_id?.startsWith('team_pts_') ? adj.user_id.replace('team_pts_', '') : 'none';
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
                                <span className="opacity-80">{adj.notes || 'Bonus points awarded'}</span>
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
    </div>
  );
}
