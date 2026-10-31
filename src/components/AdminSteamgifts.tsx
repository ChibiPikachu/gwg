import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { SgMemberSummary, SgGroupGiveaway, SgLedgerEntry, SgPlayStats, TEAM_COLORS, Team } from '@/types';
import { 
  Gift, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink, 
  Search, 
  UserCheck, 
  Users, 
  Trophy, 
  Clock, 
  X,
  ChevronRight,
  Shield,
  Layers,
  Sparkles,
  Code,
  FileText,
  Check,
  Copy,
  Upload,
  Download,
  Edit2,
  Play,
  Flame,
  BarChart3,
  Key,
  Filter,
  Gamepad2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface AdminSteamgiftsProps {
  onViewProfile?: (id: string) => void;
}

type MainTab = 'ledger' | 'roster' | 'import_export';

export default function AdminSteamgifts({ onViewProfile }: AdminSteamgiftsProps) {
  const { user: currentUser, theme } = useAuth();

  // Navigation tab
  const [activeTab, setActiveTab] = React.useState<MainTab>('ledger');

  // Ledger state
  const [ledgerEntries, setLedgerEntries] = React.useState<SgLedgerEntry[]>([]);
  const [ledgerMetrics, setLedgerMetrics] = React.useState<any>(null);
  const [loadingLedger, setLoadingLedger] = React.useState(true);
  const [ledgerMode, setLedgerMode] = React.useState<'won' | 'sent'>('won');

  // Members state
  const [members, setMembers] = React.useState<SgMemberSummary[]>([]);
  const [loadingMembers, setLoadingMembers] = React.useState(true);
  const [searchMemberQuery, setSearchMemberQuery] = React.useState('');
  const [filterAccount, setFilterAccount] = React.useState<'all' | 'has_sg' | 'no_sg' | 'in_group'>('all');

  // Ledger filter controls
  const [filterMemberSteamId, setFilterMemberSteamId] = React.useState<string>('all');
  const [filterCreator, setFilterCreator] = React.useState<string>('all');
  const [filterYear, setFilterYear] = React.useState<string>('all');
  const [filterStatus, setFilterStatus] = React.useState<string>('all');
  const [filterProgress, setFilterProgress] = React.useState<string>('all');
  const [searchLedgerQuery, setSearchLedgerQuery] = React.useState('');

  // Steam API Key & Playstats Scanner state
  const [steamApiKey, setSteamApiKey] = React.useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gwg_steam_api_key') || '';
    }
    return '';
  });
  const [showKeyModal, setShowKeyModal] = React.useState(false);
  const [hasServerSteamKey, setHasServerSteamKey] = React.useState(false);
  const [scanningPlaystats, setScanningPlaystats] = React.useState(false);
  const [scanningMemberId, setScanningMemberId] = React.useState<string | null>(null);

  // Public SG scan per-member
  const [scanningPublicSg, setScanningPublicSg] = React.useState<string | null>(null);

  // Inline username edit state
  const [editingSteamId, setEditingSteamId] = React.useState<string | null>(null);
  const [editingUsernameVal, setEditingUsernameVal] = React.useState('');
  const [savingUsername, setSavingUsername] = React.useState(false);

  // Status and session health
  const [sessionHealthy, setSessionHealthy] = React.useState<boolean | null>(null);
  const [sessionMessage, setSessionMessage] = React.useState<string>('');
  const [sessionUsername, setSessionUsername] = React.useState<string>('');
  const [statusMessage, setStatusMessage] = React.useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [syncing, setSyncing] = React.useState(false);

  // Import / Export & Backup state
  const [importPayload, setImportPayload] = React.useState('');
  const [importFormat, setImportFormat] = React.useState<'auto' | 'json' | 'csv' | 'tsv' | 'html'>('auto');
  const [importing, setImporting] = React.useState(false);
  const [importPreview, setImportPreview] = React.useState<any | null>(null);

  // Selected member for inspecting won games modal
  const [selectedMember, setSelectedMember] = React.useState<SgMemberSummary | null>(null);
  const [memberWins, setMemberWins] = React.useState<any[]>([]);
  const [loadingWins, setLoadingWins] = React.useState(false);

  // Headers helper
  const getAdminHeaders = React.useCallback(async (extraHeaders?: Record<string, string>) => {
    let cachedParsed: any = null;
    if (typeof window !== 'undefined') {
      try {
        cachedParsed = JSON.parse(localStorage.getItem('gamer_auth_user') || '{}');
      } catch (e) {
        // ignore
      }
    }
    const userIdHeader = currentUser?.steamId || 
                         currentUser?.uid || 
                         currentUser?.id || 
                         currentUser?.discordId || 
                         cachedParsed?.steamId || 
                         cachedParsed?.uid || 
                         cachedParsed?.id || 
                         '';
    const adminNameHeader = currentUser?.steamName || 
                            currentUser?.discordName || 
                            currentUser?.displayName || 
                            cachedParsed?.steamName || 
                            cachedParsed?.discordName || 
                            cachedParsed?.displayName || 
                            'Admin';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': String(userIdHeader),
      'x-steam-id': String(currentUser?.steamId || cachedParsed?.steamId || userIdHeader),
      'x-discord-id': String(currentUser?.discordId || cachedParsed?.discordId || ''),
      'x-admin-id': String(userIdHeader),
      'x-admin-name': String(adminNameHeader),
      ...extraHeaders
    };

    const keyToUse = steamApiKey.trim() || (typeof window !== 'undefined' ? localStorage.getItem('gwg_steam_api_key') || '' : '');
    if (keyToUse) {
      headers['x-steam-api-key'] = keyToUse;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      } catch (e) {
        // ignore
      }
    }

    return headers;
  }, [currentUser, steamApiKey]);

  // Fetch status and session health
  const fetchStatus = React.useCallback(async () => {
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/steamgifts?action=status', { headers });
      if (res.ok) {
        const data = await res.json();
        setSessionHealthy(Boolean(data.session?.valid));
        setSessionMessage(data.session?.message || '');
        if (data.session?.username) {
          setSessionUsername(data.session.username);
        }
        setHasServerSteamKey(Boolean(data.hasSteamApiKey));
      }
    } catch (err) {
      console.warn('Failed to fetch SteamGifts status:', err);
    }
  }, [getAdminHeaders]);

  // Fetch all members with their SG status & win counts
  const fetchMembers = React.useCallback(async () => {
    setLoadingMembers(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/steamgifts?action=members', { headers });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error('Failed to fetch SteamGifts members:', err);
    } finally {
      setLoadingMembers(false);
    }
  }, [getAdminHeaders]);

  // Fetch full Win Ledger entries & metrics
  const fetchLedger = React.useCallback(async () => {
    setLoadingLedger(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/steamgifts?action=ledger', { headers });
      if (res.ok) {
        const data = await res.json();
        setLedgerEntries(data.entries || []);
        setLedgerMetrics(data.metrics || null);
      }
    } catch (err) {
      console.error('Failed to fetch Win Ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  }, [getAdminHeaders]);

  // Initial load
  React.useEffect(() => {
    fetchStatus();
    fetchMembers();
    fetchLedger();
  }, [fetchStatus, fetchMembers, fetchLedger]);

  // Save Steam API key locally
  const handleSaveSteamApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = steamApiKey.trim();
    if (typeof window !== 'undefined') {
      if (trimmed) {
        localStorage.setItem('gwg_steam_api_key', trimmed);
      } else {
        localStorage.removeItem('gwg_steam_api_key');
      }
    }
    setShowKeyModal(false);
    setStatusMessage({
      text: trimmed ? 'Steam Web API key saved in browser storage.' : 'Steam Web API key cleared.',
      type: 'success'
    });
  };

  // Trigger sync (fast or full)
  const handleSync = async (fullSync: boolean) => {
    setSyncing(true);
    setStatusMessage({
      text: fullSync ? 'Running full sync across all group giveaway pages...' : 'Running fast sync (3 pages)...',
      type: 'info'
    });

    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/steamgifts?action=sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fullSync })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({
          text: `Sync completed! Synced ${data.giveawaysSynced || 0} giveaways, ${data.winnersRecorded || 0} winners recorded, ${data.appIdsBackfilled || 0} game app_ids backfilled.`,
          type: 'success'
        });
        await Promise.all([fetchStatus(), fetchMembers(), fetchLedger()]);
      } else {
        setStatusMessage({
          text: `Sync error: ${data.error || 'Failed to complete SteamGifts sync'}`,
          type: 'error'
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: `Network error during sync: ${err.message}`, type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  // Scan Steam Playstats & Achievements for a member or bulk
  const handleScanPlaystats = async (targetSteamId?: string) => {
    const keyToUse = steamApiKey.trim() || (typeof window !== 'undefined' ? localStorage.getItem('gwg_steam_api_key') || '' : '');
    if (!keyToUse && !hasServerSteamKey) {
      setShowKeyModal(true);
      setStatusMessage({
        text: 'Please configure a Steam Web API Key to scan lifetime playtime and achievements.',
        type: 'info'
      });
      return;
    }

    // Determine target steamids
    const targets = targetSteamId 
      ? [targetSteamId] 
      : Array.from(new Set(ledgerEntries.map(e => e.winner_steamid).filter(Boolean) as string[]));

    if (targets.length === 0) {
      setStatusMessage({
        text: 'No members with recorded giveaway wins or SteamIDs available to scan.',
        type: 'error'
      });
      return;
    }

    setScanningPlaystats(true);
    if (targetSteamId) setScanningMemberId(targetSteamId);
    setStatusMessage({
      text: `Scanning Steam playtime and achievements for ${targets.length} member(s)...`,
      type: 'info'
    });

    try {
      const headers = await getAdminHeaders();
      let totalScanned = 0;

      for (const sid of targets) {
        const res = await fetch('/api/steamgifts', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'scan-playstats',
            steamid: sid,
            apiKey: keyToUse
          })
        });

        if (res.ok) {
          totalScanned++;
        }
      }

      setStatusMessage({
        text: `Playstats scan complete! Refreshed playtime and achievement data for ${totalScanned} member(s).`,
        type: 'success'
      });
      await fetchLedger();
    } catch (err: any) {
      setStatusMessage({ text: `Playstats scan error: ${err.message}`, type: 'error' });
    } finally {
      setScanningPlaystats(false);
      setScanningMemberId(null);
    }
  };

  // Scan Public SteamGifts JSON endpoint per member
  const handleScanPublicSg = async (member: SgMemberSummary) => {
    const username = member.sg_username || member.steam_name;
    if (!username) {
      setStatusMessage({ text: 'Member has no SteamGifts username configured.', type: 'error' });
      return;
    }

    setScanningPublicSg(member.steamid);
    setStatusMessage({
      text: `Scanning public SteamGifts giveaways for @${username}...`,
      type: 'info'
    });

    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/steamgifts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'scan-public-sg',
          sg_username: username,
          mode: 'won'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({
          text: `Public SG scan complete! Synced ${data.totalSynced || 0} giveaways for @${username}${data.verifiedSteamId ? ` (SteamID verified: ${data.verifiedSteamId})` : ''}.`,
          type: 'success'
        });
        await Promise.all([fetchMembers(), fetchLedger()]);
      } else {
        setStatusMessage({ text: `Scan error: ${data.error || 'Failed to scan public SG'}`, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: `Scan error: ${err.message}`, type: 'error' });
    } finally {
      setScanningPublicSg(null);
    }
  };

  // Save inline edited SG username
  const handleSaveInlineUsername = async (steamid: string) => {
    setSavingUsername(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/steamgifts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'update-mapping',
          steamid,
          sg_username: editingUsernameVal.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ text: `Updated SteamGifts username for member to @${editingUsernameVal.trim()}!`, type: 'success' });
        setEditingSteamId(null);
        await Promise.all([fetchMembers(), fetchLedger()]);
      } else {
        setStatusMessage({ text: `Failed to update username: ${data.error}`, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: `Error: ${err.message}`, type: 'error' });
    } finally {
      setSavingUsername(false);
    }
  };

  // Import preview & apply
  const handlePreviewImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importPayload.trim()) return;

    setImporting(true);
    setStatusMessage({ text: 'Previewing import data...', type: 'info' });

    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/steamgifts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'import-ledger',
          payload: importPayload.trim(),
          format: importFormat,
          dryRun: true
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setImportPreview(data);
        setStatusMessage({
          text: `Import preview ready: Found ${data.totalParsed} giveaway item(s) in ${data.detectedFormat.toUpperCase()} format.`,
          type: 'success'
        });
      } else {
        setStatusMessage({ text: `Preview error: ${data.error || 'Failed to parse payload'}`, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: `Preview error: ${err.message}`, type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const handleApplyImport = async () => {
    if (!importPayload.trim()) return;

    setImporting(true);
    setStatusMessage({ text: 'Importing giveaways and winners to Supabase...', type: 'info' });

    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/steamgifts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'import-ledger',
          payload: importPayload.trim(),
          format: importFormat,
          dryRun: false
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({
          text: data.message || `Successfully imported ${data.giveawaysUpserted} giveaways and ${data.winnersUpserted} winners!`,
          type: 'success'
        });
        setImportPayload('');
        setImportPreview(null);
        await Promise.all([fetchStatus(), fetchMembers(), fetchLedger()]);
      } else {
        setStatusMessage({ text: `Import error: ${data.error || 'Failed to apply import'}`, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: `Import error: ${err.message}`, type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  // Export ledger
  const handleExportLedger = (format: 'json' | 'csv' | 'tsv') => {
    window.open(`/api/steamgifts?action=export-ledger&format=${format}`, '_blank');
  };

  // Inspect member wins modal
  const handleInspectMember = async (member: SgMemberSummary) => {
    setSelectedMember(member);
    setLoadingWins(true);
    setMemberWins([]);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/steamgifts?action=wins&steamid=${member.steamid}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMemberWins(data.wins || []);
      }
    } catch (err) {
      console.error('Failed to load member wins:', err);
    } finally {
      setLoadingWins(false);
    }
  };

  // Filtered ledger entries
  const filteredLedgerEntries = React.useMemo(() => {
    return ledgerEntries.filter(entry => {
      // Search query
      if (searchLedgerQuery.trim()) {
        const q = searchLedgerQuery.toLowerCase().trim();
        const matchesName = entry.name.toLowerCase().includes(q);
        const matchesWinner = (entry.winner_steam_name || '').toLowerCase().includes(q) ||
                              entry.winner_sg_username.toLowerCase().includes(q);
        const matchesCreator = (entry.creator_username || '').toLowerCase().includes(q);
        const matchesCode = entry.giveaway_code.toLowerCase().includes(q);
        if (!matchesName && !matchesWinner && !matchesCreator && !matchesCode) return false;
      }

      // Member filter
      if (filterMemberSteamId !== 'all') {
        if (entry.winner_steamid !== filterMemberSteamId) return false;
      }

      // Creator filter
      if (filterCreator !== 'all') {
        if (entry.creator_username !== filterCreator) return false;
      }

      // Year filter
      if (filterYear !== 'all') {
        const year = entry.end_timestamp ? new Date(entry.end_timestamp * 1000).getFullYear() : new Date(entry.created_at).getFullYear();
        if (String(year) !== filterYear) return false;
      }

      // Status filter
      if (filterStatus !== 'all') {
        if (entry.status !== filterStatus) return false;
      }

      // Play progress filter
      if (filterProgress !== 'all') {
        const pStat = entry.play_stats?.status || 'zero';
        const minutes = entry.play_stats?.minutes || 0;
        if (filterProgress === 'zero' && (minutes > 0 || pStat !== 'zero')) return false;
        if (filterProgress === 'started' && pStat !== 'started') return false;
        if (filterProgress === 'played' && pStat !== 'played') return false;
        if (filterProgress === 'completed' && pStat !== 'completed') return false;
        if (filterProgress === 'any' && minutes === 0) return false;
      }

      return true;
    });
  }, [ledgerEntries, searchLedgerQuery, filterMemberSteamId, filterCreator, filterYear, filterStatus, filterProgress]);

  // Unique creators list for filter
  const uniqueCreators = React.useMemo(() => {
    const set = new Set<string>();
    ledgerEntries.forEach(e => {
      if (e.creator_username) set.add(e.creator_username);
    });
    return Array.from(set).sort();
  }, [ledgerEntries]);

  // Unique years for filter
  const uniqueYears = React.useMemo(() => {
    const set = new Set<number>();
    ledgerEntries.forEach(e => {
      const yr = e.end_timestamp ? new Date(e.end_timestamp * 1000).getFullYear() : new Date(e.created_at).getFullYear();
      if (yr > 2000) set.add(yr);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [ledgerEntries]);

  // Filtered members list
  const filteredMembers = React.useMemo(() => {
    return members.filter(m => {
      const name = (m.steam_name || '').toLowerCase();
      const sid = (m.steamid || '').toLowerCase();
      const sgUser = (m.sg_username || '').toLowerCase();
      const disc = (m.discord_name || '').toLowerCase();
      const q = searchMemberQuery.toLowerCase().trim();

      const matchesSearch = !q || name.includes(q) || sid.includes(q) || sgUser.includes(q) || disc.includes(q);

      let matchesAccount = true;
      if (filterAccount === 'has_sg') matchesAccount = m.has_sg_account;
      else if (filterAccount === 'no_sg') matchesAccount = !m.has_sg_account;
      else if (filterAccount === 'in_group') matchesAccount = m.in_sg_group;

      return matchesSearch && matchesAccount;
    });
  }, [members, searchMemberQuery, filterAccount]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      {/* 1. Master Header with Win Ledger Port Banner & Actions */}
      <div className="dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b dark:border-white/5 border-black/5 pb-5">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <Gift size={22} />
              </span>
              <h2 className="text-xl font-bold dark:text-white text-slate-800">
                SteamGifts Win Ledger & Group Tracker
              </h2>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                Admin Win Ledger
              </span>
            </div>
            <p className="text-xs opacity-60 max-w-2xl leading-relaxed">
              Native port of the SteamGifts Win Ledger with Steam Web API playstats scanning, lifetime playtime tracking,
              achievement percentages, and direct user redirects with zero Cloudflare 403 blocks.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Steam API Key Config Button */}
            <button
              onClick={() => setShowKeyModal(true)}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm border",
                (steamApiKey || hasServerSteamKey)
                  ? "dark:bg-white/5 bg-slate-100 dark:text-white text-slate-700 border-black/5 dark:border-white/10"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse"
              )}
              title="Configure Steam Web API Key for playtime and achievements scanning"
            >
              <Key size={14} className={cn((steamApiKey || hasServerSteamKey) ? "text-purple-400" : "text-amber-400")} />
              <span>{(steamApiKey || hasServerSteamKey) ? 'Steam API Key: Active' : 'Set Steam API Key'}</span>
            </button>

            {/* Scan Steam Playstats Button */}
            <button
              onClick={() => handleScanPlaystats()}
              disabled={scanningPlaystats || syncing}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm border",
                "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/30 disabled:opacity-50"
              )}
              title="Scan Steam playtime and achievements for all group winners"
            >
              <Play size={13} className={cn(scanningPlaystats && "animate-spin")} />
              <span>{scanningPlaystats ? 'Scanning Playstats...' : 'Scan Steam Playstats'}</span>
            </button>

            {/* Fast Sync */}
            <button
              onClick={() => handleSync(false)}
              disabled={syncing || scanningPlaystats}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm border",
                "bg-purple-600 hover:bg-purple-500 text-white border-purple-500/30 disabled:opacity-50"
              )}
              title="Fast sync the 3 most recent pages of group giveaways"
            >
              <RefreshCw size={13} className={cn(syncing && "animate-spin")} />
              <span>{syncing ? 'Syncing...' : 'Fast Sync (3 Pages)'}</span>
            </button>
          </div>
        </div>

        {/* Tab Switcher: Win Ledger vs Member Directory vs Backups */}
        <div className="flex items-center gap-2 border-b dark:border-white/5 border-black/5 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('ledger')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0",
              activeTab === 'ledger'
                ? "bg-purple-600 text-white shadow-md font-black"
                : "opacity-60 hover:opacity-100 dark:text-white text-slate-700 hover:bg-black/5 dark:hover:bg-white/5"
            )}
          >
            <Trophy size={14} />
            <span>Win Ledger Dashboard ({ledgerEntries.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('roster')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0",
              activeTab === 'roster'
                ? "bg-purple-600 text-white shadow-md font-black"
                : "opacity-60 hover:opacity-100 dark:text-white text-slate-700 hover:bg-black/5 dark:hover:bg-white/5"
            )}
          >
            <Users size={14} />
            <span>Member Directory & Account Resolver ({members.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('import_export')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0",
              activeTab === 'import_export'
                ? "bg-purple-600 text-white shadow-md font-black"
                : "opacity-60 hover:opacity-100 dark:text-white text-slate-700 hover:bg-black/5 dark:hover:bg-white/5"
            )}
          >
            <Upload size={14} />
            <span>Import / Export & Backups</span>
          </button>
        </div>

        {/* Status Toast / Alert Message */}
        {statusMessage && (
          <div className={cn(
            "p-3 rounded-2xl text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in border",
            statusMessage.type === 'success' && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
            statusMessage.type === 'error' && "bg-rose-500/10 border-rose-500/20 text-rose-400",
            statusMessage.type === 'info' && "bg-purple-500/10 border-purple-500/20 text-purple-300"
          )}>
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' && <CheckCircle2 size={15} />}
              {statusMessage.type === 'error' && <AlertTriangle size={15} />}
              {statusMessage.type === 'info' && <Sparkles size={15} />}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-xs opacity-60 hover:opacity-100 p-0.5 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 2. TAB CONTENT: WIN LEDGER DASHBOARD */}
      {activeTab === 'ledger' && (
        <div className="flex flex-col gap-6">
          {/* Win Ledger Playstats Summary Metrics (Ported from Win Ledger) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-2xl dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 flex flex-col justify-between gap-1 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 flex items-center gap-1">
                <Play size={11} /> Started (&gt;0%)
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-black font-mono dark:text-white text-slate-900">
                  {ledgerMetrics?.startedCount || 0}
                </span>
                <span className="text-xs font-bold text-sky-400 font-mono">
                  {ledgerMetrics?.startedPercent || 0}%
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 flex flex-col justify-between gap-1 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                <Gamepad2 size={11} /> Played (≥25%)
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-black font-mono dark:text-white text-slate-900">
                  {ledgerMetrics?.playedCount || 0}
                </span>
                <span className="text-xs font-bold text-indigo-400 font-mono">
                  {ledgerMetrics?.playedPercent || 0}%
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 flex flex-col justify-between gap-1 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                <Trophy size={11} /> Completed (100%)
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-black font-mono dark:text-white text-slate-900">
                  {ledgerMetrics?.completedCount || 0}
                </span>
                <span className="text-xs font-bold text-emerald-400 font-mono">
                  {ledgerMetrics?.completedPercent || 0}%
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 flex flex-col justify-between gap-1 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                <Flame size={11} /> Avg Achievements
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-black font-mono text-amber-400">
                  {ledgerMetrics?.avgAchievementPercent || 0}%
                </span>
                <span className="text-[10px] opacity-40 font-mono">progress</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 flex flex-col justify-between gap-1 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 flex items-center gap-1">
                <Clock size={11} /> Any Playtime
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-black font-mono dark:text-white text-slate-900">
                  {ledgerMetrics?.anyPlaytimeCount || 0}
                </span>
                <span className="text-xs font-bold text-purple-400 font-mono">
                  {ledgerMetrics?.anyPlaytimePercent || 0}%
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 flex flex-col justify-between gap-1 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1">
                <BarChart3 size={11} /> Avg Playtime
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-black font-mono dark:text-white text-slate-900">
                  {ledgerMetrics?.avgPlaytimeHours || 0}h
                </span>
                <span className="text-[10px] opacity-40 font-mono">per game</span>
              </div>
            </div>
          </div>

          {/* Yearly Playstats Bar Visual */}
          {ledgerMetrics?.yearly && Object.keys(ledgerMetrics.yearly).length > 0 && (
            <div className="p-5 rounded-3xl dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 shadow-sm flex flex-col gap-3">
              <span className="text-xs font-black uppercase tracking-wider dark:text-white text-slate-800 flex items-center gap-2">
                <BarChart3 size={14} className="text-purple-400" />
                Yearly Giveaway Wins & Play Progress
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {Object.entries(ledgerMetrics.yearly).sort(([a], [b]) => Number(b) - Number(a)).map(([year, val]: [string, any]) => (
                  <div key={year} className="p-3 rounded-xl bg-black/5 dark:bg-black/30 border border-black/5 dark:border-white/5 flex flex-col gap-1">
                    <span className="text-xs font-black text-purple-400 font-mono">{year}</span>
                    <span className="text-base font-bold dark:text-white text-slate-800 font-mono">
                      {val.count} <span className="text-[10px] font-normal opacity-50">won</span>
                    </span>
                    <div className="flex items-center justify-between text-[10px] opacity-70 font-mono pt-1 border-t border-black/5 dark:border-white/5">
                      <span className="text-emerald-400">{val.completed} 100%</span>
                      <span className="text-sky-400">{val.played} played</span>
                      <span>{(val.totalMinutes / 60).toFixed(0)}h</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter Toolbar for Win Ledger */}
          <div className="p-5 rounded-3xl dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search game title, winner name, creator, or code..."
                    value={searchLedgerQuery}
                    onChange={(e) => setSearchLedgerQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl dark:bg-black/40 bg-slate-50 border dark:border-white/10 border-black/10 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:text-white text-slate-900"
                  />
                  {searchLedgerQuery && (
                    <button
                      onClick={() => setSearchLedgerQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs opacity-50 hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Member Dropdown Filter */}
                <select
                  value={filterMemberSteamId}
                  onChange={(e) => setFilterMemberSteamId(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-bold dark:bg-black/40 bg-slate-50 border dark:border-white/10 border-black/10 dark:text-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="all">All Members ({members.length})</option>
                  {members.map(m => (
                    <option key={m.steamid} value={m.steamid}>
                      {m.steam_name} ({m.total_wins} wins)
                    </option>
                  ))}
                </select>
              </div>

              {/* Status and Progress Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Year filter */}
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-bold dark:bg-black/40 bg-slate-50 border dark:border-white/10 border-black/10 dark:text-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="all">All Years</option>
                  {uniqueYears.map(yr => (
                    <option key={yr} value={String(yr)}>{yr}</option>
                  ))}
                </select>

                {/* Progress filter */}
                <select
                  value={filterProgress}
                  onChange={(e) => setFilterProgress(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-bold dark:bg-black/40 bg-slate-50 border dark:border-white/10 border-black/10 dark:text-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="all">All Progress</option>
                  <option value="zero">Zero Playtime (0h)</option>
                  <option value="started">Started (&gt;0%)</option>
                  <option value="played">Played (≥25%)</option>
                  <option value="completed">Completed (100%)</option>
                  <option value="any">Any Playtime (&gt;0h)</option>
                </select>

                {/* Receipt Status Filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-bold dark:bg-black/40 bg-slate-50 border dark:border-white/10 border-black/10 dark:text-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="Received">Received</option>
                  <option value="Awaiting Feedback">Awaiting Feedback</option>
                  <option value="Not Received">Not Received</option>
                </select>

                <button
                  onClick={() => {
                    setSearchLedgerQuery('');
                    setFilterMemberSteamId('all');
                    setFilterCreator('all');
                    setFilterYear('all');
                    setFilterStatus('all');
                    setFilterProgress('all');
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold opacity-60 hover:opacity-100 dark:hover:bg-white/10 hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs opacity-60 border-t dark:border-white/5 border-black/5 pt-2">
              <span>Showing {filteredLedgerEntries.length} of {ledgerEntries.length} giveaways</span>
              {filterMemberSteamId !== 'all' && (
                <button
                  onClick={() => handleScanPlaystats(filterMemberSteamId)}
                  disabled={scanningPlaystats}
                  className="text-xs font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
                >
                  <Play size={11} />
                  <span>Scan Playstats for Selected Member</span>
                </button>
              )}
            </div>
          </div>

          {/* Win Ledger Table */}
          <div className="dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 rounded-3xl overflow-hidden shadow-sm">
            {loadingLedger ? (
              <div className="p-16 text-center text-xs opacity-50 flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin text-purple-400" />
                <span>Loading Win Ledger entries and playstats...</span>
              </div>
            ) : filteredLedgerEntries.length === 0 ? (
              <div className="p-16 text-center text-xs opacity-50 flex flex-col items-center justify-center gap-2">
                <Gift size={32} className="opacity-30 mb-1" />
                <span>No giveaways matching current filters.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b dark:border-white/5 border-black/5 bg-black/5 dark:bg-black/30 text-[10px] uppercase font-black tracking-wider opacity-60">
                      <th className="py-3 px-4">Game</th>
                      <th className="py-3 px-4">Winner</th>
                      <th className="py-3 px-4">Achievement Progress</th>
                      <th className="py-3 px-4">Playtime</th>
                      <th className="py-3 px-4">Creator</th>
                      <th className="py-3 px-4">Points</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-white/5 divide-black/5">
                    {filteredLedgerEntries.map((entry) => {
                      const steamAppId = entry.app_id;
                      const headerImg = steamAppId 
                        ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`
                        : null;
                      const sgUrl = `https://www.steamgifts.com/giveaway/${entry.giveaway_code}/${entry.slug || 'giveaway'}`;
                      const achStats = entry.play_stats;
                      const achLink = (entry.winner_steamid && steamAppId)
                        ? `https://steamcommunity.com/profiles/${entry.winner_steamid}/stats/${steamAppId}/?tab=achievements`
                        : null;

                      return (
                        <tr key={entry.id} className="hover:dark:bg-white/[0.02] hover:bg-black/[0.02] transition-colors">
                          {/* Game Thumbnail + Title */}
                          <td className="py-3 px-4 min-w-[240px]">
                            <div className="flex items-center gap-3">
                              {headerImg ? (
                                <img
                                  src={headerImg}
                                  alt=""
                                  className="w-16 h-8 rounded-lg object-cover border dark:border-white/10 border-black/10 shrink-0 bg-black/30"
                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                              ) : (
                                <div className="w-16 h-8 rounded-lg bg-black/10 dark:bg-white/5 flex items-center justify-center opacity-30 shrink-0">
                                  <Gift size={14} />
                                </div>
                              )}
                              <div className="flex flex-col min-w-0">
                                <a
                                  href={sgUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold dark:text-white text-slate-800 hover:text-purple-400 transition-colors truncate"
                                  title="Open on SteamGifts"
                                >
                                  {entry.name}
                                </a>
                                <div className="flex items-center gap-1.5 text-[10px] opacity-50 font-mono mt-0.5">
                                  {steamAppId && (
                                    <a
                                      href={`https://store.steampowered.com/app/${steamAppId}/`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline hover:text-sky-400"
                                    >
                                      AppID: {steamAppId}
                                    </a>
                                  )}
                                  {entry.end_timestamp && (
                                    <span>• {new Date(entry.end_timestamp * 1000).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Winner */}
                          <td className="py-3 px-4 min-w-[180px]">
                            <div className="flex flex-col">
                              <span className="font-bold dark:text-white text-slate-800 flex items-center gap-1.5">
                                {entry.winner_steam_name || entry.winner_sg_username}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] mt-0.5">
                                <span className="opacity-60 font-mono">@{entry.winner_sg_username}</span>
                                {entry.winner_steamid && (
                                  <a
                                    href={`https://www.steamgifts.com/go/user/${entry.winner_steamid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-purple-400 hover:text-purple-300 flex items-center gap-0.5 font-bold"
                                    title="Open direct browser profile link"
                                  >
                                    <span>/go/user</span>
                                    <ExternalLink size={9} />
                                  </a>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Achievements Progress */}
                          <td className="py-3 px-4 min-w-[160px]">
                            {achStats && achStats.total > 0 ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-[11px] font-mono">
                                  <span className="font-bold">
                                    {achStats.earned} / {achStats.total}
                                  </span>
                                  <span className={cn(
                                    "font-black text-[10px] px-1.5 py-0.2 rounded",
                                    achStats.percent === 100 && "bg-emerald-500/20 text-emerald-400",
                                    achStats.percent >= 25 && achStats.percent < 100 && "bg-indigo-500/20 text-indigo-400",
                                    achStats.percent > 0 && achStats.percent < 25 && "bg-sky-500/20 text-sky-400",
                                    achStats.percent === 0 && "opacity-40"
                                  )}>
                                    {achStats.percent}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-black/20 dark:bg-white/10 overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      achStats.percent === 100 ? "bg-emerald-400" :
                                      achStats.percent >= 25 ? "bg-indigo-400" :
                                      achStats.percent > 0 ? "bg-sky-400" : "bg-transparent"
                                    )}
                                    style={{ width: `${achStats.percent}%` }}
                                  />
                                </div>
                                {achLink && (
                                  <a
                                    href={achLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[9px] opacity-40 hover:opacity-100 hover:underline flex items-center gap-1"
                                  >
                                    <span>Inspect Achievements</span>
                                    <ExternalLink size={8} />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] opacity-40 italic">
                                {achStats ? 'No achievements' : 'Unscanned'}
                              </span>
                            )}
                          </td>

                          {/* Playtime */}
                          <td className="py-3 px-4 min-w-[100px] font-mono">
                            {achStats ? (
                              <div className="flex flex-col">
                                <span className={cn(
                                  "font-bold text-xs",
                                  achStats.minutes > 0 ? "text-purple-400" : "opacity-40"
                                )}>
                                  {(achStats.minutes / 60).toFixed(1)}h
                                </span>
                                <span className="text-[9px] opacity-40">
                                  {achStats.minutes} mins
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] opacity-40 italic">0h</span>
                            )}
                          </td>

                          {/* Creator */}
                          <td className="py-3 px-4 font-mono text-[11px] opacity-75">
                            {entry.creator_username ? `@${entry.creator_username}` : '—'}
                          </td>

                          {/* Points */}
                          <td className="py-3 px-4 font-mono font-bold text-xs">
                            {entry.points > 0 ? `${entry.points}P` : '0P'}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            <span className={cn(
                              "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap",
                              entry.status === 'Received' && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                              entry.status === 'Awaiting Feedback' && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                              entry.status === 'Not Received' && "bg-rose-500/15 text-rose-400 border-rose-500/30",
                              entry.status === 'Unknown' && "bg-black/10 dark:bg-white/10 text-slate-400 dark:text-white/40 border-black/10 dark:border-white/10"
                            )}>
                              {entry.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {entry.winner_steamid && (
                                <button
                                  type="button"
                                  onClick={() => handleScanPlaystats(entry.winner_steamid!)}
                                  disabled={scanningPlaystats}
                                  className="p-1.5 rounded-lg dark:bg-white/5 bg-slate-100 hover:bg-purple-500/20 text-slate-500 dark:text-white/60 hover:text-purple-400 transition-colors cursor-pointer"
                                  title="Scan playstats for this user"
                                >
                                  <Play size={12} className={cn(scanningMemberId === entry.winner_steamid && "animate-spin")} />
                                </button>
                              )}
                              <a
                                href={sgUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg dark:bg-white/5 bg-slate-100 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 hover:dark:text-white transition-colors"
                                title="Open giveaway on SteamGifts"
                              >
                                <ExternalLink size={12} />
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. TAB CONTENT: MEMBER DIRECTORY & ACCOUNT RESOLVER */}
      {activeTab === 'roster' && (
        <div className="dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 max-w-md">
              <span className="text-[10px] uppercase font-black tracking-widest opacity-40 block mb-2 dark:text-white text-slate-500">
                Filter Member Directory
              </span>
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 dark:text-white/30 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search member name, SteamID, or SteamGifts username..."
                  value={searchMemberQuery}
                  onChange={(e) => setSearchMemberQuery(e.target.value)}
                  className="w-full dark:bg-black/40 bg-slate-50 border dark:border-white/10 border-black/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-medium dark:text-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                {searchMemberQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchMemberQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-50 hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'has_sg', 'in_group', 'no_sg'] as const).map((filterKey) => (
                <button
                  key={filterKey}
                  onClick={() => setFilterAccount(filterKey)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    filterAccount === filterKey
                      ? "bg-purple-600 text-white shadow-sm"
                      : "dark:bg-white/5 bg-slate-100 dark:text-white/60 text-slate-600 hover:dark:text-white hover:text-slate-900"
                  )}
                >
                  {filterKey === 'all' && `All Members (${members.length})`}
                  {filterKey === 'has_sg' && `Has SG Account (${members.filter(m => m.has_sg_account).length})`}
                  {filterKey === 'in_group' && `In SG Group (${members.filter(m => m.in_sg_group).length})`}
                  {filterKey === 'no_sg' && `No SG Account (${members.filter(m => !m.has_sg_account).length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Member Cards */}
          {loadingMembers ? (
            <div className="p-12 text-center text-xs opacity-50 flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin text-purple-400" />
              <span>Loading member roster...</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center text-xs opacity-50">
              No matching members found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMembers.map((member) => {
                const avatar = member.active_avatar === 'discord' && member.discord_avatar
                  ? member.discord_avatar
                  : (member.steam_avatar || member.discord_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80');

                const isEditingThis = editingSteamId === member.steamid;

                return (
                  <div
                    key={member.steamid}
                    className="p-4 rounded-2xl dark:bg-black/20 bg-slate-50 border dark:border-white/5 border-black/5 flex flex-col justify-between gap-3 hover:border-purple-500/30 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={avatar}
                          alt=""
                          className="w-10 h-10 rounded-xl object-cover border dark:border-white/10 border-black/10 shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold dark:text-white text-slate-800 truncate flex items-center gap-1.5">
                            {member.steam_name}
                            {member.team && member.team !== 'none' && (
                              <span className={cn(
                                "text-[8px] font-black uppercase px-1 py-0.2 rounded border",
                                TEAM_COLORS[member.team as Team]?.primary || "text-slate-400",
                                TEAM_COLORS[member.team as Team]?.border || "border-white/10",
                                TEAM_COLORS[member.team as Team]?.secondary || "bg-white/5"
                              )}>
                                {member.team}
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] font-mono opacity-40 truncate">
                            {member.steamid}
                          </span>
                        </div>
                      </div>

                      {/* Header Buttons: Direct SG Link & Total Wins Badge */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={`https://www.steamgifts.com/go/user/${member.steamid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-xl text-[10px] font-bold dark:bg-purple-500/10 bg-purple-50 hover:dark:bg-purple-500/20 hover:bg-purple-100 text-purple-400 hover:text-purple-300 transition-all flex items-center gap-1 border border-purple-500/25 shrink-0 cursor-pointer"
                          title="Open user on SteamGifts via direct browser redirect"
                        >
                          <span>/go/user</span>
                          <ExternalLink size={10} />
                        </a>

                        <button
                          type="button"
                          onClick={() => handleInspectMember(member)}
                          className={cn(
                            "px-2 py-1 rounded-xl font-mono text-[11px] font-black transition-all cursor-pointer flex items-center gap-1 border shrink-0",
                            member.total_wins > 0
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                              : "bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/40 border-black/5 dark:border-white/5"
                          )}
                          title="Inspect group giveaways won by this member"
                        >
                          <Trophy size={10} className={member.total_wins > 0 ? "text-emerald-400" : "opacity-40"} />
                          <span>{member.total_wins}</span>
                        </button>
                      </div>
                    </div>

                    {/* Inline SG Username Display & Editor */}
                    <div className="pt-2 border-t dark:border-white/5 border-black/5 flex flex-col gap-2">
                      {isEditingThis ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingUsernameVal}
                            onChange={(e) => setEditingUsernameVal(e.target.value)}
                            placeholder="SteamGifts username..."
                            className="flex-1 px-2.5 py-1 text-xs rounded-lg dark:bg-black/50 bg-white border dark:border-white/20 border-black/20 focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-800 dark:text-white font-mono"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveInlineUsername(member.steamid)}
                            disabled={savingUsername}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSteamId(null)}
                            className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-white/10 text-xs font-bold transition-all cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            {member.has_sg_account && member.sg_username ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                <a
                                  href={`https://www.steamgifts.com/user/${member.sg_username}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-purple-400 hover:text-purple-300 hover:underline truncate"
                                >
                                  @{member.sg_username}
                                </a>
                                {member.in_sg_group && (
                                  <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-purple-500/10 text-purple-300 font-extrabold border border-purple-500/20">
                                    In Group
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-400 dark:text-white/30 text-[10px] font-bold">
                                No SG account linked
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setEditingSteamId(member.steamid);
                                setEditingUsernameVal(member.sg_username || member.steam_name || '');
                              }}
                              className="text-slate-400 hover:text-purple-400 p-0.5 transition-colors cursor-pointer"
                              title="Edit SteamGifts username"
                            >
                              <Edit2 size={11} />
                            </button>
                          </div>

                          {/* 1-Click Public SG JSON Scanner button */}
                          <button
                            type="button"
                            onClick={() => handleScanPublicSg(member)}
                            disabled={scanningPublicSg === member.steamid}
                            className="text-[10px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer bg-sky-500/10 hover:bg-sky-500/20 px-2 py-0.5 rounded-md border border-sky-500/20 transition-all disabled:opacity-50"
                            title="Scan public SteamGifts giveaways JSON (/user/{name}/giveaways/won?format=json)"
                          >
                            <RefreshCw size={10} className={cn(scanningPublicSg === member.steamid && "animate-spin")} />
                            <span>Scan Public SG</span>
                          </button>
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

      {/* 4. TAB CONTENT: IMPORT / EXPORT & BACKUPS */}
      {activeTab === 'import_export' && (
        <div className="dark:bg-[#111111] bg-white border dark:border-white/5 border-black/5 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
          {/* Export Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-black/5 dark:bg-black/30 border border-black/5 dark:border-white/5">
            <div>
              <h3 className="text-sm font-bold dark:text-white text-slate-800 flex items-center gap-2">
                <Download size={16} className="text-purple-400" />
                Export Win Ledger Backups
              </h3>
              <p className="text-xs opacity-60 mt-0.5">
                Download your complete giveaways, winners, and playstats records for offline analysis or archiving.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleExportLedger('json')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Download size={12} />
                <span>Export JSON</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportLedger('csv')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold dark:bg-white/5 bg-slate-100 hover:bg-slate-200 dark:hover:bg-white/10 dark:text-white text-slate-700 transition-all cursor-pointer flex items-center gap-1.5 border border-black/5 dark:border-white/10"
              >
                <Download size={12} />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportLedger('tsv')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold dark:bg-white/5 bg-slate-100 hover:bg-slate-200 dark:hover:bg-white/10 dark:text-white text-slate-700 transition-all cursor-pointer flex items-center gap-1.5 border border-black/5 dark:border-white/10"
              >
                <Download size={12} />
                <span>Export TSV</span>
              </button>
            </div>
          </div>

          {/* Import / Paste Ingestion Form */}
          <form onSubmit={handlePreviewImport} className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b dark:border-white/5 border-black/5 pb-3">
              <div>
                <h3 className="text-sm font-bold dark:text-white text-slate-800 flex items-center gap-2">
                  <Upload size={16} className="text-amber-400" />
                  Native File / Paste Import & Sync
                </h3>
                <p className="text-xs opacity-60 mt-0.5">
                  Paste JSON, CSV, TSV, or raw SteamGifts group page outerHTML (from browser Console or Page Source) to upsert into Supabase.
                </p>
              </div>

              {/* Format Switcher */}
              <div className="flex items-center bg-black/10 dark:bg-black/30 p-1 rounded-xl border border-black/5 dark:border-white/10 text-xs">
                {(['auto', 'json', 'csv', 'tsv', 'html'] as const).map(fmt => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setImportFormat(fmt)}
                    className={cn(
                      "px-3 py-1 rounded-lg font-bold uppercase transition-all cursor-pointer text-[10px]",
                      importFormat === fmt
                        ? "bg-amber-500 text-black shadow-sm font-black"
                        : "opacity-60 hover:opacity-100 dark:text-white text-slate-700"
                    )}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-white/50 flex items-center justify-between">
                <span>Payload Content ({importFormat.toUpperCase()}):</span>
                {importPayload && (
                  <span className="font-mono text-[9px] opacity-60">
                    {(importPayload.length / 1024).toFixed(1)} KB entered
                  </span>
                )}
              </label>
              <textarea
                rows={8}
                value={importPayload}
                onChange={(e) => {
                  setImportPayload(e.target.value);
                  setImportPreview(null);
                }}
                placeholder="Paste JSON array, CSV/TSV lines, or raw SteamGifts page HTML here..."
                className="w-full p-3 font-mono text-xs rounded-2xl dark:bg-black/40 bg-slate-50 border dark:border-white/10 border-black/10 focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-800 dark:text-white"
                required
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => { setImportPayload(''); setImportPreview(null); }}
                disabled={!importPayload || importing}
                className="px-3 py-2 rounded-xl text-xs font-bold dark:bg-white/5 bg-slate-100 hover:bg-slate-200 dark:hover:bg-white/10 dark:text-white text-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
              >
                Clear
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={importing || !importPayload.trim()}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold dark:bg-white/10 bg-slate-200 hover:dark:bg-white/20 hover:bg-slate-300 dark:text-white text-slate-800 transition-all cursor-pointer disabled:opacity-50"
                >
                  {importing ? 'Analyzing...' : 'Preview Import'}
                </button>

                <button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={importing || !importPayload.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  <Upload size={13} className={cn(importing && "animate-spin")} />
                  <span>Apply Import to Supabase</span>
                </button>
              </div>
            </div>

            {/* Preview Box */}
            {importPreview && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col gap-2 mt-2 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400">
                    ✓ Found {importPreview.totalParsed} record(s) formatted as {importPreview.detectedFormat.toUpperCase()}
                  </span>
                  <span className="text-[10px] opacity-60">Ready to commit</span>
                </div>
                {importPreview.preview && importPreview.preview.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1 max-h-40 overflow-y-auto font-mono text-[11px] opacity-80">
                    {importPreview.preview.map((p: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between border-b border-amber-500/10 py-1">
                        <span>{p.name} ({p.code})</span>
                        <span>{p.creator_username ? `Created by @${p.creator_username}` : ''} {p.points ? `• ${p.points}P` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      )}

      {/* 5. MODAL: STEAM WEB API KEY CONFIGURATION */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 backdrop-blur-md bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <form
            onSubmit={handleSaveSteamApiKey}
            className="dark:bg-[#141414] bg-white border dark:border-white/10 border-black/10 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b dark:border-white/10 border-black/10 pb-3">
              <h3 className="font-bold text-base dark:text-white text-slate-900 flex items-center gap-2">
                <Key className="text-purple-400" size={18} />
                Steam Web API Key
              </h3>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Steam Web API queries (`api.steampowered.com`) do not use Cloudflare and are never blocked.
              Enter your 32-character key from{' '}
              <a
                href="https://steamcommunity.com/dev/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline inline-flex items-center gap-0.5"
              >
                <span>steamcommunity.com/dev/apikey</span>
                <ExternalLink size={10} />
              </a>.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-white/50">
                Steam Web API Key:
              </label>
              <input
                type="password"
                value={steamApiKey}
                onChange={(e) => setSteamApiKey(e.target.value)}
                placeholder="32-character hexadecimal key..."
                className="w-full px-3.5 py-2.5 font-mono text-xs rounded-xl dark:bg-black/50 bg-slate-50 border dark:border-white/10 border-black/10 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:text-white text-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t dark:border-white/10 border-black/10">
              <button
                type="button"
                onClick={() => {
                  setSteamApiKey('');
                  if (typeof window !== 'undefined') localStorage.removeItem('gwg_steam_api_key');
                  setShowKeyModal(false);
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold opacity-60 hover:opacity-100 cursor-pointer"
              >
                Clear
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all cursor-pointer shadow-md"
              >
                Save Key
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 6. MODAL: MEMBER WINS INSPECTION */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 backdrop-blur-md bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="dark:bg-[#141414] bg-white border dark:border-white/10 border-black/10 rounded-3xl p-6 max-w-2xl w-full shadow-2xl flex flex-col gap-4 max-h-[85vh] animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b dark:border-white/10 border-black/10 pb-4">
              <div className="flex items-center gap-3">
                <img
                  src={selectedMember.active_avatar === 'discord' && selectedMember.discord_avatar
                    ? selectedMember.discord_avatar
                    : (selectedMember.steam_avatar || selectedMember.discord_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80')}
                  alt=""
                  className="w-12 h-12 rounded-2xl object-cover border dark:border-white/10 border-black/10"
                />
                <div>
                  <h3 className="font-bold text-base dark:text-white text-slate-900 flex items-center gap-2">
                    <span>{selectedMember.steam_name}'s Won Giveaways</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {memberWins.length} Won
                    </span>
                  </h3>
                  <div className="text-xs opacity-60 font-mono flex items-center gap-2 mt-0.5 flex-wrap">
                    <span>SteamID: {selectedMember.steamid}</span>
                    <span>•</span>
                    <a
                      href={`https://www.steamgifts.com/go/user/${selectedMember.steamid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 font-sans font-bold flex items-center gap-1 underline"
                      title="Open user's SteamGifts profile"
                    >
                      <span>Direct SG Profile</span>
                      <ExternalLink size={11} />
                    </a>
                    {selectedMember.sg_username && <span>• @{selectedMember.sg_username}</span>}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Wins Content */}
            <div className="overflow-y-auto pr-1 flex flex-col gap-3 max-h-[55vh]">
              {loadingWins ? (
                <div className="p-8 text-center text-xs opacity-50 flex items-center justify-center gap-2">
                  <RefreshCw size={14} className="animate-spin text-purple-400" />
                  <span>Loading win records...</span>
                </div>
              ) : memberWins.length === 0 ? (
                <div className="p-12 text-center text-xs opacity-50 flex flex-col items-center justify-center gap-2">
                  <Gift size={32} className="opacity-30 mb-1" />
                  <span>No group giveaways recorded for this member yet.</span>
                </div>
              ) : (
                memberWins.map((winRecord) => {
                  const g: SgGroupGiveaway = winRecord.giveaway || {};
                  const steamAppId = g.app_id;
                  const headerImg = steamAppId 
                    ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`
                    : null;
                  const sgUrl = `https://www.steamgifts.com/giveaway/${g.code}/${g.slug || 'giveaway'}`;

                  return (
                    <div
                      key={winRecord.id || g.code}
                      className="p-3.5 rounded-2xl dark:bg-black/30 bg-slate-50 border dark:border-white/5 border-black/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-purple-500/20 transition-all"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {headerImg ? (
                          <img
                            src={headerImg}
                            alt=""
                            className="w-20 h-10 rounded-lg object-cover border dark:border-white/10 border-black/10 shrink-0 bg-black/40"
                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-20 h-10 rounded-lg dark:bg-white/5 bg-slate-200 border dark:border-white/10 border-black/10 flex items-center justify-center text-xs opacity-30 shrink-0">
                            <Gift size={16} />
                          </div>
                        )}

                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold dark:text-white text-slate-800 truncate">
                            {g.name || 'Group Giveaway'}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] opacity-60 mt-0.5 flex-wrap">
                            {g.creator_username && <span>Created by <strong>{g.creator_username}</strong></span>}
                            {g.points > 0 && <span>• {g.points}P</span>}
                            {g.copies > 1 && <span>• {g.copies} Copies</span>}
                            {g.end_timestamp && <span>• {new Date(g.end_timestamp * 1000).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                        <span className={cn(
                          "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                          winRecord.status === 'Received' && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                          winRecord.status === 'Awaiting Feedback' && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                          winRecord.status === 'Not Received' && "bg-rose-500/15 text-rose-400 border-rose-500/30",
                          winRecord.status === 'Unknown' && "bg-black/10 dark:bg-white/10 text-slate-400 dark:text-white/40 border-black/10 dark:border-white/10"
                        )}>
                          {winRecord.status || 'Winner'}
                        </span>

                        <a
                          href={sgUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-xl dark:bg-white/5 bg-slate-200 hover:bg-slate-300 dark:hover:bg-white/10 text-slate-600 dark:text-white/70 hover:dark:text-white transition-colors"
                          title="Open giveaway on SteamGifts"
                        >
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t dark:border-white/10 border-black/10 pt-3">
              <span className="text-[10px] opacity-40">
                Data synced from SteamGifts Private Group & Steam Web API
              </span>
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white text-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
