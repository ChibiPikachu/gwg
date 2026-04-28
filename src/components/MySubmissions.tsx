import React from 'react';
import { History, CheckCircle2, AlertCircle, Plus, Search, Loader2 } from 'lucide-react';
import { Submission, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';

export default function MySubmissions() {
  const { theme } = useAuth();
  const [submissions, setSubmissions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [gameSearch, setGameSearch] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [selectedGame, setSelectedGame] = React.useState<any | null>(null);
  const [formData, setFormData] = React.useState({
    achievementsEarned: '',
    hoursPlayed: '',
    achievementsBefore: '0',
    hoursBefore: '0',
    notes: ''
  });
  const [submitting, setSubmitting] = React.useState(false);

  const multiplierPreview = React.useMemo(() => {
    const hours = parseFloat(formData.hoursPlayed) || 0;
    if (hours <= 8) return 1;
    if (hours <= 15) return 2;
    if (hours <= 25) return 3;
    return 4;
  }, [formData.hoursPlayed]);

  const scorePreview = React.useMemo(() => {
    const earned = parseInt(formData.achievementsEarned) || 0;
    return earned * multiplierPreview;
  }, [formData.achievementsEarned, multiplierPreview]);

  const fetchSubmissions = React.useCallback(async () => {
    try {
      const res = await fetch('/api/submissions');
      if (res.ok) {
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Debounced real-time search
  React.useEffect(() => {
    if (!gameSearch.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/games/search?query=${encodeURIComponent(gameSearch)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [gameSearch]);

  const handleSearchGame = async () => {
    // This is now handled by the useEffect above
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGame) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: selectedGame.id,
          gameTitle: selectedGame.title,
          gameImage: selectedGame.image,
          achievements: parseInt(formData.achievementsEarned) || 0,
          hours: parseFloat(formData.hoursPlayed) || 0,
          achievementsBefore: parseInt(formData.achievementsBefore) || 0,
          hoursBefore: parseFloat(formData.hoursBefore) || 0,
          multiplier: multiplierPreview,
          calculatedScore: scorePreview,
          notes: formData.notes
        })
      });

      if (res.ok) {
        setShowForm(false);
        setSelectedGame(null);
        setFormData({ 
          achievementsEarned: '', 
          hoursPlayed: '', 
          achievementsBefore: '0', 
          hoursBefore: '0', 
          notes: '' 
        });
        setGameSearch('');
        setSearchResults([]);
        fetchSubmissions();
      } else {
        const data = await res.json();
        alert(`Submission failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert('Failed to submit game.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setShowForm(false);
    setSelectedGame(null);
    setSearchResults([]);
    setGameSearch('');
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-12">
        <div>
          <h1 className="text-2xl font-bold mb-2">Welcome!</h1>
          <p className="opacity-60">Ready to add your games?</p>
        </div>
        <button 
          onClick={() => setShowForm(true)}
          className={cn("text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2", theme.bg, `hover:${theme.bg.replace('bg-', 'bg-')}`, theme.glow)}
        >
          <Plus size={20} />
          Submit Game
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#151515] border border-white/10 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-bold">New Submission</h2>
                  <p className="text-sm opacity-50 mt-1">Submit your progress for the current event</p>
                </div>
                <button onClick={handleResetForm} className="text-white/20 hover:text-white transition-colors">
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              {!selectedGame ? (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <label className="text-xs uppercase font-bold opacity-30 tracking-widest">Search Game</label>
                    <div className="relative group">
                      <Search className={cn(
                        "absolute left-4 top-1/2 -translate-y-1/2 transition-colors",
                        searching ? theme.text : `text-white/20 group-focus-within:${theme.text}`
                      )} size={18} />
                      <input 
                        type="text"
                        placeholder="Start typing a game title..."
                        className={cn("w-full bg-white/5 border border-white/5 rounded-xl py-4 pl-12 pr-4 focus:outline-none transition-all font-sans text-sm", `focus:${theme.border}/50`)}
                        value={gameSearch}
                        onChange={(e) => setGameSearch(e.target.value)}
                      />
                      {searching && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                          <Loader2 className={cn("animate-spin", theme.text)} size={18} />
                        </div>
                      )}
                    </div>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                      <div className="text-[10px] uppercase font-bold opacity-30 px-1">Suggestions</div>
                      <div className="max-h-[350px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {searchResults.map((game) => (
                          <button
                            key={game.id}
                            onClick={() => setSelectedGame(game)}
                            type="button"
                            className="w-full flex gap-4 p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all text-left items-center group"
                          >
                            <img src={game.image} className="w-16 h-20 object-cover rounded-lg shadow-lg group-hover:scale-105 transition-transform" alt="" referrerPolicy="no-referrer" />
                            <div className="flex-1 min-w-0">
                              <h4 className={cn("font-bold text-sm transition-colors truncate", `group-hover:${theme.text}`)}>{game.title}</h4>
                              {game.summary && <p className="text-[10px] opacity-40 line-clamp-2 mt-1">{game.summary}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!searching && gameSearch.trim() && searchResults.length === 0 && (
                    <div className="text-center py-8 opacity-30 text-sm italic">
                      No games found matching "{gameSearch}"
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <img src={selectedGame.image} className="w-24 h-14 object-cover rounded-lg" alt="" />
                    <div>
                      <h3 className="font-bold">{selectedGame.title}</h3>
                      <button 
                        type="button"
                        onClick={() => setSelectedGame(null)}
                        className={cn("text-[10px] uppercase font-bold hover:underline", theme.text)}
                      >
                        Change Game
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold opacity-40">Achievements Earned</label>
                      <input 
                        required
                        type="number"
                        placeholder="0"
                        className={cn("w-full bg-white/5 border border-white/5 rounded-xl p-3 focus:outline-none", `focus:${theme.border}/50`)}
                        value={formData.achievementsEarned}
                        onChange={(e) => setFormData({...formData, achievementsEarned: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold opacity-40">Hours Played (Event)</label>
                      <input 
                        required
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        className={cn("w-full bg-white/5 border border-white/5 rounded-xl p-3 focus:outline-none", `focus:${theme.border}/50`)}
                        value={formData.hoursPlayed}
                        onChange={(e) => setFormData({...formData, hoursPlayed: e.target.value})}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold opacity-40 uppercase tracking-tighter">Achievements (Before)</label>
                      <input 
                        required
                        type="number"
                        placeholder="0"
                        className={cn("w-full bg-white/5 border border-white/5 rounded-xl p-3 focus:outline-none", `focus:${theme.border}/50`)}
                        value={formData.achievementsBefore}
                        onChange={(e) => setFormData({...formData, achievementsBefore: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold opacity-40 uppercase tracking-tighter">Hours (Before)</label>
                      <input 
                        required
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        className={cn("w-full bg-white/5 border border-white/5 rounded-xl p-3 focus:outline-none", `focus:${theme.border}/50`)}
                        value={formData.hoursBefore}
                        onChange={(e) => setFormData({...formData, hoursBefore: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold opacity-30">Multiplier</span>
                      <span className="text-xl font-black text-blue-400">{multiplierPreview.toFixed(1)}x</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] uppercase font-bold opacity-30">Score Preview</span>
                      <span className={cn("text-2xl font-black", theme.text)}>{scorePreview} <span className="text-xs opacity-50">PTS</span></span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold opacity-40">Proof Link / Notes (Optional)</label>
                    <textarea 
                      placeholder="Any links to screenshots or other notes..."
                      className={cn("w-full bg-white/5 border border-white/5 rounded-xl p-4 focus:outline-none min-h-[100px] resize-none", `focus:${theme.border}/50`)}
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    />
                  </div>

                  <button 
                    disabled={submitting}
                    className={cn("w-full py-4 text-white rounded-xl font-bold transition-all disabled:opacity-50", theme.bg, theme.glow)}
                  >
                    {submitting ? <Loader2 className="animate-spin mx-auto" size={24} /> : 'Submit Progress'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Submissions List */}
      <h2 className="text-xl font-bold mb-8">My submissions</h2>
      
      {loading ? (
        <div className="text-center py-24 opacity-30 animate-pulse">Loading submissions...</div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-white/5 rounded-3xl">
          <History size={48} className="mx-auto text-white/10 mb-4" />
          <p className="opacity-40 font-medium">No submissions yet.</p>
          <p className="text-sm opacity-20 mt-1">Your game progress will appear here once submitted.</p>
        </div>
      ) : (
        <div className="mb-12">
          <h3 className="text-xs uppercase tracking-widest font-bold opacity-30 mb-6">Current event</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {submissions.map((sub) => (
              <div key={sub.id} className="flex flex-col gap-3 group">
                <div className="aspect-[3/4] bg-[#111111] rounded-xl overflow-hidden border border-white/5 relative shadow-xl">
                   <img 
                     src={sub.game_image} 
                     alt={sub.game_title} 
                     className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                     referrerPolicy="no-referrer"
                   />
                   
                   <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 gap-4">
                      <div className="flex flex-col items-center gap-1">
                         <div className="flex items-center gap-2 text-xs font-bold">
                            🏆 {sub.achievements_during}
                         </div>
                         <div className="flex items-center gap-2 text-xs font-bold">
                            🕒 {sub.hours_during}h
                         </div>
                      </div>
                      <div className="text-[10px] bg-white/10 px-2 py-1 rounded-full text-center">
                        Submitted on {new Date(sub.created_at).toLocaleDateString()}
                      </div>
                   </div>
                </div>
                <div className="flex items-center gap-2 px-1">
                  {sub.status === 'verified' ? (
                    <>
                      <CheckCircle2 size={14} className="text-emerald-400" />
                      <span className="text-[10px] font-bold opacity-70">Game verified</span>
                    </>
                  ) : sub.status === 'rejected' ? (
                    <>
                      <AlertCircle size={14} className="text-red-400" />
                      <span className="text-[10px] font-bold opacity-70">Rejected: {sub.rejection_reason || 'See comments'}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} className="text-amber-400" />
                      <span className="text-[10px] font-bold opacity-70">Pending review</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {submissions.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-widest font-bold opacity-30 mb-6">Past events</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 opacity-40 grayscale pointer-events-none">
            <div className="aspect-[3/4] bg-[#1a1a1a] rounded-xl border border-white/5" />
            <div className="aspect-[3/4] bg-[#1a1a1a] rounded-xl border border-white/5" />
          </div>
        </div>
      )}
    </div>
  );
}

