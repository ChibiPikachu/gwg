import React from 'react';
import { UserProfile, Team, TEAM_COLORS } from '@/types';
import { useAuth } from '@/components/AuthProvider';
import { Search, Settings, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export default function AdminPanel({ onViewProfile }: { onViewProfile?: (id: string) => void }) {
  const { user: currentUser } = useAuth();
  const [filterTeam, setFilterTeam] = React.useState<Team | 'all'>('all');
  const [users, setUsers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState<string | null>(null);
  const [selectedUser, setSelectedUser] = React.useState<any | null>(null);

  const fetchUsers = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchUsers();

    // Subscribe to real-time updates for profiles
    const channel = supabase
      .channel('admin-profiles')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'profiles' 
      }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUsers]);

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
        // Optimistic update
        setUsers(prev => {
          if (!Array.isArray(prev)) return prev;
          return prev.map(u => 
            (u.steamid === targetSteamId) ? { ...u, team: team === 'none' ? null : team } : u
          );
        });
      } else {
        alert(`Failed to update team: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to update team:', err);
      alert('Failed to update team. Check console for details.');
    } finally {
      setUpdating(null);
    }
  };

  const safeUsers = Array.isArray(users) ? users : [];
  const teamsAssign: Team[] = ['blue', 'green', 'purple', 'red', 'none'];
  const teamsFilter: Team[] = ['blue', 'green', 'purple', 'red', 'none'];
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredUsers = safeUsers.filter(u => {
    const matchesTeam = filterTeam === 'all' || (u.team || 'none') === filterTeam;
    const matchesSearch = u.steam_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (u.discord_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTeam && matchesSearch;
  });

  const isAdmin = currentUser?.isAdmin || currentUser?.role === 'admin' || currentUser?.role === 'admins';

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
    return <div className="p-8 text-center opacity-50">Loading users...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-12">
      <section className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-end">
        <div className="flex-1 w-full flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold mb-4">Search & Filters</h2>
            <div className="relative group max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-pink-500 transition-colors" size={18} />
              <input 
                type="text"
                placeholder="Search by Steam or Discord name..."
                className="w-full bg-[#111111] border border-white/5 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-pink-500/50 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <button 
               onClick={() => setFilterTeam('all')}
               className={cn(
                  "px-6 py-2 rounded-lg text-sm font-bold transition-all bg-white/5 border border-transparent hover:bg-white/10",
                  filterTeam === 'all' && "bg-white/10 ring-1 ring-white/20 border-white/10"
               )}
            >
              All
            </button>
            {teamsFilter.map(team => (
              <button
                 key={team}
                 onClick={() => setFilterTeam(team)}
                 className={cn(
                    "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                    filterTeam === team 
                      ? `${TEAM_COLORS[team].primary} ${TEAM_COLORS[team].secondary} ring-1 ring-${team === 'none' ? 'white/20' : team + '-accent'}`
                      : "bg-white/5 opacity-50 border border-transparent hover:opacity-100"
                 )}
              >
                {team.charAt(0).toUpperCase() + team.slice(1)}
              </button>
            ))}
          </div>
        </div>
        
        <div className="bg-white/5 px-6 py-3 rounded-2xl border border-white/5">
           <span className="text-2xl font-mono font-bold text-pink-500">{filteredUsers.length}</span>
           <span className="text-[10px] uppercase font-bold opacity-30 ml-2 tracking-widest">Users Found</span>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-8">User Directory</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12">
          {filteredUsers.map((u, i) => (
            <div key={u.steamid} className="flex flex-col gap-5 p-6 bg-[#111111] rounded-2xl border border-white/5 relative group">
               <div className="flex items-center gap-4">
                  <button 
                    onClick={() => onViewProfile?.(u.steamid)}
                    title="View App Profile"
                    className={cn(
                      "w-14 h-14 rounded-full border-2 p-1 transition-transform hover:scale-110 active:scale-95 cursor-pointer outline-none focus:ring-2 focus:ring-pink-500/50 shrink-0",
                      u.team && u.team !== 'none' ? TEAM_COLORS[u.team as Team].border : "border-white/10"
                    )}
                  >
                     <img 
                       src={u.steam_avatar || 'https://via.placeholder.com/150'} 
                       alt="" 
                       className="w-full h-full rounded-full object-cover" 
                       referrerPolicy="no-referrer"
                     />
                  </button>
                  <div className="flex flex-col overflow-hidden">
                     <div className="flex items-center gap-2">
                        <span className="text-sm opacity-50">Steam:</span>
                        <a 
                          href={`https://steamcommunity.com/profiles/${u.steamid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-bold text-blue-400 hover:text-blue-300 hover:underline transition-colors truncate"
                        >
                          {u.steam_name}
                        </a>
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-sm opacity-50">Discord:</span>
                        <span className="text-sm font-bold text-purple-400 truncate">{u.discord_name || 'Not linked'}</span>
                     </div>
                  </div>
                  {(u.role === 'admin' || u.role === 'admins') && (
                    <div className="ml-auto bg-pink-500/10 text-pink-500 text-[10px] uppercase font-bold px-2 py-1 rounded border border-pink-500/20">
                      Admin
                    </div>
                  )}
               </div>

               <div className="flex flex-col gap-3">
                  <span className="text-[10px] uppercase font-bold opacity-30">Assign to team:</span>
                  <div className="flex gap-2">
                     {teamsAssign.map(team => (
                        <button 
                           key={team}
                           disabled={updating === u.steamid}
                           onClick={() => assignTeam(u.steamid, team)}
                           className={cn(
                              "flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all",
                              (u.team === team || (!u.team && team === 'none')) 
                                ? `${TEAM_COLORS[team].secondary} ${TEAM_COLORS[team].primary} ring-1 ring-${team}-accent`
                                : "bg-white/5 text-white/40 hover:bg-white/10",
                              updating === u.steamid && "opacity-50 cursor-not-allowed"
                           )}
                        >
                           {team}
                        </button>
                     ))}
                     <button 
                       onClick={() => setSelectedUser(u)}
                       className="px-3 bg-white/5 text-white/40 rounded-lg hover:bg-white/10 transition-all"
                     >
                        <Settings size={14} />
                     </button>
                  </div>
               </div>
               
               {/* Modal Overlay */}
               {selectedUser && selectedUser.steamid === u.steamid && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] rounded-2xl z-10 flex items-center justify-center p-8">
                     <div className="bg-[#151515] border border-white/10 rounded-2xl w-full max-w-sm flex flex-col overflow-hidden shadow-2xl">
                        <div className="p-6 flex flex-col items-center gap-4">
                           <div className="w-20 h-20 rounded-full border-4 border-pink-500/30 p-1">
                              <img src={u.steam_avatar} alt="" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                           </div>
                           <div className="text-center">
                              <h3 className="text-xl font-bold">{u.steam_name}</h3>
                              <p className="text-sm opacity-50 mt-1 uppercase tracking-wider">{u.role || 'Member'}</p>
                           </div>
                        </div>

                         <div className="px-4 pb-6 flex flex-col gap-2">
                            <button 
                              onClick={() => setSelectedUser(null)}
                              className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-all border border-white/5 font-bold"
                            >
                               Close
                            </button>
                         </div>
                     </div>
                  </div>
               )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
