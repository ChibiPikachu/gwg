import React from 'react';
import { Users, Shield, Search, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Team, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function MyTeam({ onViewProfile }: { onViewProfile?: (id: string) => void }) {
  const { user, theme } = useAuth();
  const [members, setMembers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');

  const fetchTeammates = React.useCallback(async () => {
    if (isSupabaseConfigured && supabase && user?.team && user.team !== 'none') {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('steamid, steam_name, steam_avatar, discord_id, discord_name, discord_avatar, active_avatar, team, status, points, role')
          .eq('team', user.team);

        if (!error && data) {
          const transformed = data.map((u: any) => ({
            ...u,
            steam_avatar: (u.active_avatar === 'discord' && u.discord_avatar) ? u.discord_avatar : (u.steam_avatar || u.discord_avatar || ''),
            points: u.points || 0
          })).sort((a: any, b: any) => b.points - a.points);

          setMembers(transformed);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Direct Supabase fetch for team members failed:', err);
      }
    }

    fetch('/api/leaderboard/users')
      .then(res => res.json())
      .then(data => {
        const safeData = Array.isArray(data) ? data : [];
        if (user?.team && user.team !== 'none') {
          setMembers(safeData.filter(u => u.team === user.team));
        } else {
          setMembers([]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch team members:', err);
        setLoading(false);
      });
  }, [user?.team]);

  React.useEffect(() => {
    fetchTeammates();

    if (!isSupabaseConfigured) return;

    // Subscribe to real-time updates for profiles
    const channel = supabase
      .channel('teammates-profiles')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'profiles' 
      }, () => {
        fetchTeammates();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTeammates]);

  const filteredMembers = React.useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase().trim();
    return members.filter(m => {
      const nameStr = (m.steam_name || '').toLowerCase();
      const discordStr = (m.discord_name || '').toLowerCase();
      const statusStr = (m.status || '').toLowerCase();
      const idStr = String(m.steamid || '').toLowerCase();
      return nameStr.includes(q) || discordStr.includes(q) || statusStr.includes(q) || idStr.includes(q);
    });
  }, [members, searchQuery]);

  if (!user || user.team === 'none') {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center gap-6">
        <div className="w-24 h-24 dark:bg-white/5 bg-slate-100 rounded-full flex items-center justify-center dark:text-white/20 text-slate-300">
          <Users size={48} />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2 dark:text-white text-slate-900">No Team Assigned</h2>
          <p className="opacity-50 max-w-md mx-auto dark:text-white text-slate-600">
            You haven't been assigned to a team yet. Please wait for an admin to assign you to a faction before you can see your teammates.
          </p>
        </div>
      </div>
    );
  }

  const colors = TEAM_COLORS[user.team];

  return (
    <div className="p-8 max-w-5xl mx-auto flex flex-col gap-12">
      <section className="relative overflow-hidden rounded-3xl p-12 dark:bg-[#111111] bg-white border border-black/5 dark:border-white/5 group shadow-xl">
        <div className={cn("absolute inset-0 opacity-5", colors.secondary)}></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
           <div className={cn("w-24 h-24 rounded-2xl flex items-center justify-center text-4xl shadow-2xl", colors.secondary)}>
              {user.team === 'blue' ? '💙' : user.team === 'red' ? '❤️' : user.team === 'green' ? '💚' : '💜'}
           </div>
           <div className="text-center md:text-left">
              <h1 className={cn("text-5xl font-black uppercase tracking-tighter", colors.primary)}>
                Team {user.team}
              </h1>
              <p className="opacity-60 text-lg mt-2 dark:text-white text-slate-600">Game like there's no tomorrow!</p>
           </div>
           <div className="md:ml-auto flex flex-col items-center md:items-end">
              <span className="text-5xl font-mono font-bold dark:text-white text-slate-800">{members.reduce((acc, m) => acc + (Number(m.points) || 0), 0)}</span>
              <span className="text-[10px] uppercase font-bold opacity-30 tracking-widest mt-1 dark:text-white text-slate-500">Team Total Points</span>
           </div>
        </div>
      </section>

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
           <div>
             <h2 className="text-xl font-bold flex items-center gap-3 dark:text-white text-slate-900">
                <Users size={24} className={colors.primary} />
                Your Teammates ({members.length})
             </h2>
             <p className="text-xs opacity-60 mt-0.5 dark:text-white text-slate-600">Find and connect with members of Team {user.team}.</p>
           </div>

           {/* Teammate Search Input */}
           <div className="relative w-full sm:w-64">
             <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
             <input
               type="text"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               placeholder="Search teammate name, handle..."
               className={cn(
                 "w-full pl-9 pr-8 py-2 text-xs rounded-xl dark:bg-[#111111] bg-white border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 shadow-sm transition-all placeholder:opacity-40",
                 user?.team === 'blue' ? "focus:ring-sky-500/50" :
                 user?.team === 'green' ? "focus:ring-green-500/50" :
                 user?.team === 'red' ? "focus:ring-red-500/50" : "focus:ring-purple-500/50"
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
             Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-24 dark:bg-white/5 bg-slate-100 rounded-2xl animate-pulse" />
             ))
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center col-span-3 border-2 border-dashed dark:border-white/5 border-black/5 rounded-2xl flex flex-col items-center justify-center gap-2">
              <Search size={32} className="opacity-20" />
              <p className="text-sm font-bold opacity-60">No teammates found</p>
              <p className="text-xs opacity-40">No team members match "{searchQuery}"</p>
            </div>
          ) : (
            filteredMembers.map((m) => (
              <div key={m.steamid} className="p-6 dark:bg-[#111111] bg-white rounded-2xl border border-black/5 dark:border-white/5 flex items-center gap-4 hover:border-black/10 dark:hover:border-white/10 transition-all group shadow-sm dark:shadow-none">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewProfile?.(m.steamid);
                  }}
                  title="View App Profile"
                  className={cn("w-14 h-14 rounded-full p-1 border-2 relative transition-transform hover:scale-110 active:scale-95 cursor-pointer outline-none focus:ring-2 shrink-0", `focus:${theme.ring}/50`, colors.border)}
                >
                  <img 
                    src={m.steam_avatar} 
                    className="w-full h-full rounded-full object-cover" 
                    alt={m.steam_name} 
                    referrerPolicy="no-referrer"
                  />
                  {m.role === 'admin' && (
                    <div className={cn("absolute -top-1 -right-1 rounded-full p-1 border-2 dark:border-[#111111] border-white", theme.bg)}>
                       <Shield size={10} className="text-white" />
                    </div>
                  )}
                </button>
                <div className="flex-1 overflow-hidden">
                  <a 
                    href={`https://steamcommunity.com/profiles/${m.steamid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={cn("font-bold truncate text-sm transition-colors block relative z-10 hover:underline dark:text-white text-slate-800", `hover:${theme.text}`)}
                  >
                    {m.steam_name}
                  </a>
                  <div className="text-[10px] opacity-40 uppercase font-bold tracking-wider dark:text-white text-slate-500">{m.points || 0} Points</div>
                  {m.status && <p className="text-[10px] italic opacity-30 truncate mt-1 dark:text-white text-slate-500">"{m.status}"</p>}
                </div>
               </div>
             ))
           )}
        </div>
      </section>
    </div>
  );
}
