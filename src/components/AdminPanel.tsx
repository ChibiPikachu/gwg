import React from 'react';
import { UserProfile, Team, TEAM_COLORS } from '@/types';
import { useAuth } from '@/components/AuthProvider';
import { Search, Settings, Shield, Clock, CheckCircle2, XCircle, ExternalLink, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type AdminTab = 'users' | 'submissions';

export default function AdminPanel({ onViewProfile }: { onViewProfile?: (id: string) => void }) {
  const { user: currentUser, theme } = useAuth();
  const [activeTab, setActiveTab] = React.useState<AdminTab>('users');
  const [filterTeam, setFilterTeam] = React.useState<Team | 'all'>('all');
  const [users, setUsers] = React.useState<any[]>([]);
  const [submissions, setSubmissions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState<string | null>(null);
  const [selectedUser, setSelectedUser] = React.useState<any | null>(null);
  const [reviewingId, setReviewingId] = React.useState<string | null>(null);
  const [pointsAwarded, setPointsAwarded] = React.useState('10');
  const [rejectionReason, setRejectionReason] = React.useState('');

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

  const handleVerify = async (id: string, status: 'verified' | 'rejected') => {
    setUpdating(id);
    try {
      const res = await fetch('/api/admin/verify-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: id,
          status,
          points: parseInt(pointsAwarded) || 0,
          rejectionReason: status === 'rejected' ? rejectionReason : ''
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
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-12">
      <div className="flex border-b border-white/5">
        <button 
          onClick={() => setActiveTab('users')}
          className={cn(
            "px-8 py-4 font-bold text-sm transition-all relative",
            activeTab === 'users' ? theme.text : "text-white/40 hover:text-white"
          )}
        >
          User Management
          {activeTab === 'users' && <div className={cn("absolute bottom-0 left-0 right-0 h-1 rounded-t-full", theme.bg, theme.glow)} />}
        </button>
        <button 
          onClick={() => setActiveTab('submissions')}
          className={cn(
            "px-8 py-4 font-bold text-sm transition-all relative flex items-center gap-2",
            activeTab === 'submissions' ? theme.text : "text-white/40 hover:text-white"
          )}
        >
          Game Submissions
          {submissions.filter(s => s.status === 'pending').length > 0 && (
            <span className={cn("w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center", theme.bg)}>
              {submissions.filter(s => s.status === 'pending').length}
            </span>
          )}
          {activeTab === 'submissions' && <div className={cn("absolute bottom-0 left-0 right-0 h-1 rounded-t-full", theme.bg, theme.glow)} />}
        </button>
      </div>

      {activeTab === 'users' ? (
        <>
          <section className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-end">
            <div className="flex-1 w-full flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-bold mb-4">Search & Filters</h2>
                <div className="relative group max-w-md">
                  <Search className={cn("absolute left-4 top-1/2 -translate-y-1/2 text-white/20 transition-colors", `group-focus-within:${theme.text}`)} size={18} />
                  <input 
                    type="text"
                    placeholder="Search by Steam or Discord name..."
                    className={cn("w-full bg-[#111111] border border-white/5 rounded-xl py-3 pl-12 pr-4 focus:outline-none transition-all font-sans", `focus:${theme.border}/50`)}
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
              <span className={cn("text-2xl font-mono font-bold", theme.text)}>{filteredUsers.length}</span>
              <span className="text-[10px] uppercase font-bold opacity-30 ml-2 tracking-widest">Users Found</span>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-8">User Directory</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12">
              {filteredUsers.map((u) => (
                <div key={u.steamid} className="flex flex-col gap-5 p-6 bg-[#111111] rounded-2xl border border-white/5 relative group">
                  <div className="flex items-center gap-4">
                      <button 
                        onClick={() => onViewProfile?.(u.steamid)}
                        className={cn(
                          "w-14 h-14 rounded-full border-2 p-1 transition-transform hover:scale-110 active:scale-95",
                          u.team && u.team !== 'none' ? TEAM_COLORS[u.team as Team].border : "border-white/10"
                        )}
                      >
                        <img src={u.steam_avatar} alt="" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                      </button>
                      <div className="flex flex-col overflow-hidden">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-blue-400 truncate">{u.steam_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-widest font-bold opacity-30">Points:</span>
                            <span className={cn("text-xs font-mono font-bold", theme.text)}>{u.points || 0}</span>
                        </div>
                      </div>
                  </div>

                  <div className="flex flex-col gap-3">
                      <span className="text-[10px] uppercase font-bold opacity-30">Assign to team:</span>
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
                                    : "bg-white/5 text-white/40 hover:bg-white/10",
                                  updating === u.steamid && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              {team}
                            </button>
                        ))}
                      </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Review Submissions</h2>
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest font-bold opacity-30">
              <span className="flex items-center gap-1"><Clock size={12} /> {submissions.filter(s => s.status === 'pending').length} Pending</span>
              <span className="flex items-center gap-1"><CheckCircle2 size={12} /> {submissions.filter(s => s.status === 'verified').length} Verified</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {submissions.length === 0 ? (
              <div className="p-12 border-2 border-dashed border-white/5 rounded-3xl text-center">
                <p className="opacity-30">No game submissions found in the database.</p>
              </div>
            ) : (
              submissions.map(sub => (
                <div key={sub.id} className="p-6 bg-[#111111] rounded-2xl border border-white/5 flex flex-col md:flex-row gap-8 items-center relative overflow-hidden">
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
                      <div className="bg-white/5 px-4 py-2 rounded-xl flex items-center gap-6">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold opacity-30">Earned</span>
                          <span className="text-lg font-bold">🏆 {sub.achievements_during}</span>
                          <span className="text-[8px] opacity-20 uppercase font-bold">Prev: {sub.achievements_before || 0}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold opacity-30">Time</span>
                          <span className="text-lg font-bold">🕒 {sub.hours_during}h</span>
                          <span className="text-[8px] opacity-20 uppercase font-bold">Prev: {sub.hours_before || 0}h</span>
                        </div>
                        <div className="w-[1px] h-8 bg-white/10" />
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold opacity-30">Preview</span>
                          <span className={cn("text-lg font-black", theme.text)}>{sub.calculated_score || 0} pts</span>
                          <span className="text-[8px] opacity-40 uppercase font-bold">{sub.multiplier?.toFixed(1) || '1.0'}x Mult</span>
                        </div>
                      </div>
                    </div>

                    {sub.notes && (
                      <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-sm italic opacity-70">
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

                      {sub.status === 'pending' && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setReviewingId(sub.id);
                              setPointsAwarded(String(sub.calculated_score || 0));
                            }}
                            className="bg-white/5 hover:bg-white/10 text-white px-6 py-2 rounded-lg font-bold text-xs transition-all border border-white/5"
                          >
                            Review Submission
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Review Dialog */}
                  {reviewingId === sub.id && (
                    <div className="absolute inset-0 z-20 backdrop-blur-xl bg-black/60 p-6 flex flex-col gap-6 justify-center animate-in fade-in zoom-in duration-200">
                      <div className="flex justify-between items-center">
                        <h4 className={cn("font-bold uppercase tracking-widest", theme.text)}>Approving {sub.user_name}</h4>
                        <button onClick={() => setReviewingId(null)} className="text-white/40 hover:text-white transition-colors">
                          <Plus className="rotate-45" size={24} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold opacity-40">Points to Award</label>
                          <input 
                            type="number"
                            className={cn("w-full bg-white/10 border border-white/10 rounded-xl p-3 focus:outline-none", `focus:${theme.border}`)}
                            value={pointsAwarded}
                            onChange={(e) => setPointsAwarded(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold opacity-40 text-red-400">Rejection Reason</label>
                          <input 
                            placeholder="Only if rejecting..."
                            className="w-full bg-white/10 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-red-500"
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

