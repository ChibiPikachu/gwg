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
    // 1. Prioritize /api/leaderboard/users which calculates live aggregated points matching the Leaderboard exactly
    try {
      const res = await fetch('/api/leaderboard/users');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) {
          if (user?.team && user.team !== 'none') {
            const teamMembers = data
              .filter(u => u.team === user.team)
              .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
            setMembers(teamMembers);
          } else {
            setMembers([]);
          }
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch /api/leaderboard/users in MyTeam, falling back to direct calculation:', err);
    }

    // 2. Direct Supabase fallback with dynamic point computation (excluding orphaned screenshot points)
    if (isSupabaseConfigured && supabase && user?.team && user.team !== 'none') {
      try {
        const { data: teamProfiles, error } = await supabase
          .from('profiles')
          .select('steamid, steam_name, steam_avatar, discord_id, discord_name, discord_avatar, active_avatar, team, status, points, role')
          .eq('team', user.team);

        if (!error && teamProfiles) {
          const { data: activeEvent } = await supabase
            .from('events')
            .select('id')
            .eq('is_active', true)
            .maybeSingle();

          const { data: verifiedSubs } = await supabase
            .from('submissions')
            .select('id, user_id, points, calculated_score, game_name, status, event_id, platform');

          const { data: allScreenshots } = await supabase
            .from('screenshot_submissions')
            .select('user_id, status');

          // Count valid non-rejected screenshots per user
          const userScreenshotCount: Record<string, number> = {};
          (allScreenshots || []).forEach((sc: any) => {
            if (sc.status !== 'rejected') {
              const rawId = String(sc.user_id || '').trim();
              const cleanId = rawId.startsWith('discord_') ? rawId.replace('discord_', '') : rawId;
              if (cleanId) {
                userScreenshotCount[cleanId] = (userScreenshotCount[cleanId] || 0) + 1;
                userScreenshotCount[rawId] = (userScreenshotCount[rawId] || 0) + 1;
              }
            }
          });

          const userLivePoints: Record<string, number> = {};
          const userScreenshotRowsSeen: Record<string, number> = {};

          (verifiedSubs || []).forEach((sub: any) => {
            const isVerified = sub.status === 'verified' || sub.status === 'approved' || !sub.status;
            if (!isVerified) return;
            if (activeEvent && sub.event_id && sub.event_id !== activeEvent.id) return;
            if (sub.game_name === 'Event Update' || String(sub.user_id).startsWith('team_pts_')) return;

            const rawUid = String(sub.user_id || '').trim();
            const cleanUid = rawUid.startsWith('discord_') ? rawUid.replace('discord_', '') : rawUid;

            const isScreenshotPoint = sub.platform === 'Screenshot Event' || 
              (sub.game_name && sub.game_name.includes('Screenshot Contest Submission')) ||
              (sub.game_name && sub.game_name.includes('Screenshot Submission'));

            if (isScreenshotPoint) {
              const allowed = userScreenshotCount[cleanUid] || userScreenshotCount[rawUid] || 0;
              const seen = userScreenshotRowsSeen[cleanUid] || 0;
              if (seen >= allowed) return; // Discard deleted screenshot points
              userScreenshotRowsSeen[cleanUid] = seen + 1;
            }

            const pts = Math.round(Number(sub.points !== undefined && sub.points !== null ? sub.points : sub.calculated_score) || 0);
            userLivePoints[cleanUid] = (userLivePoints[cleanUid] || 0) + pts;
            userLivePoints[rawUid] = (userLivePoints[rawUid] || 0) + pts;
          });

          const transformed = teamProfiles.map((u: any) => {
            const rawId = String(u.steamid || u.discord_id || '');
            const cleanId = rawId.startsWith('discord_') ? rawId.replace('discord_', '') : rawId;
            const livePts = userLivePoints[cleanId] ?? userLivePoints[rawId];
            const finalPts = (livePts !== undefined) ? livePts : (u.points || 0);

            return {
              ...u,
              steam_avatar: (u.active_avatar === 'discord' && u.discord_avatar) ? u.discord_avatar : (u.steam_avatar || u.discord_avatar || ''),
              points: finalPts
            };
          }).sort((a: any, b: any) => (Number(b.points) || 0) - (Number(a.points) || 0));

          setMembers(transformed);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Direct Supabase calculation for team members failed:', err);
      }
    }

    setLoading(false);
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
