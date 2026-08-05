import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { motion, AnimatePresence } from 'motion/react';
import { Gamepad2, ArrowLeft, AlertCircle, LogOut, Link2, UserPlus, Check } from 'lucide-react';

export default function DiscordRegistration() {
  const { user, logout, fetchMe } = useAuth();
  const [hasSteam, setHasSteam] = useState<boolean | null>(null);
  const [steamId, setSteamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const getAuthHeaders = () => {
    const userIdHeader = user?.steamId || user?.uid || user?.discordId || '';
    return {
      'Content-Type': 'application/json',
      'x-user-id': userIdHeader,
      'x-steam-id': user?.steamId || '',
      'x-discord-id': user?.discordId || '',
    };
  };

  const handleNoSteam = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/complete-registration', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ hasSteam: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete registration.');
      }
      if (user) {
        const updatedUser = {
          ...user,
          needs_registration: false,
          steamId: data.user?.steamid || data.user?.id || user.steamId
        };
        localStorage.setItem('gamer_auth_user', JSON.stringify(updatedUser));
      }
      fetchMe();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  const handleYesSteam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanId = steamId.trim();
    if (!cleanId) {
      setError('Please enter your Steam ID or Steam profile URL.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/complete-registration', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ hasSteam: true, steamId: cleanId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync with Steam account.');
      }
      if (user) {
        const updatedUser = {
          ...user,
          needs_registration: false,
          steamId: data.user?.steamid || data.user?.id || user.steamId
        };
        localStorage.setItem('gamer_auth_user', JSON.stringify(updatedUser));
      }
      fetchMe();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while linking your accounts.');
    } finally {
      setLoading(false);
    }
  };

  const discordName = user.discordName || 'Discord User';
  const discordAvatarUrl = user.discordAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png';

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-[#0a0a0a] p-4 text-slate-900 dark:text-white font-sans">
      <div className="w-full max-w-md bg-white dark:bg-[#111111] rounded-3xl border border-black/5 dark:border-white/5 shadow-2xl overflow-hidden relative">
        
        {/* Decorative subtle background glows */}
        <div className="absolute top-0 left-1/4 w-32 h-32 bg-[#5865F2]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-[#1b2838]/20 dark:bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header Row / Cancel & Logout */}
        <div className="flex justify-between items-center px-6 pt-6 relative z-10">
          <span className="text-xs font-mono font-bold tracking-wider text-slate-400 dark:text-white/40 uppercase">
            Account Setup
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-500 dark:text-white/50 dark:hover:text-red-400 transition-colors bg-slate-100 dark:bg-white/5 hover:bg-red-500/10 px-3 py-1.5 rounded-xl border border-black/5 dark:border-white/5 active:scale-95 cursor-pointer"
          >
            <LogOut size={13} />
            Logout
          </button>
        </div>

        <div className="p-6 md:p-8 flex flex-col items-center text-center relative z-10">
          {/* User Profile Summary */}
          <div className="flex items-center gap-3 bg-slate-100 dark:bg-white/5 px-4 py-2.5 rounded-2xl border border-black/5 dark:border-white/5 mb-8">
            <img 
              src={discordAvatarUrl} 
              alt="Discord Avatar" 
              className="w-8 h-8 rounded-full border border-white/10"
              referrerPolicy="no-referrer"
            />
            <div className="text-left">
              <p className="text-xs text-slate-500 dark:text-white/40 font-medium">Logged in with Discord</p>
              <p className="text-sm font-bold truncate max-w-[160px]">{discordName}</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {hasSteam === null ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="w-full flex flex-col items-center"
              >
                <div className="w-14 h-14 bg-gradient-to-tr from-[#5865F2] to-sky-400 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-[#5865F2]/20">
                  <Gamepad2 className="text-white" size={28} />
                </div>

                <h1 className="text-2xl font-bold tracking-tight mb-2">
                  Do you have a Steam account?
                </h1>
                <p className="text-sm text-slate-500 dark:text-white/60 mb-8 max-w-xs">
                  We track game achievements and stats for our bimonthly events. Let us know if you use Steam!
                </p>

                {error && (
                  <div className="w-full mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-2xl text-sm flex gap-2 text-left items-start">
                    <AlertCircle className="shrink-0 mt-0.5" size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex flex-col w-full gap-3">
                  <button
                    onClick={() => setHasSteam(true)}
                    disabled={loading}
                    className="w-full py-4 px-5 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold rounded-2xl flex items-center justify-between border border-white/10 transition-all hover:translate-y-[-1px] active:translate-y-[1px] cursor-pointer shadow-lg shadow-[#5865F2]/10 group"
                  >
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center">
                        <Link2 size={16} />
                      </div>
                      <div>
                        <p className="font-bold text-sm">Yes, I have a Steam account</p>
                        <p className="text-xs text-white/70">Connect my existing achievements</p>
                      </div>
                    </div>
                    <Check size={18} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>

                  <button
                    onClick={handleNoSteam}
                    disabled={loading}
                    className="w-full py-4 px-5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-white font-semibold rounded-2xl flex items-center justify-between border border-black/5 dark:border-white/5 transition-all hover:translate-y-[-1px] active:translate-y-[1px] cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-8 h-8 bg-slate-200 dark:bg-white/10 rounded-xl flex items-center justify-center text-slate-600 dark:text-white/80">
                        <UserPlus size={16} />
                      </div>
                      <div>
                        <p className="font-bold text-sm">No, I do not have Steam</p>
                        <p className="text-xs text-slate-500 dark:text-white/50">Create a Discord-only profile</p>
                      </div>
                    </div>
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-slate-400 dark:border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Check size={18} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 dark:text-white/80" />
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full flex flex-col items-center"
              >
                <div className="w-14 h-14 bg-gradient-to-tr from-sky-500 to-indigo-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-sky-500/20">
                  <Link2 className="text-white" size={28} />
                </div>

                <h1 className="text-2xl font-bold tracking-tight mb-2">
                  Enter your Steam ID
                </h1>
                <p className="text-sm text-slate-500 dark:text-white/60 mb-6 max-w-xs">
                  We will link your Discord account with your Steam profile or sync with an existing member record.
                </p>

                {error && (
                  <div className="w-full mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-2xl text-sm flex gap-2 text-left items-start">
                    <AlertCircle className="shrink-0 mt-0.5" size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleYesSteam} className="w-full text-left">
                  <div className="flex flex-col gap-1.5 mb-6">
                    <label htmlFor="steam-id-input" className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-white/40">
                      Steam ID or Profile Link
                    </label>
                    <input
                      id="steam-id-input"
                      type="text"
                      value={steamId}
                      onChange={(e) => setSteamId(e.target.value)}
                      placeholder="e.g., 76561198117650232 or steamcommunity.com/id/name"
                      disabled={loading}
                      autoFocus
                      className="w-full bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-[#5865F2] font-mono tracking-wider transition-all"
                    />
                    <p className="text-[11px] text-slate-400 dark:text-white/40 leading-normal mt-1 bg-slate-100 dark:bg-white/5 p-3 rounded-xl border border-black/5 dark:border-white/5">
                      <strong className="text-slate-600 dark:text-white/60 block mb-0.5">Accepted Formats:</strong>
                      17-digit Steam ID (e.g., <span className="underline select-all">76561198117650232</span>) or your Steam Profile URL.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setHasSteam(null);
                        setError(null);
                      }}
                      disabled={loading}
                      className="px-5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 text-slate-800 dark:text-white font-semibold rounded-2xl flex items-center justify-center transition-all cursor-pointer h-12 active:scale-95 disabled:opacity-50"
                      title="Back"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer h-12 shadow-lg shadow-[#5865F2]/10 hover:translate-y-[-1px] active:translate-y-[1px] disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Syncing...</span>
                        </>
                      ) : (
                        <span>Complete Setup & Sync</span>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
