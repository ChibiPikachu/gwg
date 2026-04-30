import React from 'react';
import { UserProfile, Team, TEAM_COLORS } from '@/types';
import { useAuth } from '@/components/AuthProvider';
import { Search, Settings, Shield, Clock, CheckCircle2, XCircle, ExternalLink, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type AdminTab = 'users' | 'submissions';

export default function AdminPanel({ onViewProfile, activeAdminTab }: { onViewProfile?: (id: string) => void, activeAdminTab?: AdminTab }) {
  const { user: currentUser, theme } = useAuth();
  const [activeTab, setActiveTab] = React.useState<AdminTab>(activeAdminTab || 'users');

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'admins')) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <Shield className="text-red-500" size={32} />
        </div>
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="opacity-60 max-w-sm">
          You do not have the required permissions to access the Administration Panel.
        </p>
      </div>
    );
  }
  
  React.useEffect(() => {
    if (activeAdminTab) {
      setActiveTab(activeAdminTab);
    }
  }, [activeAdminTab]);
  const [filterTeam, setFilterTeam] = React.useState<Team | 'all'>('all');
  const [users, setUsers] = React.useState<any[]>([]);
  const [submissions, setSubmissions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState<string | null>(null);
  const [selectedUser, setSelectedUser] = React.useState<any | null>(null);
  const [reviewingId, setReviewingId] = React.useState<string | null>(null);
  const [subStatusFilter, setSubStatusFilter] = React.useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  const [settingsUserId, setSettingsUserId] = React.useState<string | null>(null);
  const [pointsAwarded, setPointsAwarded] = React.useState('0');
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [editHours, setEditHours] = React.useState('0');
  const [editAchievements, setEditAchievements] = React.useState('0');
  const [editMultiplier, setEditMultiplier] = React.useState(1);

  const fetchUsers = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } 
  }, []);

  const fetchSubmissions = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/submissions');
      if (res.ok) {
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    }
  }, []);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchSubmissions()]);
    setLoading(false);
  }, [fetchUsers, fetchSubmissions]);

  React.useEffect(() => {
    fetchData();

    if (!isSupabaseConfigured) return;

    const channelProfiles = supabase
      .channel('admin-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
      })
      .subscribe();

    const channelSubmissions = supabase
      .channel('admin-submissions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, () => {
        fetchSubmissions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelProfiles);
      supabase.removeChannel(channelSubmissions);
    };
  }, [fetchData, fetchUsers, fetchSubmissions]);

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
        setUsers(prev => prev.map(u => 
          (u.steamid === targetSteamId) ? { ...u, team: team === 'none' ? null : team } : u
        ));
      } else {
        alert(`Failed to update team: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to update team:', err);
    } finally {
      setUpdating(null);
    }
  };

  const handleKickUser = async (steamId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to KICK ${name}? This will PERMANENTLY delete their profile and all submissions. This action cannot be undone.`)) {
      return;
    }

    setUpdating(steamId);
    try {
      const res = await fetch(`/api/admin/users/${steamId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setUsers(prev => prev.filter(u => u.steamid !== steamId));
        setSettingsUserId(null);
      } else {
        const data = await res.json();
        alert(`Failed to kick: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to kick user');
    } finally {
      setUpdating(null);
    }
  };

  const handleUpdateRole = async (targetSteamId: string, role: 'admin' | 'member') => {
    setUpdating(targetSteamId);
    try {
      const res = await fetch('/api/admin/update-user-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSteamId, role })
      });
      
      if (res.ok) {
        setUsers(prev => prev.map(u => u.steamid === targetSteamId ? { ...u, role } : u));
      } else {
        const data = await res.json();
        alert(`Failed to update role: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to update user role');
    } finally {
      setUpdating(null);
    }
  };

  const handleVerify = async (id: string, status: 'verified' | 'rejected') => {
    if (status === 'rejected' && !rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }
    setUpdating(id);
    try {
      const res = await fetch('/api/admin/verify-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: id,
          status,
          points: Math.round(parseFloat(pointsAwarded) || 0),
          rejectionReason: status === 'rejected' ? rejectionReason : '',
          hours: parseFloat(editHours),
          achievements: parseInt(editAchievements),
          multiplier: editMultiplier
        })
      });

      if (res.ok) {
        setReviewingId(null);
        setRejectionReason('');
        fetchData();
      } else {
        const data = await res.json();
        alert(`Verification failed: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to update submission');
    } finally {
      setUpdating(null);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this submission?')) {
      return;
    }

    setUpdating(id);
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setSubmissions(prev => prev.filter(s => s.id !== id));
      } else {
        const data = await res.json();
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to delete submission');
    } finally {
      setUpdating(null);
    }
  };

  const safeUsers = Array.isArray(users) ? users : [];
  const teamsFilter: Team[] = ['blue', 'green', 'purple', 'red', 'none'];
  const [searchQuery, setSearchQuery] = React.useState('');
  const isAdmin = currentUser?.isAdmin || currentUser?.role === 'admin' || currentUser?.role === 'admins';

  // Handle Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (reviewingId) {
          setReviewingId(null);
        } else if (searchQuery) {
          setSearchQuery('');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reviewingId, searchQuery]);

  const filteredUsers = safeUsers.filter(u => {
    const matchesTeam = filterTeam === 'all' || (u.team || 'none') === filterTeam;
    const matchesSearch = u.steam_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (u.discord_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTeam && matchesSearch;
  });

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
    return <div className="p-8 text-center opacity-50">Loading database...</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-8 md:gap-12">
      <div className="flex flex-col sm:flex-row border-b border-white/5">
        <button 
          onClick={() => setActiveTab('users')}
          className={cn(
            "flex-1 sm:flex-none px-6 md:px-8 py-3 md:py-4 font-bold text-xs md:text-sm transition-all relative",
            activeTab === 'users' ? theme.text : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
          )}
        >
          User Management
          {activeTab === 'users' && <div className={cn("absolute bottom-0 left-0 right-0 h-1 rounded-t-full", theme.bg, theme.glow)} />}
        </button>
        <button 
          onClick={() => setActiveTab('submissions')}
          className={cn(
            "flex-1 sm:flex-none px-6 md:px-8 py-3 md:py-4 font-bold text-xs md:text-sm transition-all relative flex items-center justify-center gap-2",
            activeTab === 'submissions' ? theme.text : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
          )}
        >
          Game Submissions
          {submissions.filter(s => s.status === 'pending').length > 0 && (
            <span className={cn("w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center shrink-0", theme.bg)}>
              {submissions.filter(s => s.status === 'pending').length}
            </span>
          )}
          {activeTab === 'submissions' && <div className={cn("absolute bottom-0 left-0 right-0 h-1 rounded-t-full", theme.bg, theme.glow)} />}
        </button>
      </div>

      {activeTab === 'users' ? (
        <>
          <section className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
            <div className="flex-1 w-full flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="w-full sm:max-w-md">
                  <h2 className="text-xl font-bold mb-4 dark:text-white text-slate-900">Search & Filters</h2>
                  <div className="relative group">
                    <Search className={cn("absolute left-4 top-1/2 -translate-y-1/2 dark:text-white/20 text-slate-300 transition-colors", `group-focus-within:${theme.text}`)} size={18} />
                    <input 
                      type="text"
                      placeholder="Search users..."
                      className={cn("w-full dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 rounded-xl py-3 pl-12 pr-4 focus:outline-none transition-all font-sans text-sm dark:text-white text-slate-900", `focus:${theme.border}/50`)}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 md:gap-3">
                <button 
                  onClick={() => setFilterTeam('all')}
                  className={cn(
                      "px-6 py-2 rounded-lg text-sm font-bold transition-all dark:bg-white/5 bg-black/5 dark:border-transparent border-black/5 hover:dark:bg-white/10 hover:bg-black/10 dark:text-white text-slate-700",
                      filterTeam === 'all' && "dark:bg-white/10 bg-black/10 ring-1 dark:ring-white/20 ring-black/10 border-white/10"
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
                          : "dark:bg-white/5 bg-black/5 dark:text-white text-slate-700 opacity-50 border border-transparent hover:opacity-100"
                    )}
                  >
                    {team.charAt(0).toUpperCase() + team.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
              <button 
                onClick={async () => {
                  if (!window.confirm('This will recalculate EVERY verified submission and sync user points. Continue?')) return;
                  setLoading(true);
                  try {
                    const res = await fetch('/api/admin/recalculate-all', { method: 'POST' });
                    if (res.ok) {
                      alert('Points recalculated successfully!');
                      fetchData();
                    }
                  } catch (err) {
                    alert('Failed to recalculate');
                  } finally {
                    setLoading(false);
                  }
                }}
                className={cn(
                  "w-full sm:w-auto px-4 md:px-6 py-3 rounded-xl font-bold text-[10px] md:text-xs transition-all border flex items-center justify-center gap-2 h-12 md:h-14",
                  "dark:bg-purple-500/10 bg-purple-50 hover:dark:bg-purple-500/20 hover:bg-purple-100",
                  "dark:text-purple-400 text-purple-700 dark:border-purple-500/20 border-purple-200",
                  loading && "opacity-50 cursor-not-allowed"
                )}
              >
                <Clock size={14} />
                Recalculate All Points
              </button>
              <div className="dark:bg-white/5 bg-white px-6 py-3 rounded-2xl border dark:border-white/5 border-black/5 shadow-sm dark:shadow-none h-12 md:h-14 flex items-center justify-center w-full sm:w-auto">
                <span className={cn("text-2xl font-mono font-bold", theme.text)}>{filteredUsers.length}</span>
                <span className="text-[10px] uppercase font-bold opacity-30 ml-2 tracking-widest dark:text-white text-slate-500">Users Found</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-8">User Directory</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12">
              {filteredUsers.map((u) => (
                <div key={u.steamid} className="flex flex-col gap-5 p-6 dark:bg-[#111111] bg-white rounded-2xl border dark:border-white/5 border-black/5 relative group shadow-sm dark:shadow-none">
                  <div className="flex items-center gap-4">
                      <button 
                        onClick={() => onViewProfile?.(u.steamid)}
                        className={cn(
                          "w-14 h-14 rounded-full border-2 p-1 transition-transform hover:scale-110 active:scale-95",
                          u.team && u.team !== 'none' ? TEAM_COLORS[u.team as Team].border : "dark:border-white/10 border-black/10"
                        )}
                      >
                        <img src={u.steam_avatar} alt="" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                      </button>
                      <div className="flex flex-col overflow-hidden">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-blue-400 truncate">{u.steam_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-widest font-bold opacity-30 dark:text-white text-slate-500">Points:</span>
                            <span className={cn("text-xs font-mono font-bold", theme.text)}>{u.points || 0}</span>
                        </div>
                      </div>
                  </div>

                      <div className="flex flex-col gap-3">
                        <span className="text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">Assign to team:</span>
                        <div className="flex gap-2">
                          {teamsFilter.map(team => (
                              <button 
                                key={team}
                                disabled={updating === u.steamid}
                                onClick={() => assignTeam(u.steamid, team)}
                                className={cn(
                                    "flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all",
                                    (u.team === team || (!u.team && team === 'none')) 
                                      ? `${TEAM_COLORS[team].secondary} ${TEAM_COLORS[team].primary} ring-1 ring-${team}-accent`
                                      : "dark:bg-white/5 bg-slate-50 dark:text-white/40 text-slate-400 hover:dark:bg-white/10 hover:bg-slate-100",
                                    updating === u.steamid && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                {team}
                              </button>
                          ))}
                          
                          <div className="relative group/settings shrink-0">
                             <button
                               onClick={() => setSettingsUserId(settingsUserId === u.steamid ? null : u.steamid)}
                               className="h-full px-3 dark:bg-white/5 bg-slate-50 dark:text-white/40 text-slate-400 hover:dark:text-white hover:text-slate-900 rounded-lg transition-colors flex items-center justify-center border dark:border-transparent border-black/5"
                             >
                               <Settings size={14} className={cn(settingsUserId === u.steamid && theme.text)} />
                             </button>
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-[10px] font-bold rounded opacity-0 group-hover/settings:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-30">
                               Settings
                             </div>
                             
                             {settingsUserId === u.steamid && (
                               <div className="absolute right-0 bottom-full mb-3 w-48 dark:bg-[#1a1a1a] bg-white border dark:border-white/10 border-black/10 rounded-xl shadow-2xl z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                 <div className="p-2 flex flex-col gap-1">
                                   <button 
                                     onClick={() => handleUpdateRole(u.steamid, u.role === 'admin' ? 'member' : 'admin')}
                                     disabled={updating === u.steamid || u.steamid === currentUser?.steamId}
                                     className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase dark:text-white text-slate-700 hover:dark:bg-white/5 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                                   >
                                     <Shield size={14} className={u.role === 'admin' ? 'text-red-500' : 'text-emerald-500'} />
                                     {u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                                   </button>
                                   <div className="h-[1px] dark:bg-white/5 bg-black/5 my-1" />
                                   <button 
                                     onClick={() => handleKickUser(u.steamid, u.steam_name)}
                                     disabled={updating === u.steamid || u.steamid === currentUser?.steamId}
                                     className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                   >
                                     <XCircle size={14} />
                                     Kick Member
                                   </button>
                                 </div>
                               </div>
                             )}
                          </div>
                        </div>
                      </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <h2 className="text-xl font-bold">Review Submissions</h2>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex dark:bg-[#111111] bg-slate-100 rounded-xl border dark:border-white/5 border-black/5 p-1">
                {(['all', 'pending', 'verified', 'rejected'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setSubStatusFilter(status)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all",
                      subStatusFilter === status ? theme.bg + " text-white" : "dark:text-white/40 text-slate-500 hover:dark:text-white hover:text-slate-900"
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest font-bold opacity-30 ml-4">
                <span className="flex items-center gap-1"><Clock size={12} /> {submissions.filter(s => s.status === 'pending').length} Pending</span>
                <span className="flex items-center gap-1"><CheckCircle2 size={12} /> {submissions.filter(s => s.status === 'verified').length} Verified</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {submissions.filter(s => subStatusFilter === 'all' || s.status === subStatusFilter).length === 0 ? (
              <div className="p-12 border-2 border-dashed dark:border-white/5 border-black/5 rounded-3xl text-center">
                <p className="opacity-30 dark:text-white text-slate-500">No {subStatusFilter !== 'all' ? subStatusFilter : ''} submissions found.</p>
              </div>
            ) : (
              submissions.filter(s => subStatusFilter === 'all' || s.status === subStatusFilter).map(sub => (
                <div key={sub.id} className="p-6 dark:bg-[#111111] bg-white rounded-2xl border dark:border-white/5 border-black/5 flex flex-col md:flex-row gap-8 items-center relative overflow-hidden shadow-md dark:shadow-none">
                  <div className="w-full md:w-48 aspect-video md:aspect-[3/4] rounded-xl overflow-hidden shadow-2xl relative group">
                    <img src={sub.game_image} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                    <a 
                      href={`https://store.steampowered.com/app/${sub.game_id}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <ExternalLink size={24} className="text-white" />
                    </a>
                  </div>

                  <div className="flex-1 flex flex-col gap-4 w-full">
                    <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                      <div>
                        <div className={cn("flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold mb-1", theme.text)}>
                          Submission from
                        </div>
                        <div className="flex items-center gap-2">
                          <img src={sub.user_avatar} className="w-6 h-6 rounded-full" alt="" referrerPolicy="no-referrer" />
                          <h3 className="font-bold">{sub.user_name}</h3>
                          <span className="text-[10px] opacity-30 font-mono">({sub.user_id})</span>
                        </div>
                        <h4 className="text-xl font-black mt-2 uppercase">{sub.game_title}</h4>
                      </div>
                      <div className="bg-black/5 dark:bg-white/5 px-4 py-2 rounded-xl flex items-center gap-6 border border-black/5 dark:border-white/5">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">Earned</span>
                          <span className="text-lg font-bold dark:text-white text-slate-800">🏆 {sub.achievements_during}</span>
                          <span className="text-[8px] opacity-20 uppercase font-bold dark:text-white text-slate-400">Prev: {sub.achievements_before || 0}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">Time</span>
                          <span className="text-lg font-bold dark:text-white text-slate-800">🕒 {sub.hours_during}h</span>
                          <span className="text-[8px] opacity-20 uppercase font-bold dark:text-white text-slate-400">Prev: {sub.hours_before || 0}h</span>
                        </div>
                        <div className="w-[1px] h-8 bg-black/5 dark:bg-white/10" />
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">Preview</span>
                          <span className={cn("text-lg font-black", theme.text)}>{sub.calculated_score || 0} pts</span>
                          <span className="text-[8px] opacity-40 uppercase font-bold dark:text-white text-slate-400">{sub.achievements_during || 0} 🏆 × {sub.multiplier?.toFixed(1) || '1.0'}x</span>
                        </div>
                      </div>
                    </div>

                    {sub.notes && (
                      <div className="p-4 dark:bg-white/5 bg-slate-50 rounded-xl border dark:border-white/5 border-black/5 text-sm italic opacity-70 dark:text-white text-slate-600">
                        "{sub.notes}"
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-4">
                      <div className={cn(
                        "text-[10px] font-bold uppercase py-1 px-3 rounded-full flex items-center gap-2",
                        sub.status === 'pending' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                        sub.status === 'verified' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                        "bg-red-500/10 text-red-500 border border-red-500/20"
                      )}>
                        {sub.status === 'pending' ? <Clock size={10} /> : sub.status === 'verified' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                        {sub.status}
                      </div>

                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setReviewingId(sub.id);
                            
                            // Load existing values for editing
                            const hours = Number(sub.hours_during || 0);
                            const achievements = Number(sub.achievements_during || 0);
                            setEditHours(String(hours));
                            setEditAchievements(String(achievements));
                            
                            let m = sub.multiplier || 1.0;
                            if (hours >= 25) m = 4.0;
                            else if (hours >= 15) m = 3.0;
                            else if (hours >= 8) m = 2.0;
                            else if (hours > 0) m = 1.0;
 
                            setEditMultiplier(m);
                            
                            const calculated = Math.round(achievements * m);
                            setPointsAwarded(String(calculated));
                            setRejectionReason(sub.rejection_reason || '');
                          }}
                          className="dark:bg-white/5 bg-black/5 dark:hover:bg-white/10 hover:bg-black/10 dark:text-white text-slate-800 px-6 py-2 rounded-lg font-bold text-xs transition-all border dark:border-white/5 border-black/10"
                        >
                          {sub.status === 'pending' ? 'Review & Modify' : 'Modify Submission'}
                        </button>
                        <button 
                          disabled={updating === sub.id}
                          onClick={() => handleDeleteSubmission(sub.id)}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-6 py-2 rounded-lg font-bold text-xs transition-all border border-red-500/20"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Review Dialog */}
                  {reviewingId === sub.id && (
                    <div className="absolute inset-0 z-20 backdrop-blur-xl bg-black/60 p-6 flex flex-col gap-6 justify-center animate-in fade-in zoom-in duration-200">
                      <div className="flex justify-between items-center">
                        <h4 className={cn("font-bold uppercase tracking-widest", theme.text)}>Modifying {sub.user_name}</h4>
                        <button onClick={() => setReviewingId(null)} className="dark:text-white/40 text-slate-400 hover:dark:text-white hover:text-white transition-colors">
                          <Plus className="rotate-45" size={24} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold opacity-40 dark:text-white text-slate-300">Earned 🏆</label>
                          <input 
                            type="number"
                            className={cn("w-full bg-white/10 border border-white/10 rounded-xl p-3 focus:outline-none dark:text-white text-white", `focus:${theme.border}`)}
                            value={editAchievements}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditAchievements(val);
                              setPointsAwarded(String(Math.round((parseInt(val) || 0) * editMultiplier)));
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold opacity-40 dark:text-white text-slate-300">Play Time (h)</label>
                          <input 
                            type="number"
                            step="0.1"
                            className={cn("w-full bg-white/10 border border-white/10 rounded-xl p-3 focus:outline-none dark:text-white text-white", `focus:${theme.border}`)}
                            value={editHours}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setEditHours(e.target.value);
                              
                              let m = 1.0;
                              if (val >= 25) m = 4.0;
                              else if (val >= 15) m = 3.0;
                              else if (val >= 8) m = 2.0;
                              
                              setEditMultiplier(m);
                              setPointsAwarded(String(Math.round((parseInt(editAchievements) || 0) * m)));
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold opacity-40 dark:text-white text-slate-300">Final Points</label>
                          <input 
                            type="number"
                            className={cn("w-full bg-white/10 border border-white/10 rounded-xl p-3 focus:outline-none dark:text-white text-white", `focus:${theme.border}`)}
                            value={pointsAwarded}
                            onChange={(e) => setPointsAwarded(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold opacity-40 text-red-100">Rejection Reason</label>
                          <input 
                            placeholder="Reason for rejection"
                            className="w-full bg-white/10 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-red-500 dark:text-white text-white"
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <button 
                          disabled={updating === sub.id}
                          onClick={() => handleVerify(sub.id, 'verified')}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                        >
                          Verify & Award Points
                        </button>
                        <button 
                          disabled={updating === sub.id}
                          onClick={() => handleVerify(sub.id, 'rejected')}
                          className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 disabled:opacity-50"
                        >
                          Reject Submission
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

