import React from 'react';
import { UserProfile, Team, TEAM_COLORS } from '@/types';
import { useAuth } from '@/components/AuthProvider';
import { Search, Settings, Shield, UserX, Trash2, Gamepad2, Disc as Discord } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminPanel() {
  const { user } = useAuth();
  const [filterTeam, setFilterTeam] = React.useState<Team | 'all'>('all');
  
  // Example users for visualization
  const users: UserProfile[] = [
    { uid: '1', steamId: '76561198117650232', steamName: 'Chibi', steamAvatar: 'https://avatars.akamai.steamstatic.com/ec7f4262aeae81e74f38697669d05634e02a9023_full.jpg', team: 'blue', isAdmin: true, status: 'Member', points: 0, discordId: '123' },
    { uid: '2', steamId: '76561198117650233', steamName: 'Chibi', steamAvatar: 'https://avatars.akamai.steamstatic.com/ec7f4262aeae81e74f38697669d05634e02a9023_full.jpg', team: 'none', isAdmin: false, status: 'Member', points: 0, discordId: '123' },
    { uid: '3', steamId: '76561198117650234', steamName: 'Chibi', steamAvatar: 'https://avatars.akamai.steamstatic.com/ec7f4262aeae81e74f38697669d05634e02a9023_full.jpg', team: 'none', isAdmin: false, status: 'Member', points: 0, discordId: '123' },
    { uid: '4', steamId: '76561198117650235', steamName: 'Chibi', steamAvatar: 'https://avatars.akamai.steamstatic.com/ec7f4262aeae81e74f38697669d05634e02a9023_full.jpg', team: 'none', isAdmin: false, status: 'Member', points: 0, discordId: '123' },
    { uid: '5', steamId: '76561198117650236', steamName: 'Chibi', steamAvatar: 'https://avatars.akamai.steamstatic.com/ec7f4262aeae81e74f38697669d05634e02a9023_full.jpg', team: 'none', isAdmin: false, status: 'Member', points: 0, discordId: '123' },
    { uid: '5', steamId: '76561198117650237', steamName: 'Chibi', steamAvatar: 'https://avatars.akamai.steamstatic.com/ec7f4262aeae81e74f38697669d05634e02a9023_full.jpg', team: 'none', isAdmin: false, status: 'Member', points: 0, discordId: '123' },
  ];

  const teams: Team[] = ['blue', 'green', 'purple', 'red'];

  const filteredUsers = filterTeam === 'all' ? users : users.filter(u => u.team === filterTeam);

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
        <h2 className="text-xl font-bold mb-8">All users</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12">
          {filteredUsers.map((u, i) => (
            <div key={i} className="flex flex-col gap-5 p-6 bg-[#111111] rounded-2xl border border-white/5 relative group">
               <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full border-2 border-pink-500/30 p-1">
                     <img src={u.steamAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                  </div>
                  <div className="flex flex-col">
                     <div className="flex items-center gap-2">
                        <span className="text-sm opacity-50">Steam:</span>
                        <span className="text-sm font-bold text-blue-400">{u.steamName}</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-sm opacity-50">Discord:</span>
                        <span className="text-sm font-bold text-purple-400">{u.steamName}</span>
                     </div>
                  </div>
               </div>

               <div className="flex flex-col gap-3">
                  <span className="text-[10px] uppercase font-bold opacity-30">Assign to team:</span>
                  <div className="flex gap-2">
                     {teams.map(team => (
                        <button 
                           key={team}
                           className={cn(
                              "flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all",
                              u.team === team 
                                ? `${TEAM_COLORS[team].secondary} ${TEAM_COLORS[team].primary} ring-1 ring-${team}-accent`
                                : "bg-white/5 text-white/40 hover:bg-white/10"
                           )}
                        >
                           {team}
                        </button>
                     ))}
                     <button className="px-3 bg-white/5 text-white/40 rounded-lg hover:bg-white/10 transition-all">
                        <Settings size={14} />
                     </button>
                  </div>
               </div>
               
               {/* Modal Overlay Stub - like in image 6 */}
               {i === 0 && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] rounded-2xl z-10 flex items-center justify-center p-8">
                     <div className="bg-[#151515] border border-white/10 rounded-2xl w-full max-w-sm flex flex-col overflow-hidden shadow-2xl">
                        <div className="p-6 flex flex-col items-center gap-4">
                           <div className="w-20 h-20 rounded-full border-4 border-pink-500/30 p-1">
                              <img src={u.steamAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                           </div>
                           <div className="text-center">
                              <h3 className="text-xl font-bold">{u.steamName} (Chibi)</h3>
                              <p className="text-sm opacity-50 mt-1">Member</p>
                           </div>
                        </div>

                        <div className="px-4 py-6 flex flex-col gap-2 bg-[#111111]">
                           <button className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-all border border-white/5">
                              View on Steam
                           </button>
                           <button className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-all border border-white/5">
                              Make admin
                           </button>
                           <button className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-all border border-white/5">
                              Remove from event
                           </button>
                           
                           <div className="flex gap-2 mt-2">
                              <button className="flex-1 py-3 bg-red-500/10 text-red-500 rounded-xl text-sm font-bold border border-red-500/20">
                                 Soft ban
                              </button>
                              <button className="flex-1 py-3 bg-red-500 text-white rounded-xl text-sm font-bold">
                                 Kick
                              </button>
                           </div>
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
