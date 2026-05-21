import React from 'react';
import { Trophy, Medal, Users, Shield, Bell } from 'lucide-react';
import { Team, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function Leaderboard({ onViewProfile }: { onViewProfile?: (id: string) => void }) {
  const { theme } = useAuth();
  const [users, setUsers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeEvent, setActiveEvent] = React.useState<any | null>(null);
  const [adjustments, setAdjustments] = React.useState<any[]>([]);

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

  React.useEffect(() => {
    fetchUsers();
    fetchAdjustments();

    // Fetch active event settings
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        const active = Array.isArray(data) ? data.find((e: any) => e.is_active) : null;
        setActiveEvent(active);
      })
      .catch(err => {
        console.error('Failed to fetch events for leaderboard active check:', err);
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
  }, [fetchUsers, fetchAdjustments]);

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
    { team: 'blue', points: hideScores ? 0 : safeUsers.filter(u => u.team === 'blue').reduce((acc, u) => acc + Number(u.points || 0), 0) + getTeamAdjustmentPoints('blue'), members: safeUsers.filter(u => u.team === 'blue').length, rank: 1 },
    { team: 'purple', points: hideScores ? 0 : safeUsers.filter(u => u.team === 'purple').reduce((acc, u) => acc + Number(u.points || 0), 0) + getTeamAdjustmentPoints('purple'), members: safeUsers.filter(u => u.team === 'purple').length, rank: 2 },
    { team: 'green', points: hideScores ? 0 : safeUsers.filter(u => u.team === 'green').reduce((acc, u) => acc + Number(u.points || 0), 0) + getTeamAdjustmentPoints('green'), members: safeUsers.filter(u => u.team === 'green').length, rank: 3 },
    { team: 'red', points: hideScores ? 0 : safeUsers.filter(u => u.team === 'red').reduce((acc, u) => acc + Number(u.points || 0), 0) + getTeamAdjustmentPoints('red'), members: safeUsers.filter(u => u.team === 'red').length, rank: 4 },
  ].sort((a, b) => hideScores ? a.team.localeCompare(b.team) : b.points - a.points).map((s, i) => ({ ...s, rank: i + 1 }));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-8 md:gap-12">
      <section>
        <h1 className="text-2xl font-bold mb-2">Team Standings</h1>
        <p className="opacity-60 mb-8">Real-time competition progress.</p>

        {hideScores && (
          <div className="mb-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-500 font-bold text-center text-sm tracking-wide animate-pulse">
            leaderboard is hidden right now!
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
                            screenshot points awarded
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
  );
}
