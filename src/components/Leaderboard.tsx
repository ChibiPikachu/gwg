import React from 'react';
import { Trophy, Medal, Users, Shield } from 'lucide-react';
import { Team, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function Leaderboard({ onViewProfile }: { onViewProfile?: (id: string) => void }) {
  const { theme } = useAuth();
  const [users, setUsers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

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

  React.useEffect(() => {
    fetchUsers();

    if (!isSupabaseConfigured) return;

    // Subscribe to real-time updates for profiles
    const channel = supabase
      .channel('leaderboard-profiles')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'profiles' 
      }, () => {
        // Simple approach: Refetch when any profile changes
        // More efficient would be updating local state, but this ensures consistency with API filters
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUsers]);

  const safeUsers = Array.isArray(users) 
    ? [...users].sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0)) 
    : [];

  const standings = [
    { team: 'blue', points: safeUsers.filter(u => u.team === 'blue').reduce((acc, u) => acc + (u.points || 0), 0), members: safeUsers.filter(u => u.team === 'blue').length, rank: 1 },
    { team: 'purple', points: safeUsers.filter(u => u.team === 'purple').reduce((acc, u) => acc + (u.points || 0), 0), members: safeUsers.filter(u => u.team === 'purple').length, rank: 2 },
    { team: 'green', points: safeUsers.filter(u => u.team === 'green').reduce((acc, u) => acc + (u.points || 0), 0), members: safeUsers.filter(u => u.team === 'green').length, rank: 3 },
    { team: 'red', points: safeUsers.filter(u => u.team === 'red').reduce((acc, u) => acc + (u.points || 0), 0), members: safeUsers.filter(u => u.team === 'red').length, rank: 4 },
  ].sort((a, b) => b.points - a.points).map((s, i) => ({ ...s, rank: i + 1 }));

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-12">
      <section>
        <h1 className="text-2xl font-bold mb-2">Team Standings</h1>
        <p className="opacity-60 mb-8">Real-time competition progress.</p>

        <div className="grid gap-6">
          {standings.map((s) => (
            <div 
              key={s.team}
              className={cn(
                "p-6 rounded-2xl border bg-[#111111] flex items-center justify-between shadow-lg transition-all hover:scale-[1.01]",
                TEAM_COLORS[s.team as Team].border
              )}
            >
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 flex items-center justify-center bg-black/40 rounded-xl font-bold text-xl border border-white/5">
                   {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : s.rank}
                </div>
                <div>
                  <h3 className={cn("text-xl font-bold capitalize", TEAM_COLORS[s.team as Team].primary)}>
                    Team {s.team}
                  </h3>
                  <div className="flex items-center gap-2 opacity-50 text-sm mt-1">
                    <Users size={14} />
                    <span>{s.members} members</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-3xl font-mono font-bold">{s.points.toLocaleString()}</span>
                <span className="text-[10px] uppercase tracking-widest font-bold opacity-30 mt-1">Total Points</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <section>
          <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
            <Trophy className="text-amber-400" size={24} />
            All Members
          </h2>
          <div className="space-y-4">
            {loading ? (
              <div className="p-8 text-center opacity-30">Loading...</div>
            ) : (
              safeUsers.map((u, i) => (
                <div key={u.steamid} className="flex items-center gap-4 p-4 bg-[#111111] rounded-2xl border border-white/5 group hover:border-white/10 transition-all">
                  <div className="text-sm font-bold opacity-30 w-4">{i + 1}</div>
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
                    <div className="flex items-center gap-2">
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
                    </div>
                    <p className="text-xs opacity-50 italic truncate">"{u.status || 'Chasing achievements...'}"</p>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-amber-400">{u.points || 0}</div>
                    <div className="text-[10px] uppercase opacity-30 font-bold">Points</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
            <Medal className="text-purple-400" size={24} />
            Recent Activity
          </h2>
          <div className="space-y-4">
             {[1, 2, 3, 4, 5].map(i => (
               <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5 opacity-60">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", theme.secondary)}>
                    <Trophy size={14} className={theme.text} />
                  </div>
                  <div className="flex-1">
                     <p className="text-xs">
                       <span className="font-bold text-blue-400">Someone</span> earned <span className="font-bold">10 pts</span>
                     </p>
                  </div>
                  <span className="text-[10px] opacity-40">2m ago</span>
               </div>
             ))}
             <p className="text-center text-xs opacity-30 py-4 italic">Activity feed coming soon...</p>
          </div>
        </section>
      </div>
    </div>
  );
}
