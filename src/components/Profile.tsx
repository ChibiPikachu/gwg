import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Shield, Trophy, Edit2, Check, ExternalLink, Gamepad2, History, Clock, CheckCircle2, AlertCircle, XCircle, Skull } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Team, TEAM_COLORS } from '@/types';

export default function Profile({ steamId }: { steamId?: string }) {
  const { user: currentUser, theme, syncWithDiscord, loginWithSteam, loginWithDiscord, updateProfile } = useAuth();
  const [targetUser, setTargetUser] = useState<any>(null);
  const [loading, setLoading] = useState(!!steamId);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [showSurvivorTooltip, setShowSurvivorTooltip] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [hoveredBadgeEventId, setHoveredBadgeEventId] = useState<string | null>(null);

  const [activeAvatar, setActiveAvatar] = useState('steam');
  const [updatingAvatar, setUpdatingAvatar] = useState(false);

  const isOwnProfile = !steamId || steamId === currentUser?.uid;

  const hasDiscord = !!targetUser?.discordId;
  const hasRealSteam = targetUser?.steamId && !targetUser.steamId.startsWith('discord_');
  const hasBoth = hasDiscord && hasRealSteam;

  const handleAvatarPreferenceChange = async (preference: 'steam' | 'discord') => {
    setUpdatingAvatar(true);
    try {
      const res = await fetch('/api/profile/avatar-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preference })
      });
      if (res.ok) {
        setActiveAvatar(preference);
        // Optimistically update targetUser's avatar option in views
        setTargetUser((prev: any) => ({
          ...prev,
          active_avatar: preference,
          steamAvatar: preference === 'steam' ? (prev.steam_avatar || prev.steamAvatar) : (prev.discord_avatar || prev.discordAvatar)
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingAvatar(false);
    }
  };

  const sortedEvents = React.useMemo(() => {
    return [...events].sort((a, b) => (b.event_number || 0) - (a.event_number || 0));
  }, [events]);

  const filteredSubmissions = React.useMemo(() => {
    if (selectedEventId === 'all') return submissions;
    return submissions.filter((s: any) => s.event_id === selectedEventId);
  }, [submissions, selectedEventId]);

  React.useEffect(() => {
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        setEvents(Array.isArray(data) ? data : []);
      })
      .catch(err => console.error('Failed to fetch events in profile:', err));
  }, []);

  React.useEffect(() => {
    const fetchSubmissions = async () => {
      const idToFetch = steamId || currentUser?.uid;
      if (!idToFetch) return;

      setLoadingSubmissions(true);
      try {
        const res = await fetch(`/api/submissions?userId=${idToFetch}`);
        if (res.ok) {
          const data = await res.json();
          setSubmissions(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to fetch submissions:', err);
      } finally {
        setLoadingSubmissions(false);
      }
    };

    fetchSubmissions();
  }, [steamId, currentUser?.uid]);

  React.useEffect(() => {
    if (isOwnProfile) {
      setTargetUser(currentUser);
      setLoading(false);
    } else {
      setLoading(true);
      fetch(`/api/users/${steamId}`)
        .then(async res => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to fetch user');
          }
          return res.json();
        })
        .then(data => {
          setTargetUser(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch user:', err);
          setTargetUser({ error: err.message || 'Failed to load user profile' });
          setLoading(false);
        });
    }
  }, [steamId, currentUser, isOwnProfile]);

  React.useEffect(() => {
    if (targetUser && !targetUser.error) {
      setStatus(targetUser.status || '');
      setDisplayName(targetUser.steamName || '');
      setActiveAvatar(targetUser.active_avatar || 'steam');
    }
  }, [targetUser?.uid, targetUser?.status, targetUser?.steamName, targetUser?.active_avatar]);

  if (loading) {
    return (
      <div className="p-20 flex justify-center">
        <div className={cn("w-12 h-12 border-4 border-t-transparent rounded-full animate-spin", theme.border)}></div>
      </div>
    );
  }

  if (!targetUser || targetUser.error) {
    return (
      <div className="p-20 text-center text-white/50 font-bold flex flex-col items-center justify-center gap-4">
        <div className="text-red-500/80 animate-pulse">
          <Shield size={48} />
        </div>
        <span>{targetUser?.error || 'User profile not found'}</span>
      </div>
    );
  }

  const handleSave = async () => {
    if (!isOwnProfile) return;
    setIsSaving(true);
    const success = await updateProfile({ displayName, status });
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  const handleCancel = () => {
    if (targetUser && !targetUser.error) {
      setStatus(targetUser.status || '');
      setDisplayName(targetUser.steamName || '');
    }
    setIsEditing(false);
  };

  const colors = TEAM_COLORS[targetUser.team || 'none'] || TEAM_COLORS['blue'];
  const logoColor = targetUser.team === 'blue' ? 'bg-blue-accent' : 
                    targetUser.team === 'green' ? 'bg-green-accent' : 
                    targetUser.team === 'purple' ? 'bg-purple-accent' : 
                    targetUser.team === 'red' ? 'bg-red-accent' : 'bg-white/10';

  const hasSurvivedMigration = (() => {
    const timestamp = targetUser.createdAt || targetUser.created_at;
    if (!timestamp) return true; // Legacy user logged in before May 30, 2026.
    const date = new Date(timestamp);
    return date.getTime() < new Date('2026-05-30T00:00:00Z').getTime();
  })();

  const getTeamBadgeClasses = (team: string) => {
    switch (team) {
      case 'blue':
        return 'bg-blue-accent/10 text-blue-accent border-blue-accent/30';
      case 'green':
        return 'bg-green-accent/10 text-green-accent border-green-accent/30';
      case 'purple':
        return 'bg-purple-accent/10 text-purple-accent border-purple-accent/30';
      case 'red':
        return 'bg-red-accent/10 text-red-accent border-red-accent/30';
      default:
        return 'bg-white/10 text-white/80 border-white/20';
    }
  };

  const activeEvent = Array.isArray(events) ? events.find((e: any) => e.is_active) : null;
  const hideScores = !!activeEvent?.hide_scores;
  const hideUserScores = hideScores && !isOwnProfile;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto flex flex-col gap-12">
      <section className="flex flex-col md:flex-row gap-8 items-center md:items-start text-center md:text-left">
        <div className={cn("w-32 h-32 rounded-full border-4 p-1 relative shadow-2xl shrink-0", colors.border)}>
           <img 
            src={targetUser.steamAvatar || targetUser.discordAvatar || 'https://via.placeholder.com/150'} 
            alt={targetUser.steamName} 
            className="w-full h-full rounded-full object-cover" 
            referrerPolicy="no-referrer"
          />
           {targetUser.isAdmin && (
             <div className={cn("absolute -bottom-2 -right-2 text-white p-1.5 rounded-full shadow-lg", logoColor)} title="Admin">
               <Shield size={16} />
             </div>
           )}
        </div>

        <div className="flex-1 flex flex-col gap-4 overflow-visible">
           <div>
              {isEditing && isOwnProfile ? (
                 <div className="flex flex-col gap-1 mb-2">
                   <span className="text-[10px] uppercase font-bold opacity-30">Display Name</span>
                   <input 
                     type="text" 
                     className={cn("text-3xl font-bold bg-white/5 border rounded-lg px-4 py-1 focus:outline-none w-full md:w-auto transition-all", colors.border)}
                     value={displayName}
                     onChange={(e) => setDisplayName(e.target.value)}
                   />
                 </div>
              ) : (
                <div className="group flex items-center justify-center md:justify-start gap-4">
                  <h1 className="text-3xl font-bold truncate">{targetUser.steamName}</h1>
                  {isOwnProfile && (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className={cn("opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/5 rounded-full transition-all", colors.primary)}
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                </div>
              )}

              {/* Accolades & Badges */}
              {(hasSurvivedMigration || (events.length > 0 && events.some(e => {
                if (e.is_active || !e.winner_team) return false;
                const userTeamForEvent = e.event_number === 3 
                  ? targetUser?.eventTeams?.[e.id] 
                  : (targetUser?.eventTeams?.[e.id] || targetUser?.team);
                return userTeamForEvent === e.winner_team;
              }))) && (
                <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2 mb-1 animate-in fade-in duration-300">
                  {hasSurvivedMigration && (
                    <div 
                      className="relative group/tooltip flex items-center justify-center"
                      onMouseEnter={() => setShowSurvivorTooltip(true)}
                      onMouseLeave={() => setShowSurvivorTooltip(false)}
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowSurvivorTooltip(!showSurvivorTooltip);
                        }}
                        className="flex items-center justify-center p-1.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs font-semibold select-none cursor-pointer hover:bg-orange-500/20 transition-all active:scale-95 duration-150"
                        title="I survived the migration horrors!"
                      >
                        <Skull size={12} />
                      </button>
                      {showSurvivorTooltip && (
                        <div className="absolute bottom-full mb-2 z-[9999] bg-slate-900 border border-white/10 text-white text-[11px] px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap animate-in fade-in slide-in-from-bottom-1 duration-150 font-bold pointer-events-none">
                          I survived the migration horrors!
                        </div>
                      )}
                    </div>
                  )}

                  {events
                    .filter(e => {
                      if (e.is_active || !e.winner_team) return false;
                      const userTeamForEvent = e.event_number === 3 
                        ? targetUser?.eventTeams?.[e.id] 
                        : (targetUser?.eventTeams?.[e.id] || targetUser?.team);
                      return userTeamForEvent === e.winner_team;
                    })
                    .map(e => {
                      const userTeamForEvent = e.event_number === 3 
                        ? targetUser?.eventTeams?.[e.id] 
                        : (targetUser?.eventTeams?.[e.id] || targetUser?.team);
                      return (
                        <div
                          key={e.id}
                          className="relative group/badge-tooltip"
                          onMouseEnter={() => setHoveredBadgeEventId(e.id)}
                          onMouseLeave={() => setHoveredBadgeEventId(null)}
                        >
                          <span
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider select-none cursor-help transition-all duration-150 hover:scale-[1.02]",
                              getTeamBadgeClasses(e.winner_team)
                            )}
                          >
                            <Trophy size={11} className="text-amber-500" />
                            <span>Event #{e.event_number} Winner</span>
                          </span>
                          
                          {hoveredBadgeEventId === e.id && (
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[9999] bg-zinc-950 border border-white/10 text-white p-3 rounded-xl shadow-2xl min-w-[240px] max-w-[280px] pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150">
                              <div className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1 select-none">
                                Event #{e.event_number} Details
                              </div>
                              <div className="text-sm font-bold text-white leading-tight mb-1 select-none">
                                {e.title || `Event #${e.event_number}`}
                              </div>
                              {e.description && (
                                <p className="text-[11px] text-zinc-300 leading-normal line-clamp-3 select-none italic font-medium">
                                  {e.description.replace(/<!--VOTING:.*?-->/g, '')}
                                </p>
                              )}
                              <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-400 font-bold select-none">
                                <span>Winner Team:</span>
                                <span className="uppercase tracking-wider text-amber-400">{e.winner_team}</span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold select-none mt-0.5">
                                <span>User's Team:</span>
                                <span className="uppercase tracking-wider text-emerald-400">{userTeamForEvent || 'none'}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-2">
                 <a 
                    href={`https://steamcommunity.com/profiles/${targetUser.steamId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity text-sm bg-black/20 px-3 py-1 rounded-full border border-white/5"
                 >
                    <img src="https://community.akamai.steamstatic.com/public/shared/images/responsive/header_logo.png" className="w-4 h-4 object-contain invert grayscale" alt="Steam" />
                    <span>View Steam Profile</span>
                 </a>
                 {targetUser.discordName && (
                   <div className="flex items-center gap-2 opacity-60 text-sm bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                      <img 
                        src="https://cdn.simpleicons.org/discord/5865F2" 
                        className="w-3.5 h-3.5" 
                        alt="" 
                      />
                      <span>{targetUser.discordName}</span>
                   </div>
                 )}
              </div>
           </div>

           <div className="flex flex-col gap-2 relative max-w-xl">
              <span className="text-[10px] uppercase font-bold opacity-30">Status Message</span>
              <div className="flex items-center gap-3 group">
                {isEditing && isOwnProfile ? (
                  <div className="flex-1 flex flex-col gap-4">
                    <input 
                      type="text" 
                      className={cn("flex-1 bg-white/5 border rounded-lg px-4 py-2 focus:outline-none transition-all", colors.border)}
                      value={status}
                      placeholder="What's on your mind?"
                      onChange={(e) => setStatus(e.target.value)}
                    />
                    <div className="flex gap-3 justify-center md:justify-start">
                      <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {isSaving ? <span className="animate-spin text-xs">●</span> : <Check size={18} />}
                        Save Changes
                      </button>
                      <button 
                        onClick={handleCancel}
                        disabled={isSaving}
                        className="px-6 py-2 bg-white/5 text-white/60 rounded-lg hover:bg-white/10 transition-all font-bold text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-lg opacity-80 italic">"{targetUser.status || 'No status set'}"</p>
                    {isOwnProfile && (
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/5 rounded-full transition-all"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
           </div>

           {showSuccess && (
             <div className="text-emerald-400 text-sm font-bold flex items-center gap-2 animate-bounce justify-center md:justify-start">
               <Check size={14} /> Profile updated successfully!
             </div>
           )}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         <div className="p-8 dark:bg-[#111111] bg-white rounded-2xl border border-black/5 dark:border-white/5 flex flex-col items-center gap-4 text-center shadow-xl">
            <Trophy size={32} className="text-amber-400" />
            <div>
               <span className="text-4xl font-mono font-bold block dark:text-white text-slate-800">{hideUserScores ? '—' : targetUser.points}</span>
               <span className="text-[10px] uppercase font-bold opacity-30 dark:text-white text-slate-500">Points Earned</span>
            </div>
         </div>

         <div className={cn("p-10 rounded-2xl border flex flex-col items-center gap-2 text-center shadow-xl dark:bg-[#111111] bg-white overflow-hidden relative", colors.border)}>
            <div className={cn("absolute inset-0 opacity-5", colors.secondary)} />
            <span className="text-[11px] uppercase font-black opacity-30 tracking-[0.2em] relative z-10 dark:text-white text-slate-400">Team</span>
            <div className="flex flex-col items-center relative z-10">
               <span className={cn("text-4xl md:text-6xl font-black block uppercase tracking-tighter leading-none mb-1", colors.primary)}>
                 {targetUser.team || 'None'}
               </span>
               <span className={cn("text-[12px] font-bold opacity-40 uppercase tracking-[0.1em]", targetUser.team === 'none' ? 'dark:text-white text-slate-500' : 'text-white/50')}>
                  {(targetUser.team || 'None')} team best team!
               </span>
            </div>
         </div>

          <div className="p-8 dark:bg-[#111111] bg-white rounded-2xl border border-black/5 dark:border-white/5 flex flex-col gap-6 text-center shadow-xl">
            <h3 className="text-xs uppercase tracking-widest font-bold opacity-40 dark:text-white text-slate-500">Connections</h3>
            
            <div className="flex flex-col gap-4 w-full">
              {/* Steam Connection Status */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-white/5 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img src="https://community.akamai.steamstatic.com/public/shared/images/responsive/header_logo.png" className="w-5 h-5 object-contain invert grayscale shrink-0" alt="Steam" />
                  <div className="text-left min-w-0">
                    <div className="text-xs font-bold leading-none">Steam Account</div>
                    {targetUser.steamId && !targetUser.steamId.startsWith('discord_') ? (
                      <div className="text-[10px] opacity-50 truncate max-w-[120px] leading-none mt-1">
                        {targetUser.steamName || 'Linked'}
                      </div>
                    ) : (
                      <div className="text-[10px] text-zinc-500 leading-none mt-1">Not Linked</div>
                    )}
                  </div>
                </div>
                
                {targetUser.steamId && !targetUser.steamId.startsWith('discord_') ? (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 shrink-0">
                    <CheckCircle2 size={14} /> Linked
                  </span>
                ) : (
                  isOwnProfile && (
                    <button 
                      onClick={loginWithSteam} 
                      className="bg-[#1b2838] border border-white/10 hover:border-white/20 hover:bg-[#203044] text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      Add Steam
                    </button>
                  )
                )}
              </div>

              {/* Discord Connection Status */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-white/5 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img src="https://cdn.simpleicons.org/discord/5865F2" className="w-5 h-5 shrink-0" alt="Discord" />
                  <div className="text-left min-w-0">
                    <div className="text-xs font-bold leading-none">Discord Account</div>
                    {targetUser.discordId ? (
                      <div className="text-[10px] opacity-50 truncate max-w-[120px] leading-none mt-1">
                        {targetUser.discordName || 'Linked'}
                      </div>
                    ) : (
                      <div className="text-[10px] text-zinc-500 leading-none mt-1">Not Linked</div>
                    )}
                  </div>
                </div>

                {targetUser.discordId ? (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 shrink-0">
                    <CheckCircle2 size={14} /> Linked
                  </span>
                ) : (
                  isOwnProfile && (
                    <button 
                      onClick={syncWithDiscord}
                      className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 cursor-pointer shrink-0"
                    >
                      Sync Discord
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Active Avatar Selector - Only visible to owners with both accounts linked */}
            {hasBoth && isOwnProfile && (
              <div className="pt-2 border-t border-black/5 dark:border-white/5 text-left w-full">
                <span className="text-[10px] uppercase font-bold opacity-30 block mb-2 dark:text-white text-slate-500">
                  Avatar Preference
                </span>
                <div className="grid grid-cols-2 gap-2 bg-black/10 dark:bg-white/5 p-1 rounded-xl">
                  <button
                    onClick={() => handleAvatarPreferenceChange('steam')}
                    disabled={updatingAvatar}
                    className={cn(
                      "py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-tight flex items-center justify-center gap-1.5 cursor-pointer",
                      activeAvatar === 'steam' 
                        ? "bg-[#1b2838] text-white shadow" 
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Steam
                  </button>
                  <button
                    onClick={() => handleAvatarPreferenceChange('discord')}
                    disabled={updatingAvatar}
                    className={cn(
                      "py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-tight flex items-center justify-center gap-1.5 cursor-pointer",
                      activeAvatar === 'discord'
                        ? "bg-[#5865F2] text-white shadow shadow-[#5865F2]/25" 
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Discord
                  </button>
                </div>
              </div>
            )}
          </div>
      </div>

      {/* Submissions Section */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg bg-white/5", colors.text)}>
            <History size={20} />
          </div>
          <h2 className="text-2xl font-bold dark:text-white text-slate-800">Submitted Games</h2>
        </div>

        {loadingSubmissions ? (
          <div className="flex justify-center p-12">
            <div className={cn("w-8 h-8 border-2 border-t-transparent rounded-full animate-spin", theme.border)}></div>
          </div>
        ) : submissions.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-black/10 dark:border-white/10 opacity-35 italic font-bold">
            No submissions found for this user.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Horizontal event-submissions tabs scroll */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b dark:border-white/5 border-black/5 scrollbar-thin scrollbar-thumb-rounded">
              <button
                type="button"
                onClick={() => setSelectedEventId('all')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 shrink-0 border flex items-center gap-2",
                  selectedEventId === 'all'
                    ? "dark:bg-white dark:text-zinc-950 bg-slate-900 text-white border-transparent shadow-md"
                    : "dark:bg-white/5 bg-slate-50 hover:dark:bg-white/10 hover:bg-slate-100 dark:border-white/5 border-black/5 dark:text-white/60 text-slate-600"
                )}
              >
                <History size={13} />
                <span>All Events</span>
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none",
                  selectedEventId === 'all'
                    ? "dark:bg-black/10 bg-white/20 dark:text-zinc-950 text-white"
                    : "dark:bg-white/10 bg-slate-200/50 dark:text-white text-slate-500"
                )}>
                  {submissions.length}
                </span>
              </button>

              {sortedEvents.map((evt) => {
                const count = submissions.filter((s: any) => s.event_id === evt.id).length;
                const isActiveTab = selectedEventId === evt.id;

                return (
                  <button
                    key={evt.id}
                    type="button"
                    onClick={() => setSelectedEventId(evt.id)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 shrink-0 border flex items-center gap-2",
                      isActiveTab
                        ? "dark:bg-white dark:text-zinc-950 bg-slate-900 text-white border-transparent shadow-md"
                        : "dark:bg-white/5 bg-slate-50 hover:dark:bg-white/10 hover:bg-slate-100 dark:border-white/5 border-black/5 dark:text-white/60 text-slate-600"
                    )}
                  >
                    {evt.is_active ? (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    ) : (
                      <Trophy size={13} className={cn(isActiveTab ? "text-amber-500 dark:text-amber-600" : "text-slate-400")} />
                    )}
                    <span>Event #{evt.event_number || 1}</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none",
                      isActiveTab
                        ? "dark:bg-black/10 bg-white/20 dark:text-zinc-950 text-white"
                        : "dark:bg-white/10 bg-slate-200/50 dark:text-white text-slate-500"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filtered submissions grid */}
            {filteredSubmissions.length === 0 ? (
              <div className="p-12 text-center rounded-2xl border border-dashed border-black/10 dark:border-white/10 dark:text-white/40 text-slate-400 opacity-60 italic font-bold text-xs uppercase tracking-wider">
                No submissions found for this event.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredSubmissions.map((sub: any) => {
                  const subEvent = events.find((e: any) => e.id === sub.event_id);

                  return (
                    <div 
                      key={sub.id} 
                      className="group p-4 dark:bg-[#111111] bg-white rounded-xl border border-black/5 dark:border-white/5 hover:border-black/10 dark:hover:border-white/10 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-16 rounded overflow-hidden bg-white/5 shrink-0 border border-black/10 dark:border-white/5 relative shadow-sm">
                          {sub.game_image ? (
                            <img 
                              src={sub.game_name === 'Screenshot Points' || sub.game_name === 'Bingo Points' || sub.game_image?.includes('1471391') ? (sub.game_name === 'Bingo Points' ? 'https://cdn-icons-png.flaticon.com/512/5815/5815809.png' : 'https://i.ibb.co/gZPKx2qh/gwg-extra-points.png') : sub.game_image} 
                              alt={sub.game_name} 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center opacity-20 bg-slate-200 dark:bg-white/5">
                              <Gamepad2 size={24} />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-base dark:text-white text-slate-800 leading-snug">{sub.game_name}</h3>
                            {sub.steam_appid && (
                              <a 
                                href={`https://store.steampowered.com/app/${sub.steam_appid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-blue-400 opacity-60 hover:opacity-100 transition-all"
                                title="View on Steam"
                              >
                                <ExternalLink size={13} />
                              </a>
                            )}
                          </div>
                          
                          {/* Stats and metadata rows */}
                          <div className="flex flex-wrap items-center gap-2 text-[10px] opacity-80">
                            <span className="px-2 py-0.5 rounded-full dark:bg-white/5 bg-slate-100 border dark:border-white/5 border-black/5 uppercase font-extrabold tracking-wider text-[9px] dark:text-white/60 text-slate-500">
                              {sub.platform}
                            </span>

                            {selectedEventId === 'all' && subEvent && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 font-extrabold tracking-wider text-[9px] uppercase">
                                Event #{subEvent.event_number}
                              </span>
                            )}

                            {sub.hours_during !== undefined && sub.hours_during !== null && (
                              <span className="px-2 py-0.5 rounded-full dark:bg-white/5 bg-slate-100 border dark:border-white/5 border-black/5 font-extrabold tracking-wider text-[9px] dark:text-white/60 text-slate-500 flex items-center gap-1">
                                🕒 {Math.max(0, Number(sub.hours_during || 0) - Number(sub.hours_before || 0)).toFixed(1)}h
                              </span>
                            )}

                            {sub.platform === 'Steam' && sub.achievements_during !== undefined && sub.achievements_during !== null && (
                              <span className="px-2 py-0.5 rounded-full dark:bg-white/5 bg-slate-100 border dark:border-white/5 border-black/5 font-extrabold tracking-wider text-[9px] dark:text-white/60 text-slate-500 flex items-center gap-1">
                                🏆 {sub.achievements_during} Ach
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right-aligned verification status and points cards */}
                      <div className="flex items-center justify-between md:justify-end gap-3.5 flex-wrap shrink-0">
                        {/* Tags container */}
                        <div className="flex items-center gap-1.5">
                          {sub.status === 'pending' && (
                            <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 uppercase font-black tracking-wider text-[9px] flex items-center gap-1 shadow-sm">
                              <Clock size={10} className="animate-pulse" /> Pending
                            </span>
                          )}
                          {sub.status === 'verified' && (
                            <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 uppercase font-black tracking-wider text-[9px] flex items-center gap-1 shadow-sm">
                              <CheckCircle2 size={10} /> Verified
                            </span>
                          )}
                          {sub.status === 'rejected' && (
                            <span 
                              className="px-2 py-1 rounded-full bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20 uppercase font-black tracking-wider text-[9px] flex items-center gap-1 shadow-sm cursor-help" 
                              title={sub.rejection_reason || 'Rejected (no reason provided)'}
                            >
                              <XCircle size={10} /> Rejected
                            </span>
                          )}

                          <span className="px-2 py-1 rounded-full bg-purple-500/10 text-purple-500 dark:text-purple-400 border border-purple-500/20 uppercase font-black tracking-wider text-[9px] shadow-sm">
                            {sub.completion_status || 'Beaten'}
                          </span>
                        </div>

                        {/* Points pill dynamically themed to user's team */}
                        {sub.status === 'verified' && (
                          <div className={cn("px-3 py-1.5 rounded-xl text-xs font-mono font-black border uppercase tracking-wider shadow-inner text-center shrink-0 min-w-[70px]", 
                            targetUser.team && TEAM_COLORS[targetUser.team as Team] && targetUser.team !== 'none' 
                              ? `${TEAM_COLORS[targetUser.team as Team].secondary} ${TEAM_COLORS[targetUser.team as Team].primary} dark:border-${targetUser.team}-500/30 border-${targetUser.team}-500/20` 
                              : "bg-slate-50 dark:bg-zinc-900 border-black/5 dark:border-white/5 dark:text-white text-slate-800"
                          )}>
                            +{hideUserScores ? '—' : (sub.points || 0)} pts
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
