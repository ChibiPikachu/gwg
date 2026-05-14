import React from 'react';
import { Gamepad2, Users, ExternalLink, Trophy } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';

export default function Games({ onViewProfile }: { onViewProfile?: (id: string) => void }) {
  const { theme } = useAuth();
  const [games, setGames] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch('/api/leaderboard/games')
      .then(res => res.json())
      .then(data => {
        setGames(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch games:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Event Games</h1>
        <p className="opacity-60">All unique games submitted during the current event.</p>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className={cn("w-8 h-8 border-2 border-t-transparent rounded-full animate-spin", theme.border)}></div>
        </div>
      ) : games.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-white/10 opacity-30 italic">
          No games have been submitted for this event yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {games.map((game) => (
            <div 
              key={game.game_id} 
              className="p-4 dark:bg-[#111111] bg-white rounded-2xl border border-black/5 dark:border-white/5 hover:border-black/10 dark:hover:border-white/10 transition-all flex items-start gap-5 shadow-sm dark:shadow-none min-w-0"
            >
              <div className="w-20 h-28 rounded-xl overflow-hidden bg-white/5 shrink-0 border border-white/5 relative">
                {game.game_image ? (
                  <img src={game.game_image} alt={game.game_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-20">
                    <Gamepad2 size={32} />
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-3 min-w-0">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg dark:text-white text-slate-800 truncate">{game.game_name}</h3>
                    {game.steam_appid && (
                      <a 
                        href={`https://store.steampowered.com/app/${game.steam_appid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-white/5 rounded text-blue-400 opacity-60 hover:opacity-100 transition-all shrink-0"
                        title="View on Steam"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs opacity-50">
                    <Trophy size={12} />
                    <span>Active Event Entry</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold opacity-30 px-1">
                    <Users size={10} />
                    <span>Submitted by</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {game.users.map((user: any) => (
                      <button
                        key={user.steamid}
                        onClick={() => onViewProfile?.(user.steamid)}
                        className="group/user flex items-center gap-2 px-2 py-1 rounded-full bg-black/10 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/10 transition-all outline-none"
                        title={`View ${user.steam_name}'s profile`}
                      >
                        <img 
                          src={user.steam_avatar} 
                          className="w-5 h-5 rounded-full object-cover grayscale group-hover/user:grayscale-0 transition-all" 
                          alt="" 
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-xs font-medium dark:text-white text-slate-600 group-hover/user:text-blue-400 transition-colors">
                          {user.steam_name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
