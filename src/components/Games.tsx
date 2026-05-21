import React from 'react';
import { Gamepad2, Users, ExternalLink, Trophy, SortAsc, Users2, Filter, ChevronLeft, ChevronRight, Archive, CheckCircle2, Search, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';

type SortOption = 'az' | 'members';
type FilterOption = 'active' | 'archived';

export default function Games({ onViewProfile }: { onViewProfile?: (id: string) => void }) {
  const { theme } = useAuth();
  const [games, setGames] = React.useState<any[]>([]);
  const [events, setEvents] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sortBy, setSortBy] = React.useState<SortOption>('az');
  const [filterBy, setFilterBy] = React.useState<FilterOption>('active');
  const [selectedEventId, setSelectedEventId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 40;

  // Fetch events list first
  React.useEffect(() => {
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        const eventList = Array.isArray(data) ? data : [];
        setEvents(eventList);
        const active = eventList.find(e => e.is_active);
        if (active) {
          setSelectedEventId(active.id);
        } else if (eventList.length > 0) {
          setSelectedEventId(eventList[0].id);
        }
      })
      .catch(err => console.error('Failed to fetch events:', err));
  }, []);

  // Fetch games when selectedEventId changes
  React.useEffect(() => {
    if (!selectedEventId) return;
    
    setLoading(true);
    fetch(`/api/leaderboard/games?eventId=${selectedEventId}`)
      .then(res => res.json())
      .then(data => {
        setGames(Array.isArray(data) ? data : []);
        setLoading(false);
        setCurrentPage(1); // Reset to first page on change
      })
      .catch(err => {
        console.error('Failed to fetch games:', err);
        setLoading(false);
      });
  }, [selectedEventId]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const filteredAndSortedGames = React.useMemo(() => {
    let result = [...games];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(g => 
        (g.game_name && g.game_name.toLowerCase().includes(q)) ||
        (g.users && g.users.some((user: any) => user.steam_name && user.steam_name.toLowerCase().includes(q)))
      );
    }
    if (sortBy === 'az') {
      result.sort((a, b) => a.game_name.localeCompare(b.game_name));
    } else if (sortBy === 'members') {
      result.sort((a, b) => b.users.length - a.users.length);
    }
    return result;
  }, [games, sortBy, searchQuery]);

  const totalPages = Math.ceil(filteredAndSortedGames.length / itemsPerPage);
  const paginatedGames = filteredAndSortedGames.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const filteredEvents = React.useMemo(() => {
    if (filterBy === 'active') return events.filter(e => e.is_active);
    return events.filter(e => !e.is_active);
  }, [events, filterBy]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Event Games</h1>
          <p className="opacity-60">All unique games submitted during chosen events.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Real-time Game Search Bar */}
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" size={14} />
            <input
              type="text"
              placeholder="Search games or submitters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "w-full dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl py-2 pl-9 pr-8 focus:outline-none transition-all font-sans text-xs dark:text-white text-slate-900",
                `focus:${theme.border}/50`
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30 hover:dark:text-white hover:text-slate-900 transition-colors"
                title="Clear Search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter by Event Status */}
          <div className="flex bg-black/10 dark:bg-white/5 p-1 rounded-xl border border-black/5 dark:border-white/5">
            <button
              onClick={() => {
                setFilterBy('active');
                const active = events.find(e => e.is_active);
                if (active) setSelectedEventId(active.id);
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                filterBy === 'active' ? cn(theme.bg, "text-white shadow-lg") : "opacity-40 hover:opacity-100"
              )}
            >
              <CheckCircle2 size={14} /> Active
            </button>
            <button
              onClick={() => {
                setFilterBy('archived');
                const archived = events.filter(e => !e.is_active);
                if (archived.length > 0) setSelectedEventId(archived[0].id);
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                filterBy === 'archived' ? cn(theme.bg, "text-white shadow-lg") : "opacity-40 hover:opacity-100"
              )}
            >
              <Archive size={14} /> Archived
            </button>
          </div>

          {/* Sort Options */}
          <div className="flex bg-black/10 dark:bg-white/5 p-1 rounded-xl border border-black/5 dark:border-white/5">
            <button
              onClick={() => setSortBy('az')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                sortBy === 'az' ? cn(theme.bg, "text-white shadow-lg") : "opacity-40 hover:opacity-100"
              )}
            >
              <SortAsc size={14} /> A-Z
            </button>
            <button
              onClick={() => setSortBy('members')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                sortBy === 'members' ? cn(theme.bg, "text-white shadow-lg") : "opacity-40 hover:opacity-100"
              )}
            >
              <Users2 size={14} /> Popular
            </button>
          </div>
        </div>
      </div>

      {/* Event Selector for Archived */}
      {filterBy === 'archived' && filteredEvents.length > 0 && (
        <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          {filteredEvents.map(e => (
            <button
              key={e.id}
              onClick={() => setSelectedEventId(e.id)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-medium border transition-all",
                selectedEventId === e.id 
                  ? cn(theme.border, "bg-white/5", theme.text)
                  : "border-black/5 dark:border-white/5 opacity-50 hover:opacity-100 dark:bg-white/5"
              )}
            >
              {e.title}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <div className={cn("w-8 h-8 border-2 border-t-transparent rounded-full animate-spin", theme.border)}></div>
        </div>
      ) : filteredAndSortedGames.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-white/10 opacity-30 italic">
          {searchQuery ? `No games found matching "${searchQuery}".` : "No games found for this event selection."}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {paginatedGames.map((game) => (
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
                      <span>{filterBy === 'active' ? 'Active' : 'Archived'} Event Entry</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold opacity-30 px-1">
                      <Users size={10} />
                      <span>Submitted by ({game.users.length})</span>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="p-2 rounded-xl bg-white/5 border border-white/5 disabled:opacity-20 hover:bg-white/10 transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold opacity-60">Page</span>
                <span className={cn("text-sm font-bold", theme.text)}>{currentPage}</span>
                <span className="text-sm font-bold opacity-60">of {totalPages}</span>
              </div>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="p-2 rounded-xl bg-white/5 border border-white/5 disabled:opacity-20 hover:bg-white/10 transition-all"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
