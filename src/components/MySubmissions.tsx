import React from 'react';
import { History, CheckCircle2, AlertCircle, Plus, Search, Loader2, XCircle, Clock, ChevronLeft, ChevronRight, Gamepad2 } from 'lucide-react';
import { Submission, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface SubmissionNotesMeta {
  hasNoAchievements: boolean;
  level?: number;
  userNotes: string;
}

export function parseNotesMeta(notes: string): SubmissionNotesMeta {
  if (notes && notes.startsWith('__META_START__')) {
    const endIdx = notes.indexOf('__META_END__');
    if (endIdx !== -1) {
      try {
        const jsonStr = notes.slice('__META_START__'.length, endIdx);
        const meta = JSON.parse(jsonStr);
        const userNotes = notes.slice(endIdx + '__META_END__'.length);
        return {
          hasNoAchievements: !!meta.hasNoAchievements,
          level: meta.level,
          userNotes
        };
      } catch (e) {
        // Fallback
      }
    }
  }
  return {
    hasNoAchievements: false,
    level: undefined,
    userNotes: notes || ''
  };
}

export function serializeNotesMeta(hasNoAchievements: boolean, level: number | undefined, userNotes: string): string {
  if (hasNoAchievements) {
    return `__META_START__${JSON.stringify({ hasNoAchievements, level })}__META_END__${userNotes}`;
  }
  return userNotes;
}

export function calculateNonAchievementPoints(level: number, hoursPlayed: number, hltb: { hltb_main?: number, hltb_extras?: number }, completionStatus: string): number {
  let basePoints = 20;
  if (hoursPlayed >= 50) {
    basePoints = 200;
  } else if (hoursPlayed >= 25) {
    basePoints = 100;
  } else if (hoursPlayed >= 15) {
    basePoints = 75;
  } else if (hoursPlayed >= 8) {
    basePoints = 40;
  } else {
    basePoints = 20;
  }

  if (level === 0) {
    return Math.round(basePoints * 0.1);
  } else if (level === 1) {
    return Math.round(basePoints * 0.4);
  } else { // Level 2
    const bonus = completionStatus === 'completed' ? 20 : 0;
    return basePoints + bonus;
  }
}

export default function MySubmissions() {
  const { user, theme } = useAuth();
  const [submissions, setSubmissions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hltbData, setHltbData] = React.useState<Record<string, any>>({});
  const [showForm, setShowForm] = React.useState(false);
  const [gameSearch, setGameSearch] = React.useState('');
  const [igdbIdSearch, setIgdbIdSearch] = React.useState('');
  const [steamAppIdSearch, setSteamAppIdSearch] = React.useState('');
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
    notes: '',
    hasNoAchievements: false,
    level: 2
  });
  const [verifyingSteam, setVerifyingSteam] = React.useState(false);
  const [steamVerifyMsg, setSteamVerifyMsg] = React.useState<{type: 'error' | 'success' | 'info', text: string} | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [steamTotalStats, setSteamTotalStats] = React.useState<{hours: number, achievements: number} | null>(null);
  const [completionFilter, setCompletionFilter] = React.useState<'all' | 'unfinished' | 'beaten' | 'completed' | 'abandoned' | 'pending'>('all');
  const [submissionsSearchQuery, setSubmissionsSearchQuery] = React.useState('');
  const [activeMobileCard, setActiveMobileCard] = React.useState<string | null>(null);

  const [events, setEvents] = React.useState<any[]>([]);
  const [pastEventsPage, setPastEventsPage] = React.useState(1);
  const [cols, setCols] = React.useState(6);

  React.useEffect(() => {
    const getCols = () => {
      if (typeof window === 'undefined') return 6;
      if (window.innerWidth >= 1280) return 6; // xl: xl-grid-cols-6
      if (window.innerWidth >= 1024) return 5; // lg: lg-grid-cols-5
      if (window.innerWidth >= 768) return 4;  // md: md-grid-cols-4
      if (window.innerWidth >= 640) return 3;  // sm: sm-grid-cols-3
      return 2;                                // xs: xs-grid-cols-2
    };
    setCols(getCols());
    const handleResize = () => setCols(getCols());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        setEvents(Array.isArray(data) ? data : []);
      })
      .catch(err => console.error('Failed to fetch events:', err));
  }, []);

  React.useEffect(() => {
    setPastEventsPage(1);
  }, [submissionsSearchQuery, completionFilter]);

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
    // Filter out "Event Update" (system notification) and "Screenshot Points" (adjustments) from entries
    let result = submissions.filter(s => s.game_name !== 'Event Update' && s.game_name !== 'Screenshot Points');
    if (completionFilter !== 'all') {
      if (completionFilter === 'pending') {
        result = result.filter(s => s.status === 'pending');
      } else {
        result = result.filter(s => s.completion_status === completionFilter);
      }
    }
    if (submissionsSearchQuery.trim()) {
      const q = submissionsSearchQuery.toLowerCase().trim();
      result = result.filter(s => s.game_name && s.game_name.toLowerCase().includes(q));
    }
    return result;
  }, [submissions, completionFilter, submissionsSearchQuery]);

  const activeEventIds = React.useMemo(() => {
    return new Set(events.filter(e => e.is_active).map(e => e.id));
  }, [events]);

  const inactiveEventIds = React.useMemo(() => {
    return new Set(events.filter(e => !e.is_active).map(e => e.id));
  }, [events]);

  const currentEventSubmissions = React.useMemo(() => {
    const active = events.find(e => e.is_active);
    const startTime = active ? new Date(active.start_date || active.start_date).getTime() : Infinity;
    return filteredSubmissions.filter(sub => {
      if (events.length === 0) return true;
      const subTime = new Date(sub.created_at || 0).getTime();
      if (subTime >= startTime) return true;
      if (!sub.event_id) return true;
      return activeEventIds.has(sub.event_id);
    });
  }, [filteredSubmissions, events, activeEventIds]);

  const pastEventSubmissions = React.useMemo(() => {
    const active = events.find(e => e.is_active);
    const startTime = active ? new Date(active.start_date || active.start_date).getTime() : Infinity;
    return filteredSubmissions.filter(sub => {
      if (events.length === 0) return false;
      const subTime = new Date(sub.created_at || 0).getTime();
      if (subTime >= startTime) return false;
      if (!sub.event_id) return false;
      return inactiveEventIds.has(sub.event_id);
    });
  }, [filteredSubmissions, events, inactiveEventIds]);

  const pastItemsPerPage = cols * 3;
  const totalPastPages = Math.ceil(pastEventSubmissions.length / pastItemsPerPage);
  const paginatedPastSubmissions = React.useMemo(() => {
    return pastEventSubmissions.slice(
      (pastEventsPage - 1) * pastItemsPerPage,
      pastEventsPage * pastItemsPerPage
    );
  }, [pastEventSubmissions, pastEventsPage, pastItemsPerPage]);

  const scorePreview = React.useMemo(() => {
    const isNoAchievements = formData.hasNoAchievements || formData.platform === 'Nintendo';
    if (isNoAchievements) {
      const hoursPlayed = parseFloat(formData.hoursPlayed) || 0;
      const hoursBefore = parseFloat(formData.hoursBefore) || 0;
      const finalHours = Math.max(0, hoursPlayed - hoursBefore);
      const gameTitle = selectedGame?.title || '';
      const hltb = hltbData[gameTitle] || { hltb_main: 0, hltb_extras: 0 };
      return calculateNonAchievementPoints(formData.level, finalHours, hltb, formData.completionStatus);
    }

    const earned = parseInt(formData.achievementsEarned) || 0;
    let bonus = 0;
    if (formData.completionStatus === 'completed') {
      bonus = 30;
    } else if (formData.completionStatus === 'beaten') {
      bonus = 15;
    }
    return Math.round(earned * multiplierPreview) + bonus;
  }, [formData.hasNoAchievements, formData.platform, formData.level, formData.hoursPlayed, formData.hoursBefore, selectedGame, hltbData, formData.achievementsEarned, multiplierPreview, formData.completionStatus]);

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
    if (!gameSearch.trim() && !igdbIdSearch.trim() && !steamAppIdSearch.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        let url = '';
        if (steamAppIdSearch.trim()) {
          url = `/api/games/search?steamAppId=${encodeURIComponent(steamAppIdSearch.trim())}`;
        } else if (igdbIdSearch.trim()) {
          url = `/api/games/search?igdbId=${encodeURIComponent(igdbIdSearch.trim())}`;
        } else {
          url = `/api/games/search?query=${encodeURIComponent(gameSearch.trim())}`;
        }

        const res = await fetch(url);
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
  }, [gameSearch, igdbIdSearch, steamAppIdSearch]);

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

    const earned = parseInt(formData.achievementsEarned) || 0;
    const hours = parseFloat(formData.hoursPlayed) || 0;
    const isNintendo = formData.platform === 'Nintendo';
    const hasNoAchievements = formData.hasNoAchievements === true;

    if (earned < 0) {
      alert("Achievements earned can't be negative.");
      return;
    }

    if (earned === 0 && !isNintendo && !hasNoAchievements) {
      alert("You must submit at least 1 achievement (or check 'Game has no achievements').");
      return;
    }
    if (hours <= 0) {
      alert("Hours can't be 0.");
      return;
    }

    const isNoAchievements = formData.hasNoAchievements || formData.platform === 'Nintendo';
    const serializedNotes = serializeNotesMeta(isNoAchievements, formData.level, formData.notes);

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
          notes: serializedNotes,
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
      image: sub.game_name === 'Screenshot Points' || sub.game_image?.includes('1471391') ? 'https://i.ibb.co/gZPKx2qh/gwg-extra-points.png' : sub.game_image,
      steam_appid: sub.steam_appid || null
    });
    const meta = parseNotesMeta(sub.notes || '');
    setFormData({
      achievementsEarned: String(sub.achievements_during),
      hoursPlayed: String(sub.hours_during),
      achievementsBefore: String(sub.achievements_before),
      hoursBefore: String(sub.hours_before),
      completionStatus: sub.completion_status || 'beaten',
      platform: sub.platform || 'Steam',
      notes: meta.userNotes,
      hasNoAchievements: meta.hasNoAchievements,
      level: meta.level !== undefined ? meta.level : 2
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
      notes: '',
      hasNoAchievements: false,
      level: 2
    });
    setSearchResults([]);
    setGameSearch('');
    setIgdbIdSearch('');
    setSteamAppIdSearch('');
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start md:items-center justify-center p-4 overflow-y-auto">
          <div className={cn(
            "dark:bg-[#151515] bg-white border rounded-3xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 my-auto",
            theme.glow
          )}>
            <div className="p-4 sm:p-8">
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
                    
                    {/* Game Name Search Box */}
                    <div className="relative group w-full">
                      <Search className={cn(
                        "absolute left-4 top-1/2 -translate-y-1/2 transition-colors",
                        searching && !igdbIdSearch.trim() && !steamAppIdSearch.trim() ? theme.text : `text-slate-300 dark:text-white/20 group-focus-within:${theme.text}`
                      )} size={18} />
                      <input 
                        type="text"
                        placeholder="Start typing a game title..."
                        className={cn("w-full dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl py-4 pl-12 pr-4 focus:outline-none transition-all font-sans text-sm dark:text-white text-slate-900", `focus:${theme.border}/50`)}
                        value={gameSearch}
                        onChange={(e) => {
                          setGameSearch(e.target.value);
                          if (e.target.value.trim()) {
                            setIgdbIdSearch('');
                            setSteamAppIdSearch('');
                          }
                        }}
                      />
                      {searching && !igdbIdSearch.trim() && !steamAppIdSearch.trim() && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                          <Loader2 className={cn("animate-spin", theme.text)} size={18} />
                        </div>
                      )}
                    </div>

                    {/* Separator / Divider */}
                    <div className="flex items-center py-2">
                      <div className="flex-1 border-t border-slate-200 dark:border-white/5"></div>
                      <span className="px-3 text-[10px] uppercase tracking-wider opacity-30 dark:text-white text-slate-500 font-bold">or</span>
                      <div className="flex-1 border-t border-slate-200 dark:border-white/5"></div>
                    </div>

                    {/* STEAM BOX and IGDB BOX layout side-by-side */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* STEAM BOX */}
                      <div className="relative group">
                        <input 
                          type="text"
                          placeholder="Steam App ID"
                          className={cn("w-full text-center dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl py-4 px-4 focus:outline-none transition-all font-sans text-sm dark:text-white text-slate-900", `focus:${theme.border}/50`)}
                          value={steamAppIdSearch}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setSteamAppIdSearch(val);
                            if (val.trim()) {
                              setGameSearch('');
                              setIgdbIdSearch('');
                            }
                          }}
                        />
                        {searching && steamAppIdSearch.trim() && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <Loader2 className={cn("animate-spin", theme.text)} size={14} />
                          </div>
                        )}
                      </div>

                      {/* IGDB BOX */}
                      <div className="relative group">
                        <input 
                          type="text"
                          placeholder="IGDB ID"
                          className={cn("w-full text-center dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl py-4 px-4 focus:outline-none transition-all font-sans text-sm dark:text-white text-slate-900", `focus:${theme.border}/50`)}
                          value={igdbIdSearch}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setIgdbIdSearch(val);
                            if (val.trim()) {
                              setGameSearch('');
                              setSteamAppIdSearch('');
                            }
                          }}
                        />
                        {searching && igdbIdSearch.trim() && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <Loader2 className={cn("animate-spin", theme.text)} size={14} />
                          </div>
                        )}
                      </div>
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
                           const isNintendo = val === 'Nintendo';
                           setFormData(prev => ({
                             ...prev,
                             platform: val,
                             hasNoAchievements: isNintendo ? true : prev.hasNoAchievements,
                             achievementsEarned: isNintendo ? '0' : prev.achievementsEarned === '0' ? '' : prev.achievementsEarned
                           }));
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
                       {formData.completionStatus === 'beaten' && (
                         <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-1">
                           <CheckCircle2 size={10} /> +15 Beaten Bonus Applied
                         </div>
                       )}
                       {formData.completionStatus === 'completed' && (
                         <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-1">
                           <CheckCircle2 size={10} /> +30 Completion Bonus Applied
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

                    <div className="col-span-2 flex items-center gap-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl p-3">
                      <input
                        type="checkbox"
                        id="hasNoAchievements"
                        checked={formData.hasNoAchievements || formData.platform === 'Nintendo'}
                        disabled={formData.platform === 'Nintendo'}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormData(prev => ({
                            ...prev,
                            hasNoAchievements: checked,
                            achievementsEarned: checked ? '0' : prev.achievementsEarned === '0' ? '' : prev.achievementsEarned
                          }));
                        }}
                        className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 dark:bg-black/30 cursor-pointer"
                      />
                      <label htmlFor="hasNoAchievements" className="text-xs font-bold dark:text-white/80 text-slate-700 select-none cursor-pointer">
                        Game has no achievements or is on Nintendo.
                      </label>
                    </div>

                    {(formData.hasNoAchievements || formData.platform === 'Nintendo') && (() => {
                      const hp = parseFloat(formData.hoursPlayed) || 0;
                      const hb = parseFloat(formData.hoursBefore) || 0;
                      const fh = Math.max(0, hp - hb);
                      const gTitle = selectedGame?.title || '';
                      const hVal = hltbData[gTitle] || { hltb_main: 0, hltb_extras: 0 };
                      const s0 = calculateNonAchievementPoints(0, fh, hVal, formData.completionStatus);
                      const s1 = calculateNonAchievementPoints(1, fh, hVal, formData.completionStatus);
                      const s2 = calculateNonAchievementPoints(2, fh, hVal, formData.completionStatus);

                      return (
                        <div className="col-span-2 space-y-3 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-500/20 rounded-xl p-4">
                          <label className="text-xs font-bold text-amber-500 uppercase tracking-wider block font-sans">No Achievements Category</label>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="dark:bg-black/30 bg-white/50 border border-slate-200 dark:border-white/5 rounded-lg p-2.5 text-center">
                              <span className="block text-[9px] uppercase tracking-wider text-slate-500 dark:text-white/40">Level 0 (x0.1)</span>
                              <span className="text-xs sm:text-sm font-black dark:text-white text-slate-800">{s0} pts</span>
                            </div>
                            <div className="dark:bg-black/30 bg-white/50 border border-slate-200 dark:border-white/5 rounded-lg p-2.5 text-center">
                              <span className="block text-[9px] uppercase tracking-wider text-slate-500 dark:text-white/40">Level 1 (x0.4)</span>
                              <span className="text-xs sm:text-sm font-black dark:text-white text-slate-800">{s1} pts</span>
                            </div>
                            <div className="bg-amber-500/10 dark:bg-amber-500/25 border border-amber-500/20 rounded-lg p-2.5 text-center">
                              <span className="block text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold">Level 2 (Full)</span>
                              <span className="text-xs sm:text-sm font-black text-amber-700 dark:text-amber-300">{s2} pts</span>
                            </div>
                          </div>
                          <p className="text-[10px] dark:text-white/40 text-slate-500 italic leading-normal">
                            Level 0 gives 10% base points (no completion bonus). Level 1 gives 40% base points (no completion bonus). Level 2 gives 100% base points + 20 pts completion bonus (if completed). The final level is set by admins. Remember to send all required proof on Discord, and link the message in the notes!
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="p-4 dark:bg-white/5 bg-slate-50 rounded-2xl border dark:border-white/5 border-slate-200 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">
                        {(formData.hasNoAchievements || formData.platform === 'Nintendo') ? "Award Category" : "Multiplier"}
                      </span>
                      <span className="text-lg font-black text-blue-400">
                        {(formData.hasNoAchievements || formData.platform === 'Nintendo') ? (
                          formData.level === 0 ? "Level 0 (x0.1 HLTB)" : formData.level === 1 ? "Level 1 (x0.4 Time)" : "Level 2 (Full Bracketed)"
                        ) : (
                          `${multiplierPreview.toFixed(1)}x`
                        )}
                      </span>
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full lg:w-auto mt-4 sm:mt-0">
          <h2 className="text-xl font-bold shrink-0">My submissions</h2>
          
          {/* Submissions Search Bar */}
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" size={14} />
            <input
              type="text"
              placeholder="Search my games..."
              value={submissionsSearchQuery}
              onChange={(e) => setSubmissionsSearchQuery(e.target.value)}
              className={cn(
                "w-full dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-200 rounded-xl py-2 pl-9 pr-8 focus:outline-none transition-all font-sans text-xs dark:text-white text-slate-900",
                `focus:${theme.border}/50`
              )}
            />
            {submissionsSearchQuery && (
              <button
                onClick={() => setSubmissionsSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30 hover:dark:text-white hover:text-slate-900 transition-colors"
                title="Clear Search"
              >
                <Plus className="rotate-45" size={14} />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'pending', 'unfinished', 'beaten', 'completed', 'abandoned'] as const).map((status) => (
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
          
          {currentEventSubmissions.length === 0 ? (
            <div className="text-center py-12 dark:bg-white/5 bg-black/5 rounded-2xl border border-dashed dark:border-white/10 border-slate-200">
               <p className="text-xs font-bold uppercase tracking-widest opacity-30 dark:text-white text-slate-500">Nothing to see here...</p>
               <p className="text-[10px] opacity-20 mt-1 dark:text-white text-slate-600 italic">No entries match the selected filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6">
              {currentEventSubmissions.map((sub) => (
                <div 
                  key={sub.id} 
                  className="flex flex-col gap-3 group cursor-pointer lg:cursor-default"
                  onClick={() => setActiveMobileCard(activeMobileCard === sub.id ? null : sub.id)}
                >
                  <div className={cn(
                    "aspect-[3/4] dark:bg-[#111111] bg-white rounded-xl overflow-hidden border relative shadow-xl transition-all duration-300",
                    "dark:border-white/5 border-slate-200",
                    theme.glow,
                    "group-hover:shadow-[0_0_25px_-5px_rgba(0,0,0,0.2)]"
                  )}>
                    <img 
                      src={sub.game_name === 'Screenshot Points' || sub.game_image?.includes('1471391') ? 'https://i.ibb.co/gZPKx2qh/gwg-extra-points.png' : sub.game_image} 
                      alt={sub.game_name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      referrerPolicy="no-referrer"
                    />
                    
                    {/* Link Overlays */}
                    <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 z-10">
                      {hltbData[sub.game_name] && !hltbData[sub.game_name].notFound && (
                        <div 
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-500 border border-amber-600 flex flex-col items-center justify-center shadow-xl transition-all hover:scale-110 group/hltb relative"
                          title={`HLTB Main: ${hltbData[sub.game_name].hltb_main}h | Extra: ${hltbData[sub.game_name].hltb_extras}h | Completionist: ${hltbData[sub.game_name].hltb_completionist}h`}
                        >
                          <span className="text-[8px] sm:text-[10px] font-black text-white leading-none">HLTB</span>
                          <span className="text-[7px] sm:text-[8px] font-bold text-white/80 mt-0.5">{hltbData[sub.game_name].hltb_main}h</span>
                          
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
                    
                    {/* The Click/Hover Overlay */}
                    <div className={cn(
                      "absolute inset-0 bg-black/70 transition-opacity flex flex-col items-center justify-center p-2 sm:p-4 gap-2 sm:gap-4",
                      activeMobileCard === sub.id 
                        ? "opacity-100 pointer-events-auto" 
                        : "opacity-0 pointer-events-none lg:group-hover:opacity-100 lg:group-hover:pointer-events-auto"
                    )}>
                      <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                        <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs font-bold text-white">
                          🏆 {sub.achievements_during}
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs font-bold text-white">
                          🕒 {sub.hours_during}h
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1.5 sm:gap-2 w-full max-w-[120px] px-2 sm:px-0">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(sub);
                          }}
                          className="w-full bg-white/20 hover:bg-white/30 text-white rounded-md sm:rounded-lg py-1.5 sm:py-2 font-bold text-[9px] sm:text-[10px] uppercase transition-all"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(sub.id);
                          }}
                          className="w-full bg-red-500/20 hover:bg-red-500/40 text-red-500 hover:text-white rounded-md sm:rounded-lg py-1.5 sm:py-2 font-bold text-[9px] sm:text-[10px] uppercase transition-all border border-red-500/20"
                        >
                          Delete
                        </button>
                      </div>

                      <div className="text-[8px] sm:text-[10px] opacity-60 font-bold text-white mt-1 sm:mt-0">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  {/* Card Title and Details */}
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
        {pastEventSubmissions.length === 0 ? (
          <div className="text-center py-12 dark:bg-white/5 bg-slate-50 rounded-2xl border border-dashed dark:border-white/5 border-black/5">
            <p className="text-xs font-bold uppercase tracking-widest opacity-30 dark:text-white text-slate-500">Nothing to see here...</p>
            <p className="text-[10px] opacity-20 mt-1 dark:text-white text-slate-600 italic">No past event entries found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 animate-in fade-in duration-300">
              {paginatedPastSubmissions.map((sub) => (
                <div 
                  key={sub.id}
                  className="group relative flex flex-col rounded-2xl overflow-hidden border border-black/5 dark:border-white/5 bg-[#111111] hover:border-blue-500/40 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 min-w-0"
                  onClick={() => setActiveMobileCard(activeMobileCard === sub.id ? null : sub.id)}
                >
                  <div className="aspect-[3/4] relative w-full overflow-hidden bg-black/40">
                    {sub.game_image ? (
                      <img 
                        src={sub.game_name === 'Screenshot Points' || sub.game_image?.includes('1471391') ? 'https://i.ibb.co/gZPKx2qh/gwg-extra-points.png' : sub.game_image} 
                        alt={sub.game_name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center opacity-30 gap-2">
                        <Gamepad2 size={36} />
                        <span className="text-[10px] text-center px-1 truncate w-full font-bold">{sub.game_name}</span>
                      </div>
                    )}

                    {hltbData[sub.game_name] && !hltbData[sub.game_name].notFound && (
                      <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0 z-10 animate-in fade-in slide-in-from-right-1">
                        <div 
                          className="w-8 h-8 rounded-lg bg-amber-500 border border-amber-600 flex flex-col items-center justify-center shadow-xl transition-all hover:scale-110 group/hltb relative"
                          title={`HLTB Main: ${hltbData[sub.game_name].hltb_main}h | Extra: ${hltbData[sub.game_name].hltb_extras}h | Completionist: ${hltbData[sub.game_name].hltb_completionist}h`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[8px] font-black text-white leading-none">HLTB</span>
                          <span className="text-[7px] font-bold text-white/80 mt-0.5">{hltbData[sub.game_name].hltb_main}h</span>
                          
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
                      </div>
                    )}

                    <div className={cn(
                      "absolute inset-0 bg-black/80 transition-opacity flex flex-col items-center justify-center p-2 gap-2 z-10",
                      activeMobileCard === sub.id 
                        ? "opacity-100 pointer-events-auto" 
                        : "opacity-0 pointer-events-none lg:group-hover:opacity-100 lg:group-hover:pointer-events-auto"
                    )}>
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-white">
                          🏆 {sub.achievements_during} Ach
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-white">
                          🕒 {sub.hours_during}h Played
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1 w-full max-w-[100px] px-1">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(sub);
                          }}
                          className="w-full bg-white/20 hover:bg-white/30 text-white rounded-md py-1 font-bold text-[9px] uppercase transition-all"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(sub.id);
                          }}
                          className="w-full bg-red-500/20 hover:bg-red-500/40 text-red-500 hover:text-white rounded-md py-1 font-bold text-[9px] uppercase transition-all border border-red-500/20"
                        >
                          Delete
                        </button>
                      </div>

                      <div className="text-[8px] opacity-60 font-bold text-white mt-1">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 flex flex-col gap-1.5 min-w-0 bg-white/5">
                    <h3 className="font-bold text-sm dark:text-white text-slate-800 truncate capitalize" title={sub.game_name}>
                      {sub.game_name}
                    </h3>
                    
                    {hltbData[sub.game_name]?.notFound && (
                       <div className="text-[9px] font-bold text-slate-400 opacity-40 uppercase">HLTB Not Found</div>
                    )}
                    {(!hltbData[sub.game_name]) && (
                       <div className="text-[9px] font-bold text-blue-400 animate-pulse uppercase">Fetching HLTB...</div>
                    )}

                    <div className="flex items-center gap-2">
                      {sub.status === 'verified' ? (
                        <>
                          <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                          <span className="text-[9px] font-extrabold text-emerald-400 uppercase tracking-tighter truncate">Accepted</span>
                        </>
                      ) : sub.status === 'rejected' ? (
                        <>
                          <XCircle size={12} className="text-red-400 shrink-0" />
                          <span className="text-[9px] font-extrabold text-red-500 uppercase tracking-tighter truncate">Rejected</span>
                        </>
                      ) : (
                        <>
                          <Clock size={12} className="text-amber-400 shrink-0" />
                          <span className="text-[9px] font-extrabold text-amber-500 uppercase tracking-tighter truncate">Pending</span>
                        </>
                      )}
                    </div>
                    {sub.status === 'rejected' && sub.rejection_reason && (
                      <div className="p-2 bg-red-500/5 border border-red-500/10 rounded-lg text-[9px] text-red-300 leading-tight italic truncate" title={sub.rejection_reason}>
                        <span className="font-bold uppercase opacity-50 block mb-0.5">Reason:</span>
                        {sub.rejection_reason}
                      </div>
                    )}
                    {sub.status === 'verified' && (
                      <div className="text-[9px] font-extrabold opacity-40 uppercase tracking-tighter">
                        Awarded {sub.points || 0} PTS
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {totalPastPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-4">
                <button
                  disabled={pastEventsPage === 1}
                  onClick={() => setPastEventsPage(prev => prev - 1)}
                  className="p-2 rounded-xl bg-white/5 border border-white/5 disabled:opacity-20 hover:bg-white/10 transition-all"
                  title="Previous Page"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold opacity-60">Page</span>
                  <span className={cn("text-sm font-bold", theme.text)}>{pastEventsPage}</span>
                  <span className="text-sm font-bold opacity-60">of {totalPastPages}</span>
                </div>
                <button
                  disabled={pastEventsPage === totalPastPages}
                  onClick={() => setPastEventsPage(prev => prev + 1)}
                  className="p-2 rounded-xl bg-white/5 border border-white/5 disabled:opacity-20 hover:bg-white/10 transition-all"
                  title="Next Page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}