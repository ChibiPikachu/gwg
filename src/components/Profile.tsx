import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Shield, Trophy, Edit2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEAM_COLORS } from '@/types';

export default function Profile({ steamId }: { steamId?: string }) {
  const { user: currentUser, theme, syncWithDiscord, updateProfile } = useAuth();
  const [targetUser, setTargetUser] = useState<any>(null);
  const [loading, setLoading] = useState(!!steamId);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const isOwnProfile = !steamId || steamId === currentUser?.uid;

  React.useEffect(() => {
    if (isOwnProfile) {
      setTargetUser(currentUser);
      setLoading(false);
    } else {
      setLoading(true);
      fetch(`/api/users/${steamId}`)
        .then(res => res.json())
        .then(data => {
          setTargetUser(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch user:', err);
          setLoading(false);
        });
    }
  }, [steamId, currentUser, isOwnProfile]);

  React.useEffect(() => {
    if (targetUser) {
      setStatus(targetUser.status || '');
      setDisplayName(targetUser.steamName || '');
    }
  }, [targetUser?.uid, targetUser?.status, targetUser?.steamName]);

  if (loading) {
    return (
      <div className="p-20 flex justify-center">
        <div className={cn("w-12 h-12 border-4 border-t-transparent rounded-full animate-spin", theme.border)}></div>
      </div>
    );
  }

  if (!targetUser) return (
    <div className="p-20 text-center opacity-30 text-white">User not found</div>
  );

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
    if (targetUser) {
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

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
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
               <span className="text-4xl font-mono font-bold block dark:text-white text-slate-800">{targetUser.points}</span>
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

          <div className="p-8 dark:bg-[#111111] bg-white rounded-2xl border border-black/5 dark:border-white/5 flex flex-col items-center gap-4 text-center shadow-xl">
            <div className="bg-[#5865F2]/10 p-3 rounded-2xl border border-[#5865F2]/20 shadow-inner group-hover:bg-[#5865F2]/20 transition-all">
               <img 
                 src="https://cdn.simpleicons.org/discord/5865F2" 
                 className="w-8 h-8 drop-shadow-lg" 
                 alt="Discord" 
               />
            </div>
            {targetUser.discordId ? (
              <div className="flex flex-col items-center gap-2">
                 <span className="text-emerald-400 font-bold flex items-center gap-1">
                   <Check size={16} /> Linked
                 </span>
                 <span className="text-[10px] opacity-40">Account: {targetUser.discordName}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="text-white/20 font-bold flex items-center gap-1 uppercase text-xs">
                  Not Linked
                </span>
                {isOwnProfile && (
                  <button 
                    onClick={syncWithDiscord}
                    className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-[#5865F2]/20 flex items-center justify-center gap-3 group active:scale-95"
                  >
                    <img 
                      src="https://cdn.simpleicons.org/discord/white" 
                      className="w-5 h-5 group-hover:scale-110 transition-transform" 
                      alt="" 
                    />
                    <span className="tracking-tight">Sync Discord</span>
                  </button>
                )}
              </div>
            )}
         </div>
      </div>
    </div>
  );
}
