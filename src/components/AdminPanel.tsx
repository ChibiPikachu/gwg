import React from 'react';
import { UserProfile, Team, TEAM_COLORS } from '@/types';
import { useAuth } from '@/components/AuthProvider';
import { Search, Settings, Shield, UserX, Trash2, Gamepad2, Disc as Discord } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminPanel() {
  const { user: currentUser } = useAuth();
  const [filterTeam, setFilterTeam] = React.useState<Team | 'all'>('all');
  const [users, setUsers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState<string | null>(null);
  const [selectedUser, setSelectedUser] = React.useState<any | null>(null);

  React.useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const assignTeam = async (targetSteamId: string, team: Team) => {
    setUpdating(targetSteamId);
    try {
      const res = await fetch('/api/admin/update-user-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSteamId, team })
      });
      if (res.ok) {
        // Optimistic update
        setUsers(prev => prev.map(u => 
          (u.steamid === targetSteamId) ? { ...u, team } : u
        ));
      }
    } catch (err) {
      console.error('Failed to update team:', err);
    } finally {
      setUpdating(null);
    }
  };

  const teams: Team[] = ['blue', 'green', 'purple', 'red'];
  const filteredUsers = filterTeam === 'all' ? users : users.filter(u => (u.team || 'none') === filterTeam);

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
      <section>
        <h2 className="text-xl font-bold mb-6">Filters</h2>
        <div className="flex gap-3">
          {teams.map(team => (
            <button
               key={team}
               onClick={() => setFilterTeam(team)}
               className={cn(
                  "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                  filterTeam === team 
                    ? `${TEAM_COLORS[team].primary} ${TEAM_COLORS[team].secondary} border border-${team}-accent ring-1 ring-${team}-accent`
                    : "bg-white/5 opacity-50 border border-transparent hover:opacity-100"
               )}
            >
              {team.charAt(0).toUpperCase() + team.slice(1)}
            </button>
          ))}
          <button 
             onClick={() => setFilterTeam('all')}
             className={cn(
                "px-6 py-2 rounded-lg text-sm font-bold transition-all bg-white/5 opacity-50",
                filterTeam === 'all' && "opacity-100 bg-white/10 ring-1 ring-white/20"
             )}
          >
            All users
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-8">All users ({filteredUsers.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12">
          {filteredUsers.map((u, i) => (
            <div key={u.steamid} className="flex flex-col gap-5 p-6 bg-[#111111] rounded-2xl border border-white/5 relative group">
               <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-14 h-14 rounded-full border-2 p-1",
                    u.team && u.team !== 'none' ? TEAM_COLORS[u.team as Team].border : "border-white/10"
                  )}>
                     <img 
                       src={u.steam_avatar || 'https://via.placeholder.com/150'} 
                       alt="" 
                       className="w-full h-full rounded-full object-cover" 
                       referrerPolicy="no-referrer"
                     />
                  </div>
                  <div className="flex flex-col">
                     <div className="flex items-center gap-2">
                        <span className="text-sm opacity-50">Steam:</span>
                        <span className="text-sm font-bold text-blue-400">{u.steam_name}</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-sm opacity-50">Discord:</span>
                        <span className="text-sm font-bold text-purple-400">{u.discord_name || 'Not linked'}</span>
                     </div>
                  </div>
                  {u.role === 'admin' && (
                    <div className="ml-auto bg-pink-500/10 text-pink-500 text-[10px] uppercase font-bold px-2 py-1 rounded border border-pink-500/20">
                      Admin
                    </div>
                  )}
               </div>

               <div className="flex flex-col gap-3">
                  <span className="text-[10px] uppercase font-bold opacity-30">Assign to team:</span>
                  <div className="flex gap-2">
                     {teams.map(team => (
                        <button 
                           key={team}
                           disabled={updating === u.steamid}
                           onClick={() => assignTeam(u.steamid, team)}
                           className={cn(
                              "flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all",
                              u.team === team 
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
