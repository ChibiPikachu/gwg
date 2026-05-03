import React from 'react';
import { History, CheckCircle2, AlertCircle, Plus, Search, Loader2, XCircle, Clock } from 'lucide-react';
import { Submission, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function MySubmissions() {
  const { user, theme } = useAuth();
  const [submissions, setSubmissions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hltbData, setHltbData] = React.useState<Record<string, any>>({});
  const [showForm, setShowForm] = React.useState(false);
  const [gameSearch, setGameSearch] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [selectedGame, setSelectedGame] = React.useState<any | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState({
    achievementsEarned: '',
    hoursPlayed: '',
    achievementsBefore: '0',
    hoursBefore: '0',
    completionStatus: 'unfinished' as any,
    platform: 'Steam' as string,
    notes: ''
  });
  const [verifyingSteam, setVerifyingSteam] = React.useState(false);
  const [steamVerifyMsg, setSteamVerifyMsg] = React.useState<{type: 'error' | 'success' | 'info', text: string} | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [steamTotalStats, setSteamTotalStats] = React.useState<{hours: number, achievements: number} | null>(null);
  const [completionFilter, setCompletionFilter] = React.useState<'all' | 'unfinished' | 'beaten' | 'completed' | 'abandoned'>('all');

  // Auto-calculate 'during event' stats
  React.useEffect(() => {
    if (formData.platform === 'Steam' && steamTotalStats) {
      const achievementsBefore = parseInt(formData.achievementsBefore) || 0;
      const hoursBefore = parseFloat(formData.hoursBefore) || 0;
      
      const duringAchievements = Math.max(0, steamTotalStats.achievements - achievementsBefore);
      const duringHours = Math.max(0, steamTotalStats.hours - hoursBefore);
      
      setFormData(prev => ({
        ...prev,
        achievementsEarned: String(duringAchievements),
        hoursPlayed: duringHours.toFixed(1)
      }));
    }
  }, [formData.achievementsBefore, formData.hoursBefore, steamTotalStats, formData.platform]);

  const multiplierPreview = React.useMemo(() => {
    const hours = parseFloat(formData.hoursPlayed) || 0;
    // New Math: Short (1x), Medium (2x), Long (3x), Very Long (4x)
    if (hours < 8) return 1.0;
    if (hours < 15) return 2.0;
    if (hours < 25) return 3.0;
    return 4.0;
  }, [formData.hoursPlayed]);

  const filteredSubmissions = React.useMemo(() => {
    if (completionFilter === 'all') return submissions;
    return submissions.filter(s => s.completion_status === completionFilter);
  }, [submissions, completionFilter]);

  const scorePreview = React.useMemo(() => {
    const earned = parseInt(formData.achievementsEarned) || 0;
    const bonus = formData.completionStatus === 'completed' ? 20 : 0;
    return Math.round(earned * multiplierPreview) + bonus;
  }, [formData.achievementsEarned, multiplierPreview, formData.completionStatus]);

  const fetchSubmissions = React.useCallback(async () => {
    try {
      const res = await fetch('/api/submissions');
      if (res.ok) {
        const data = await res.json();
        const subArray = Array.isArray(data) ? data : [];
        setSubmissions(subArray);

        // Batch fetch HLTB data for these submissions
        const uniqueTitles = Array.from(new Set(subArray.map((s: any) => s.game_name)));
        if (uniqueTitles.length > 0) {
          fetch('/api/hltb-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titles: uniqueTitles })
          })
          .then(r => r.json())
          .then(hltb => {
             setHltbData(prev => ({ ...prev, ...hltb }));
          })
          .catch(err => console.error('HLTB batch fetch failed:', err));
        }
      }
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSubmissions();

    if (!user?.steamId || !isSupabaseConfigured) return;

    // Listen for changes to MY submissions
    const channel = supabase
      .channel(`my-submissions-${user.steamId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'submissions',
        filter: `user_id=eq.${user.steamId}`
      }, (payload) => {
        console.log('Real-time submission update:', payload);
        if (payload.eventType === 'INSERT') {
          const newSub = payload.new as Submission;
          setSubmissions(prev => {
            if (prev.some(s => s.id === newSub.id)) return prev;
            return [newSub, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          setSubmissions(prev => prev.map(s => s.id === (payload.new as Submission).id ? (payload.new as Submission) : s));
        } else if (payload.eventType === 'DELETE') {
          setSubmissions(prev => prev.filter(s => s.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSubmissions, user?.steamId]);

  // Debounced real-time search
  React.useEffect(() => {
    if (!gameSearch.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/games/search?query=${encodeURIComponent(gameSearch)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        } else {
          const err = await res.json().catch(() => ({ error: 'Search failed' }));
          setSearchError(err.error || 'Server error');
        }
      } catch (err) {
        console.error('Search error:', err);
        setSearchError('Network error');
      } finally {
        setSearching(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [gameSearch]);

  // Handle Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedGame) {
          setSelectedGame(null);
        } else if (showForm) {
          handleResetForm();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGame, showForm]);

  const handleSearchGame = async () => {
    // This is now handled by the useEffect above
  };

  const [hltbInfo, setHltbInfo] = React.useState<any>(null);

  // Fetch HLTB when game is selected
  React.useEffect(() => {
    if (selectedGame) {
      setHltbInfo(null);
      fetch(`/api/hltb/${encodeURIComponent(selectedGame.title)}`)
        .then(r => r.json())
        .then(data => setHltbInfo(data))
        .catch(() => {});
    }
  }, [selectedGame]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGame) return;

    setSubmitting(true);
    try {
      const url = editingId ? `/api/submissions/${editingId}` : '/api/submissions';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
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
          completionStatus: formData.completionStatus,
          platform: formData.platform,
          calculatedScore: scorePreview,
          notes: formData.notes,
          steam_appid: selectedGame.steam_appid || null
        })
      });

      if (res.ok) {
        handleResetForm();
        fetchSubmissions();
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('Server submission error:', data);
        alert(`Submission failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Client submission exception:', err);
      alert('Failed to submit game. Check console for details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (sub: any) => {
    // We always want to edit existing entries as per requirements
    setEditingId(sub.id);
    
    setSelectedGame({
      id: sub.game_id,
      title: sub.game_name,
      image: sub.game_image,
      steam_appid: sub.steam_appid || null
    });
    setFormData({
      achievementsEarned: String(sub.achievements_during),
      hoursPlayed: String(sub.hours_during),
      achievementsBefore: String(sub.achievements_before),
      hoursBefore: String(sub.hours_before),
      completionStatus: sub.completion_status || 'beaten',
      platform: sub.platform || 'Steam',
      notes: sub.notes || ''
    });
    setSteamVerifyMsg(null);
    setSteamTotalStats(null);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this submission?')) return;

    try {
      const res = await fetch(`/api/submissions/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSubmissions(prev => prev.filter(s => s.id !== id));
      } else {
        const data = await res.json();
        alert(`Delete failed: ${data.error}`);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete submission');
    }
  };

  const handleResetForm = () => {
    setShowForm(false);
    setSelectedGame(null);
    setEditingId(null);
      setFormData({ 
        achievementsEarned: '', 
        hoursPlayed: '', 
        achievementsBefore: '0', 
        hoursBefore: '0', 
        completionStatus: 'unfinished',
        platform: 'Steam',
        notes: '' 
      });
    setSearchResults([]);
    setGameSearch('');
    setSteamVerifyMsg(null);
    setSteamTotalStats(null);
  };

  const handleVerifySteam = async () => {
    if (!selectedGame) return;
    setVerifyingSteam(true);
    setSteamVerifyMsg({ type: 'info', text: 'Verifying ownership...' });
    setSteamTotalStats(null);

    try {
      let appId = selectedGame.steam_appid;
      let url = `/api/steam/check-ownership/${appId}`;
      
      if (!appId) {
        url = `/api/steam/check-ownership-by-name?name=${encodeURIComponent(selectedGame.title)}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.owned) {
        const totalHours = data.playtime_forever / 60;
        const totalAchievements = data.achievements || 0;
        
        setSteamTotalStats({
          hours: totalHours,
          achievements: totalAchievements
        });
        
        setSteamVerifyMsg({ 
          type: 'success', 
          text: `Verified! Found game on Steam.` 
        });
      } else {
        setSteamVerifyMsg({ 
          type: 'error', 
          text: 'Game not found in your Steam library. Please verify the game name or check your profile privacy.' 
        });
      }
    } catch (err) {
      setSteamVerifyMsg({ type: 'error', text: 'Failed to verify with Steam. API error.' });
    } finally {
      setVerifyingSteam(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 mb-12">
        <div>
          <h1 className="text-2xl font-bold mb-2 dark:text-white text-slate-900">Welcome!</h1>
          <p className="opacity-60 dark:text-white text-slate-600">Ready to add your games?</p>
        </div>
        <button 
          onClick={() => setShowForm(true)}
          className={cn("w-full sm:w-auto text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2", theme.bg, theme.glow)}
        >
          <Plus size={20} />
          Submit Game
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className={cn(
            "dark:bg-[#151515] bg-white border rounded-3xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200 mt-20 mb-20",
            theme.glow
          )}>
            <div className="p-8">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-bold dark:text-white text-slate-900">New Submission</h2>
                  <p className="text-sm opacity-50 mt-1 dark:text-white text-slate-500">Submit your progress for the current event</p>
                </div>
                <button onClick={handleResetForm} className="text-slate-400 dark:text-white/20 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              {!selectedGame ? (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <label className="text-xs uppercase font-bold opacity-30 tracking-widest dark:text-white text-slate-500">Search Game</label>
                    <div className="relative group">
                      <Search className={cn(
                        "absolute left-4 top-1/2 -translate-y-1/2 transition-colors",
                        searching ? theme.text : `text-slate-300 dark:text-white/20 group-focus-within:${theme.text}`
                      )} size={18} />
                      <input 
                        type="text"
                        placeholder="Start typing a game title..."
                        className={cn("w-full dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl py-4 pl-12 pr-4 focus:outline-none transition-all font-sans text-sm dark:text-white text-slate-900", `focus:${theme.border}/50`)}
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

                  {searchError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-red-400 text-xs font-bold flex items-center justify-center gap-2">
                      <XCircle size={16} />
                      {searchError}
                    </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                      <div className="text-[10px] uppercase font-bold opacity-30 px-1 dark:text-white text-slate-500">Suggestions</div>
                      <div className="max-h-[350px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {searchResults.map((game) => (
                          <button
                            key={game.id}
                            onClick={() => {
                              setSelectedGame(game);
                              setSteamVerifyMsg(null);
                              setSteamTotalStats(null);
                            }}
                            type="button"
                            className="w-full flex gap-4 p-3 dark:bg-white/5 bg-slate-50 hover:dark:bg-white/10 hover:bg-slate-100 border dark:border-white/5 border-slate-200 rounded-xl transition-all text-left items-center group"
                          >
                            <img src={game.image} className="w-16 h-20 object-cover rounded-lg shadow-lg group-hover:scale-105 transition-transform" alt="" referrerPolicy="no-referrer" />
                            <div className="flex-1 min-w-0">
                              <h4 className={cn("font-bold text-sm transition-colors truncate dark:text-white text-slate-800", `group-hover:${theme.text}`)}>{game.title}</h4>
                              {game.summary && <p className="text-[10px] opacity-40 line-clamp-2 mt-1 dark:text-white text-slate-500">{game.summary}</p>}
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
                  <div className="flex gap-4 p-4 dark:bg-white/5 bg-slate-50 rounded-2xl border dark:border-white/5 border-slate-200">
                    <img src={selectedGame.image} className="w-24 h-14 object-cover rounded-lg" alt="" />
                    <div className="flex-1">
                      <h3 className="font-bold dark:text-white text-slate-900">{selectedGame.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1">
                        <button 
                          type="button"
                          onClick={() => setSelectedGame(null)}
                          className={cn("text-[10px] uppercase font-bold hover:underline", theme.text)}
                        >
                          Change Game
                        </button>
                        {selectedGame.steam_appid && (
                           <a 
                             href={`https://store.steampowered.com/app/${selectedGame.steam_appid}`} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="flex items-center gap-1.5 text-[10px] font-bold dark:text-white/40 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                           >
                             <img src="https://www.google.com/s2/favicons?domain=steampowered.com&sz=16" className="w-3 h-3" alt="" />
                             Steam
                           </a>
                        )}
                        {hltbInfo && !hltbInfo.notFound && (
                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                             <span className="text-amber-500/80">Main: {hltbInfo.hltb_main}h</span>
                             <span className="opacity-20">|</span>
                             <span className="text-purple-400/80">Comp: {hltbInfo.hltb_completionist}h</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                    <div className="col-span-1 space-y-2">
                       <label className="text-xs font-bold opacity-40 dark:text-white text-slate-500">Platform</label>
                       <select 
                         className={cn("w-full dark:bg-[#111] bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl p-3 focus:outline-none dark:text-white text-slate-900", `focus:${theme.border}/50`)}
                         value={formData.platform}
                         onChange={(e) => {
                           const val = e.target.value;
                           setFormData({...formData, platform: val});
                           if (val === 'Steam') {
                             handleVerifySteam();
                           } else {
                             setSteamVerifyMsg(null);
                           }
                         }}
                       >
                         {['Steam', 'Epic Games', 'Nintendo', 'Xbox', 'PlayStation', 'GoG', 'Others'].map(p => (
                           <option key={p} value={p}>{p}</option>
                         ))}
                       </select>
                    </div>

                    <div className="col-span-1 space-y-2">
                      <label className="text-xs font-bold opacity-40 dark:text-white text-slate-500">Steam Verification</label>
                      <div className="h-11 flex items-center">
                        {formData.platform === 'Steam' ? (
                          <button 
                            type="button"
                            disabled={verifyingSteam}
                            onClick={handleVerifySteam}
                            className={cn(
                              "text-[10px] font-bold px-4 py-2 rounded-lg border transition-all flex items-center gap-2",
                              verifyingSteam ? "opacity-50" : "hover:bg-white/5"
                            )}
                          >
                            {verifyingSteam ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                            {verifyingSteam ? 'Verifying...' : 'Check Ownership'}
                          </button>
                        ) : (
                          <span className="text-[10px] opacity-20 italic">Only for Steam</span>
                        )}
                      </div>
                    </div>

                    {steamVerifyMsg && (
                      <div className={cn(
                        "col-span-2 p-3 rounded-xl text-[10px] font-bold flex items-center gap-2",
                        steamVerifyMsg.type === 'error' ? "bg-red-500/10 border border-red-500/20 text-red-400" :
                        steamVerifyMsg.type === 'success' ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" :
                        "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                      )}>
                        {steamVerifyMsg.type === 'error' && <AlertCircle size={14} />}
                        {steamVerifyMsg.type === 'success' && <CheckCircle2 size={14} />}
                        {steamVerifyMsg.type === 'info' && <Loader2 size={14} className="animate-spin" />}
                        {steamVerifyMsg.text}
                      </div>
                    )}

                    <div className="space-y-2 col-span-2">
                       <label className="text-xs font-bold opacity-40 dark:text-white text-slate-500">Completion Status</label>
                       <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                         {(['unfinished', 'beaten', 'completed', 'abandoned'] as const).map((s) => (
                           <button
                            key={s}
                            type="button"
                            onClick={() => setFormData({...formData, completionStatus: s})}
                            className={cn(
                              "py-2 px-1 text-[10px] font-bold uppercase rounded-lg border transition-all truncate",
                              formData.completionStatus === s 
                                ? `${theme.bg} text-white ${theme.border}` 
                                : "dark:bg-white/5 bg-slate-50 border-black/5 dark:border-white/5 opacity-40 hover:opacity-100"
                            )}
                           >
                             {s}
                           </button>
                         ))}
                       </div>
                       {formData.completionStatus === 'completed' && (
                         <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-1">
                           <CheckCircle2 size={10} /> +20 Completion Bonus Applied
                         </div>
                       )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold opacity-40 dark:text-white text-slate-500">Achievements Earned</label>
                      <input 
                        required
                        type="number"
                        placeholder="0"
                        className={cn("w-full dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl p-3 focus:outline-none dark:text-white text-slate-900", `focus:${theme.border}/50`)}
                        value={formData.achievementsEarned}
                        onChange={(e) => setFormData({...formData, achievementsEarned: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold opacity-40 dark:text-white text-slate-500">Hours Played (Event)</label>
                      <input 
                        required
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        className={cn("w-full dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl p-3 focus:outline-none dark:text-white text-slate-900", `focus:${theme.border}/50`)}
                        value={formData.hoursPlayed}
                        onChange={(e) => setFormData({...formData, hoursPlayed: e.target.value})}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold opacity-40 uppercase tracking-tighter dark:text-white text-slate-500">Achievements (Before)</label>
                      <input 
                        required
                        type="number"
                        placeholder="0"
                        className={cn("w-full dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl p-3 focus:outline-none dark:text-white text-slate-900", `focus:${theme.border}/50`)}
                        value={formData.achievementsBefore}
                        onChange={(e) => setFormData({...formData, achievementsBefore: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold opacity-40 uppercase tracking-tighter dark:text-white text-slate-500">Hours (Before)</label>
                      <input 
                        required
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        className={cn("w-full dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl p-3 focus:outline-none dark:text-white text-slate-900", `focus:${theme.border}/50`)}
                        value={formData.hoursBefore}
                        onChange={(e) => setFormData({...formData, hoursBefore: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="p-4 dark:bg-white/5 bg-slate-50 rounded-2xl border dark:border-white/5 border-slate-200 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">Multiplier</span>
                      <span className="text-xl font-black text-blue-400">{multiplierPreview.toFixed(1)}x</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">Score Preview</span>
                      <span className={cn("text-2xl font-black", theme.text)}>{scorePreview} <span className="text-xs opacity-50 font-sans">PTS</span></span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold opacity-40 dark:text-white text-slate-500">Proof Link / Notes (Optional)</label>
                    <textarea 
                      placeholder="Any links to screenshots or other notes such as 'played on Epic' or 'will update later'..."
                      className={cn("w-full dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl p-4 focus:outline-none min-h-[100px] resize-none dark:text-white text-slate-900", `focus:${theme.border}/50`)}
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
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
        <h2 className="text-xl font-bold">My submissions</h2>
        
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'unfinished', 'beaten', 'completed', 'abandoned'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setCompletionFilter(status)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border",
                completionFilter === status 
                  ? theme.bg + " text-white " + theme.border
                  : "dark:bg-white/5 bg-black/5 dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900 border-transparent"
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>
      
      {loading ? (
        <div className="text-center py-24 opacity-30 animate-pulse dark:text-white text-slate-400">Loading submissions...</div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed dark:border-white/5 border-slate-200 rounded-3xl">
          <History size={48} className="mx-auto text-slate-300 dark:text-white/10 mb-4" />
          <p className="opacity-40 font-medium dark:text-white text-slate-800">No submissions yet.</p>
          <p className="text-sm opacity-20 mt-1 dark:text-white text-slate-600">Your game progress will appear here once submitted.</p>
        </div>
      ) : (
        <div className="mb-12">
          <h3 className="text-xs uppercase tracking-widest font-bold opacity-30 mb-6 dark:text-white text-slate-500">Current event</h3>
          
          {filteredSubmissions.length === 0 ? (
            <div className="text-center py-12 dark:bg-white/5 bg-black/5 rounded-2xl border border-dashed dark:border-white/10 border-slate-200">
               <p className="text-xs font-bold uppercase tracking-widest opacity-30 dark:text-white text-slate-500">Nothing to see here</p>
               <p className="text-[10px] opacity-20 mt-1 dark:text-white text-slate-600 italic">No entries match the selected filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredSubmissions.map((sub) => (
                <div key={sub.id} className="flex flex-col gap-3 group">
                <div className={cn(
                  "aspect-[3/4] dark:bg-[#111111] bg-white rounded-xl overflow-hidden border relative shadow-xl transition-all duration-300",
                  "dark:border-white/5 border-slate-200",
                  theme.glow,
                  "group-hover:shadow-[0_0_25px_-5px_rgba(0,0,0,0.2)]"
                )}>
                   <img 
                     src={sub.game_image} 
                     alt={sub.game_name} 
                     className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                     referrerPolicy="no-referrer"
                   />
                   
                    {/* Link Overlays */}
                   <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 z-10">
                       {hltbData[sub.game_name] && !hltbData[sub.game_name].notFound && (
                        <div 
                          className="w-10 h-10 rounded-xl bg-amber-500 border border-amber-600 flex flex-col items-center justify-center shadow-xl transition-all hover:scale-110 group/hltb relative"
                          title={`HLTB Main: ${hltbData[sub.game_name].hltb_main}h | Extra: ${hltbData[sub.game_name].hltb_extras}h | Completionist: ${hltbData[sub.game_name].hltb_completionist}h`}
                        >
                          <span className="text-[10px] font-black text-white leading-none">HLTB</span>
                          <span className="text-[8px] font-bold text-white/80 mt-0.5">{hltbData[sub.game_name].hltb_main}h</span>
                          
                          {/* Hover Details Popover */}
                          <div className="absolute top-0 right-full mr-2 opacity-0 group-hover/hltb:opacity-100 transition-opacity pointer-events-none bg-black/90 border border-white/10 p-2 rounded-lg shadow-2xl flex flex-col gap-1 min-w-[100px] z-50">
                            <div className="flex justify-between items-center gap-4">
                              <span className="text-[8px] uppercase font-bold text-white/40">Main</span>
                              <span className="text-[10px] font-bold text-amber-500">{hltbData[sub.game_name].hltb_main}h</span>
                            </div>
                            <div className="flex justify-between items-center gap-4">
                              <span className="text-[8px] uppercase font-bold text-white/40">Extra</span>
                              <span className="text-[10px] font-bold text-blue-400">{hltbData[sub.game_name].hltb_extras}h</span>
                            </div>
                            <div className="flex justify-between items-center gap-4">
                              <span className="text-[8px] uppercase font-bold text-white/40">Complete</span>
                              <span className="text-[10px] font-bold text-purple-400">{hltbData[sub.game_name].hltb_completionist}h</span>
                            </div>
                          </div>
                        </div>
                      )}
                   </div>
                   
                   <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 gap-4">
                      <div className="flex flex-col items-center gap-1">
                         <div className="flex items-center gap-2 text-xs font-bold text-white">
                            🏆 {sub.achievements_during}
                         </div>
                         <div className="flex items-center gap-2 text-xs font-bold text-white">
                            🕒 {sub.hours_during}h
                         </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 w-full max-w-[120px]">
                        {(sub.status === 'pending' || sub.status === 'rejected' || (sub.status === 'verified' && ['unfinished', 'abandoned', 'beaten'].includes(sub.completion_status))) && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(sub);
                            }}
                            className="w-full bg-white/20 hover:bg-white/30 text-white rounded-lg py-2 font-bold text-[10px] uppercase transition-all"
                          >
                            Edit
                          </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(sub.id);
                          }}
                          className="w-full bg-red-500/20 hover:bg-red-500/40 text-red-500 hover:text-white rounded-lg py-2 font-bold text-[10px] uppercase transition-all border border-red-500/20"
                        >
                          Delete
                        </button>
                      </div>

                      <div className="text-[10px] opacity-60 font-bold text-white">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </div>
                   </div>
                </div>
                <div className="flex flex-col gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm truncate dark:text-white text-slate-800 capitalize flex-1">{sub.game_name}</h4>
                  </div>
                  {hltbData[sub.game_name]?.notFound && (
                     <div className="text-[9px] font-bold text-slate-400 opacity-40 uppercase">HLTB Stats Not Found</div>
                  )}
                  {(!hltbData[sub.game_name]) && (
                     <div className="text-[9px] font-bold text-blue-400 animate-pulse uppercase">Fetching HLTB data...</div>
                  )}
                  <div className="flex items-center gap-2">
                    {sub.status === 'verified' ? (
                      <>
                        <CheckCircle2 size={14} className="text-emerald-400" />
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">Submission accepted</span>
                      </>
                    ) : sub.status === 'rejected' ? (
                      <>
                        <XCircle size={14} className="text-red-400" />
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-tighter">Submission rejected</span>
                      </>
                    ) : (
                      <>
                        <Clock size={14} className="text-amber-400" />
                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-tighter">Pending review</span>
                      </>
                    )}
                  </div>
                  {sub.status === 'rejected' && sub.rejection_reason && (
                    <div className="p-2 bg-red-500/5 border border-red-500/10 rounded-lg text-[9px] text-red-300 leading-tight italic">
                      <span className="font-bold uppercase opacity-50 block mb-1">Reason:</span>
                      {sub.rejection_reason}
                    </div>
                  )}
                  {sub.status === 'verified' && (
                    <div className="text-[9px] font-bold opacity-40">
                      Awarded {sub.points || 0} PTS
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

      <div className="mt-12">
        <h3 className="text-xs uppercase tracking-widest font-bold opacity-30 mb-6 dark:text-white text-slate-500">Past events</h3>
        <div className="text-center py-12 dark:bg-white/5 bg-slate-50 rounded-2xl border border-dashed dark:border-white/5 border-black/5">
          <p className="text-xs font-bold uppercase tracking-widest opacity-30 dark:text-white text-slate-500">Nothing to see here...</p>
        </div>
      </div>
    </div>
  );
}

