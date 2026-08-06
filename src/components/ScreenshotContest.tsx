import React, { useState, useEffect, useMemo } from 'react';
import { 
  Camera, Image as ImageIcon, Upload, Eye, EyeOff, Heart, MessageSquare, 
  Sparkles, Trophy, ShieldCheck, Filter, Star, CheckCircle, AlertCircle, 
  Trash2, Edit3, Lock, Settings, RefreshCw, Send, Plus, X, Layers
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { TEAM_COLORS, Team } from '@/types';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface ScreenshotSubmission {
  id: string;
  event_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string;
  user_team: Team;
  image_url: string;
  caption: string;
  game_name: string;
  is_spoiler: boolean;
  is_selected: boolean;
  created_at: string;
}

interface ScreenshotVote {
  id: string;
  event_id: string;
  user_id: string;
  submission_id: string;
  created_at: string;
}

interface ScreenshotComment {
  id: string;
  submission_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string;
  content: string;
  created_at: string;
}

interface ScreenshotEvent {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'submissions_open' | 'voting_active' | 'concluded';
  is_admin_only: boolean;
  max_submissions_per_user: number;
  created_at: string;
}

export default function ScreenshotContest({ onViewProfile }: { onViewProfile?: (steamId: string) => void }) {
  const { user, theme } = useAuth();
  const [event, setEvent] = useState<ScreenshotEvent | null>(null);
  const [submissions, setSubmissions] = useState<ScreenshotSubmission[]>([]);
  const [votes, setVotes] = useState<ScreenshotVote[]>([]);
  const [comments, setComments] = useState<ScreenshotComment[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & view state
  const [activeTab, setActiveTab] = useState<'all' | 'voting' | 'mine'>('all');
  const [searchGame, setSearchGame] = useState('');
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});

  // Submission Modal state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [gameNameInput, setGameNameInput] = useState<string>('');
  const [captionInput, setCaptionInput] = useState<string>('');
  const [isSpoilerInput, setIsSpoilerInput] = useState<boolean>(false);
  const [isSelectedInput, setIsSelectedInput] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Comment Modal state
  const [activeCommentSubId, setActiveCommentSubId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);

  // Admin Edit Modal state
  const [editingSub, setEditingSub] = useState<ScreenshotSubmission | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editGameName, setEditGameName] = useState('');
  const [editIsSpoiler, setEditIsSpoiler] = useState(false);

  // Notice modal for voting inactive
  const [votingNoticeMessage, setVotingNoticeMessage] = useState<string | null>(null);

  // Admin tally result modal
  const [tallyResults, setTallyResults] = useState<any[] | null>(null);
  const [isTallying, setIsTallying] = useState(false);

  const currentUserId = user?.steamId || user?.discordId || user?.uid || '';

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/screenshots');
      if (res.ok) {
        const data = await res.json();
        setEvent(data.event || null);
        setSubmissions(data.submissions || []);
        setVotes(data.votes || []);
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error('Failed to load screenshot event data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Calculate user submissions count
  const mySubmissions = useMemo(() => {
    if (!currentUserId) return [];
    return submissions.filter(s => s.user_id === currentUserId);
  }, [submissions, currentUserId]);

  // Vote map
  const voteCounts = useMemo(() => {
    const map: Record<string, number> = {};
    votes.forEach(v => {
      map[v.submission_id] = (map[v.submission_id] || 0) + 1;
    });
    return map;
  }, [votes]);

  // My voted submissions IDs
  const myVotedSubIds = useMemo(() => {
    if (!currentUserId) return new Set<string>();
    return new Set(votes.filter(v => v.user_id === currentUserId).map(v => v.submission_id));
  }, [votes, currentUserId]);

  // Handle file select or drag
  const handleFileChange = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setSubmitError('Please upload a valid image file (PNG, JPG, WEBP)');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setSubmitError('File size must be under 8MB');
      return;
    }
    setImageFile(file);
    setSubmitError('');
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Submit Screenshot
  const handleCreateSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalUrl = imagePreview || imageUrlInput;
    if (!finalUrl) {
      setSubmitError('Please select an image file or provide an image URL');
      return;
    }
    if (!gameNameInput.trim()) {
      setSubmitError('Please enter the name of the game');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/screenshots?action=submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          userName: user?.steamName || user?.discordName || 'Contestant',
          userAvatar: user?.steamAvatar || user?.discordAvatar || '',
          userTeam: user?.team || 'none',
          imageUrl: finalUrl,
          caption: captionInput.trim(),
          gameName: gameNameInput.trim(),
          isSpoiler: isSpoilerInput,
          isSelected: isSelectedInput
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Failed to submit screenshot');
      } else {
        setIsSubmitModalOpen(false);
        setImageFile(null);
        setImagePreview('');
        setImageUrlInput('');
        setCaptionInput('');
        setGameNameInput('');
        setIsSpoilerInput(false);
        setIsSelectedInput(true);
        fetchData();
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Error uploading screenshot');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle "Set for Voting"
  const handleSetForVoting = async (subId: string) => {
    try {
      const res = await fetch('/api/screenshots?action=select-voting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: subId,
          userId: currentUserId
        })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to set for voting:', err);
    }
  };

  // Vote for Screenshot
  const handleVote = async (sub: ScreenshotSubmission) => {
    if (event?.status !== 'voting_active') {
      setVotingNoticeMessage("You can't vote for this yet! Voting is only open during the official voting phase.");
      return;
    }

    if (sub.user_id === currentUserId) {
      setVotingNoticeMessage("You cannot vote for your own screenshot submission!");
      return;
    }

    try {
      const res = await fetch('/api/screenshots?action=vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: sub.id,
          userId: currentUserId,
          eventStatus: event?.status
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setVotingNoticeMessage(data.error || 'Failed to register vote');
      } else {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to vote:', err);
    }
  };

  // Submit comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommentSubId || !commentText.trim()) return;

    setCommenting(true);
    try {
      const res = await fetch('/api/screenshots?action=comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: activeCommentSubId,
          userId: currentUserId,
          userName: user?.steamName || user?.discordName || 'Member',
          userAvatar: user?.steamAvatar || user?.discordAvatar || '',
          content: commentText.trim()
        })
      });

      if (res.ok) {
        setCommentText('');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to comment:', err);
    } finally {
      setCommenting(false);
    }
  };

  // Admin Actions
  const handleAdminUpdateStatus = async (newStatus: string) => {
    try {
      const res = await fetch('/api/screenshots?action=admin-event-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to update event status:', err);
    }
  };

  const handleAdminToggleSpoiler = async (sub: ScreenshotSubmission) => {
    try {
      const res = await fetch('/api/screenshots?action=admin-update-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: sub.id,
          caption: sub.caption,
          gameName: sub.game_name,
          isSpoiler: !sub.is_spoiler
        })
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to toggle spoiler:', err);
    }
  };

  const handleAdminDelete = async (subId: string) => {
    if (!confirm('Are you sure you want to delete this screenshot submission?')) return;
    try {
      const res = await fetch('/api/screenshots?action=admin-delete-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: subId })
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to delete submission:', err);
    }
  };

  const handleAdminSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;

    try {
      const res = await fetch('/api/screenshots?action=admin-update-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: editingSub.id,
          caption: editCaption,
          gameName: editGameName,
          isSpoiler: editIsSpoiler
        })
      });
      if (res.ok) {
        setEditingSub(null);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to edit submission:', err);
    }
  };

  const handleAdminTallyPoints = async () => {
    if (!confirm('Calculate top 5 voted screenshots and award +50, +40, +30, +20, +10 points to winning teams?')) return;
    setIsTallying(true);
    try {
      const res = await fetch('/api/screenshots?action=admin-tally-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminName: user?.steamName || 'Admin',
          adminId: currentUserId
        })
      });
      const data = await res.json();
      if (res.ok && data.awardedResults) {
        setTallyResults(data.awardedResults);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to tally points:', err);
    } finally {
      setIsTallying(false);
    }
  };

  // Filtered Submissions list
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(sub => {
      if (activeTab === 'voting' && !sub.is_selected) return false;
      if (activeTab === 'mine' && sub.user_id !== currentUserId) return false;
      if (searchGame.trim()) {
        const query = searchGame.toLowerCase();
        const gName = sub.game_name.toLowerCase();
        const cap = sub.caption.toLowerCase();
        const uName = sub.user_name.toLowerCase();
        return gName.includes(query) || cap.includes(query) || uName.includes(query);
      }
      return true;
    });
  }, [submissions, activeTab, currentUserId, searchGame]);

  const activeCommentsForSub = useMemo(() => {
    if (!activeCommentSubId) return [];
    return comments.filter(c => c.submission_id === activeCommentSubId);
  }, [comments, activeCommentSubId]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Admin Early Access Lock Notice */}
      {user?.isAdmin && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
              <Lock size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-400 flex items-center gap-2">
                Admin Early Access Phase Active
              </p>
              <p className="text-xs text-amber-200/70">
                Currently visible to Admins only so you can test features & prepare the contest.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={event?.status || 'submissions_open'}
              onChange={(e) => handleAdminUpdateStatus(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="draft">Phase: Draft</option>
              <option value="submissions_open">Phase: Submissions Open</option>
              <option value="voting_active">Phase: Voting Active</option>
              <option value="concluded">Phase: Concluded</option>
            </select>
            <button
              onClick={handleAdminTallyPoints}
              disabled={isTallying}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-black text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md active:scale-95"
            >
              <Trophy size={14} />
              {isTallying ? 'Calculating...' : 'Tally & Award Points'}
            </button>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl dark:bg-[#111111] bg-white border border-black/5 dark:border-white/10 p-6 md:p-10 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -z-0 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5">
                <Camera size={12} /> Screenshot Showcase Event
              </span>
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border",
                event?.status === 'voting_active' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                event?.status === 'submissions_open' ? "bg-sky-500/10 text-sky-400 border-sky-500/30" :
                event?.status === 'concluded' ? "bg-purple-500/10 text-purple-400 border-purple-500/30" :
                "bg-slate-500/10 text-slate-400 border-slate-500/30"
              )}>
                {event?.status === 'voting_active' ? '⚡ Voting Period Active' :
                 event?.status === 'submissions_open' ? '🟢 Submissions Open' :
                 event?.status === 'concluded' ? '🏆 Contest Concluded' : '📝 Draft Mode'}
              </span>
            </div>

            <h1 className="text-2xl md:text-4xl font-black tracking-tight dark:text-white text-slate-900">
              {event?.title || 'Screenshot Submissions'}
            </h1>
            <p className="text-sm dark:text-white/60 text-slate-600 leading-relaxed">
              Submit up to 10 screenshots. Every submission is worth <strong className="text-emerald-400">+20 points</strong> for your team! Select <b>one</b> official screenshot for voting when the Voting Period starts. Screenshots taken during and before the event are allowed.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => setIsSubmitModalOpen(true)}
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm px-6 py-3.5 rounded-2xl shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
            >
              <Plus size={18} />
              Submit Screenshot
            </button>
          </div>
        </div>
      </div>

      {/* Navigation & Controls Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
        {/* Tabs */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap",
              activeTab === 'all'
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm"
                : "text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
            )}
          >
            <Layers size={14} />
            All Submissions ({submissions.length})
          </button>

          <button
            onClick={() => setActiveTab('voting')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap",
              activeTab === 'voting'
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm"
                : "text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
            )}
          >
            <Star size={14} className="text-amber-400" />
            For Voting ({submissions.filter(s => s.is_selected).length})
          </button>

          <button
            onClick={() => setActiveTab('mine')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap",
              activeTab === 'mine'
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm"
                : "text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
            )}
          >
            <ImageIcon size={14} />
            My Screenshots ({mySubmissions.length}/10)
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Filter size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" />
          <input
            type="text"
            placeholder="Search game, caption, or user..."
            value={searchGame}
            onChange={(e) => setSearchGame(e.target.value)}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs font-medium dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Submissions Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
          <RefreshCw size={28} className="animate-spin text-purple-400" />
          <p className="text-xs font-medium">Loading screenshots gallery...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-black/5 dark:border-white/10 rounded-3xl p-8 space-y-3">
          <Camera size={40} className="mx-auto opacity-20 text-purple-400" />
          <h3 className="text-base font-bold dark:text-white text-slate-800">No screenshots found</h3>
          <p className="text-xs opacity-50 max-w-md mx-auto">
            {searchGame ? 'Try clearing your search filter.' : 'Be the first to submit a screenshot for your team!'}
          </p>
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="mt-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
          >
            + Upload Screenshot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSubmissions.map((sub) => {
            const isSpoilerHidden = sub.is_spoiler && !revealedSpoilers[sub.id];
            const voteCount = voteCounts[sub.id] || 0;
            const hasVoted = myVotedSubIds.has(sub.id);
            const isMine = sub.user_id === currentUserId;
            const subComments = comments.filter(c => c.submission_id === sub.id);

            return (
              <motion.div
                key={sub.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative bg-white dark:bg-[#111111] rounded-2xl border border-black/5 dark:border-white/10 overflow-hidden shadow-md dark:shadow-none flex flex-col justify-between transition-all hover:border-purple-500/30"
              >
                {/* Image Container */}
                <div className="relative aspect-video bg-black/90 overflow-hidden flex items-center justify-center">
                  <img
                    src={sub.image_url}
                    alt={sub.caption || sub.game_name}
                    className={cn(
                      "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
                      isSpoilerHidden && "blur-xl scale-110 select-none pointer-events-none opacity-40"
                    )}
                  />

                  {/* Spoiler Overlay */}
                  {isSpoilerHidden && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-black/60 backdrop-blur-md z-10 text-center gap-2">
                      <div className="p-2 bg-red-500/20 text-red-400 rounded-full">
                        <EyeOff size={20} />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-white/90">Contains Spoiler</span>
                      <button
                        onClick={() => setRevealedSpoilers(prev => ({ ...prev, [sub.id]: true }))}
                        className="mt-1 bg-white/20 hover:bg-white/30 text-white font-bold text-[11px] px-3.5 py-1.5 rounded-xl backdrop-blur-md transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Eye size={12} /> Click to Reveal
                      </button>
                    </div>
                  )}

                  {/* Top Badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 z-20 pointer-events-none">
                    <span className="bg-black/70 backdrop-blur-md text-white/90 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-white/10 truncate max-w-[160px]">
                      {sub.game_name}
                    </span>

                    <div className="flex items-center gap-1.5 pointer-events-auto">
                      {sub.is_selected && (
                        <span className="bg-amber-500 text-black font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-lg shadow-md flex items-center gap-1">
                          <Star size={10} className="fill-black" /> Voting Entry
                        </span>
                      )}

                      {sub.is_spoiler && !isSpoilerHidden && (
                        <button
                          onClick={() => setRevealedSpoilers(prev => ({ ...prev, [sub.id]: false }))}
                          className="bg-black/70 hover:bg-black text-red-400 font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-lg border border-red-500/30 flex items-center gap-1 cursor-pointer"
                        >
                          <EyeOff size={10} /> Blur
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Admin controls overlay */}
                  {user?.isAdmin && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleAdminToggleSpoiler(sub)}
                        title={sub.is_spoiler ? "Unmark Spoiler" : "Force Spoiler"}
                        className="p-1.5 bg-black/80 hover:bg-black text-amber-400 rounded-lg border border-amber-500/30 transition-colors"
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingSub(sub);
                          setEditCaption(sub.caption);
                          setEditGameName(sub.game_name);
                          setEditIsSpoiler(sub.is_spoiler);
                        }}
                        title="Edit Submission"
                        className="p-1.5 bg-black/80 hover:bg-black text-sky-400 rounded-lg border border-sky-500/30 transition-colors"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => handleAdminDelete(sub.id)}
                        title="Delete Submission"
                        className="p-1.5 bg-black/80 hover:bg-black text-red-400 rounded-lg border border-red-500/30 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    {/* User info */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 truncate">
                        {sub.user_avatar ? (
                          <img src={sub.user_avatar} alt="" className="w-6 h-6 rounded-full border border-white/10" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-[10px]">
                            {sub.user_name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <span className="text-xs font-bold dark:text-white text-slate-800 truncate">
                          {sub.user_name}
                        </span>
                      </div>

                      {/* Team badge */}
                      {sub.user_team && sub.user_team !== 'none' && (
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border shrink-0",
                          TEAM_COLORS[sub.user_team as Team]?.secondary,
                          TEAM_COLORS[sub.user_team as Team]?.primary,
                          TEAM_COLORS[sub.user_team as Team]?.border
                        )}>
                          Team {sub.user_team}
                        </span>
                      )}
                    </div>

                    {/* Caption */}
                    {sub.caption ? (
                      <p className="text-xs dark:text-white/80 text-slate-600 line-clamp-2 leading-relaxed">
                        "{sub.caption}"
                      </p>
                    ) : (
                      <p className="text-xs italic dark:text-white/30 text-slate-400">
                        No caption provided
                      </p>
                    )}
                  </div>

                  {/* Actions & Footer */}
                  <div className="pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-2">
                    {/* Set for Voting toggle if it's user's submission */}
                    {isMine ? (
                      <button
                        onClick={() => handleSetForVoting(sub.id)}
                        className={cn(
                          "text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 cursor-pointer",
                          sub.is_selected
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-black/5 dark:bg-white/5 text-slate-500 dark:text-white/50 border-black/10 dark:border-white/10 hover:border-amber-500/40"
                        )}
                      >
                        <Star size={12} className={sub.is_selected ? "fill-amber-400 text-amber-400" : ""} />
                        {sub.is_selected ? "Official Voting Entry" : "Set for Voting"}
                      </button>
                    ) : (
                      <span className="text-[10px] opacity-40 font-medium">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      {/* Comments count button */}
                      <button
                        onClick={() => setActiveCommentSubId(sub.id)}
                        className="text-xs font-bold text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1 p-1 cursor-pointer"
                      >
                        <MessageSquare size={14} />
                        <span>{subComments.length}</span>
                      </button>

                      {/* Vote button */}
                      <button
                        onClick={() => handleVote(sub)}
                        disabled={isMine}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95",
                          hasVoted
                            ? "bg-rose-500 text-white shadow-rose-500/30"
                            : "bg-black/5 dark:bg-white/10 hover:bg-rose-500/20 text-slate-700 dark:text-white hover:text-rose-400",
                          isMine && "opacity-40 cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/10 hover:text-slate-700"
                        )}
                      >
                        <Heart size={14} className={cn(hasVoted && "fill-white")} />
                        <span>{voteCount}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* SUBMIT SCREENSHOT MODAL */}
      <AnimatePresence>
        {isSubmitModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 max-w-lg w-full space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl">
                    <Camera size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Upload Screenshot</h3>
                    <p className="text-xs text-white/50">Earn +20 points for Team {user?.team || 'Members'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="p-1.5 text-white/40 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {submitError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={16} />
                  {submitError}
                </div>
              )}

              <form onSubmit={handleCreateSubmission} className="space-y-4">
                {/* Image Upload Box */}
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-2">
                    Screenshot File or Image
                  </label>
                  {imagePreview ? (
                    <div className="relative rounded-2xl overflow-hidden aspect-video bg-black/50 border border-white/10 group">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => { setImagePreview(''); setImageFile(null); }}
                        className="absolute top-2 right-2 bg-black/80 text-white p-1.5 rounded-xl border border-white/20 hover:bg-red-600 transition-colors cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => document.getElementById('fileInput')?.click()}
                      className="border-2 border-dashed border-white/20 hover:border-purple-500/50 rounded-2xl p-6 text-center space-y-2 cursor-pointer bg-white/5 transition-all"
                    >
                      <Upload size={32} className="mx-auto text-purple-400 opacity-60" />
                      <p className="text-xs font-bold text-white">Click or Drag Image Here</p>
                      <p className="text-[10px] text-white/40">PNG, JPG, WEBP up to 2MB</p>
                      <input
                        id="fileInput"
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>

                {/* Direct URL input fallback */}
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">
                    Or Image URL (Steam/Direct link)
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                {/* Game Name */}
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">
                    Game Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Life is Strange, Elden Ring..."
                    value={gameNameInput}
                    onChange={(e) => setGameNameInput(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                {/* Caption */}
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">
                    Caption / Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Add a fun caption or description for this shot..."
                    value={captionInput}
                    onChange={(e) => setCaptionInput(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
                  />
                </div>

                {/* Checkboxes */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isSpoilerInput}
                      onChange={(e) => setIsSpoilerInput(e.target.checked)}
                      className="w-4 h-4 rounded bg-black/40 border-white/20 text-purple-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Contains Spoilers</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isSelectedInput}
                      onChange={(e) => setIsSelectedInput(e.target.checked)}
                      className="w-4 h-4 rounded bg-black/40 border-white/20 text-amber-500 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-slate-300 font-bold flex items-center gap-1">
                      <Star size={12} className="fill-slate-300" />
                      Set as my official entry for Voting
                    </span>
                  </label>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsSubmitModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-bold text-white/60 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-purple-500/25 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    {submitting ? 'Uploading...' : 'Submit (+20 Points)'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* COMMENTS MODAL / DRAWER */}
      <AnimatePresence>
        {activeCommentSubId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <MessageSquare size={16} className="text-purple-400" />
                  Comments ({activeCommentsForSub.length})
                </h3>
                <button
                  onClick={() => setActiveCommentSubId(null)}
                  className="p-1 text-white/40 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Comments Thread */}
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {activeCommentsForSub.length === 0 ? (
                  <p className="text-xs text-center text-white/40 py-6">
                    No comments yet. Be the first to leave a comment!
                  </p>
                ) : (
                  activeCommentsForSub.map((cmt) => (
                    <div key={cmt.id} className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-purple-300">
                          {cmt.user_name}
                        </span>
                        <span className="text-[9px] text-white/30">
                          {new Date(cmt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-white/80 leading-relaxed">
                        {cmt.content}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Input */}
              <form onSubmit={handleAddComment} className="flex items-center gap-2 pt-2 border-t border-white/10">
                <input
                  type="text"
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
                />
                <button
                  type="submit"
                  disabled={commenting || !commentText.trim()}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold p-2.5 rounded-xl transition-all cursor-pointer"
                >
                  <Send size={14} />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VOTING INACTIVE NOTICE MODAL */}
      <AnimatePresence>
        {votingNoticeMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
                <AlertCircle size={28} />
              </div>
              <h3 className="text-base font-bold text-white">Voting Period Information</h3>
              <p className="text-xs text-white/70 leading-relaxed">
                {votingNoticeMessage}
              </p>
              <button
                onClick={() => setVotingNoticeMessage(null)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Got It
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADMIN EDIT SUBMISSION MODAL */}
      <AnimatePresence>
        {editingSub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl"
            >
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit3 size={16} className="text-sky-400" />
                Admin Edit Submission
              </h3>

              <form onSubmit={handleAdminSaveEdit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-white/70 mb-1">Game Title</label>
                  <input
                    type="text"
                    value={editGameName}
                    onChange={(e) => setEditGameName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-white/70 mb-1">Caption</label>
                  <textarea
                    rows={2}
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    checked={editIsSpoiler}
                    onChange={(e) => setEditIsSpoiler(e.target.checked)}
                    className="w-4 h-4 rounded bg-black/40 border-white/20 text-red-500 focus:ring-0"
                  />
                  <span>Mark as Spoiler (Add Blur Overlay)</span>
                </label>

                <div className="pt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSub(null)}
                    className="px-3 py-2 text-xs text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-sky-500 hover:bg-sky-400 text-black font-bold text-xs px-4 py-2 rounded-xl"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADMIN TALLY RESULTS BREAKDOWN MODAL */}
      <AnimatePresence>
        {tallyResults && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl">
                  <Trophy size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Winner Points Awarded!</h3>
                  <p className="text-xs text-white/50">Top voted screenshot submissions & awarded bonus team points</p>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {tallyResults.map((res, idx) => (
                  <div key={idx} className="p-3 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-black text-emerald-400 uppercase tracking-widest block">{res.rank} ({res.votes} votes)</span>
                      <span className="text-white font-bold">{res.user}</span>
                      <span className="text-white/40 text-[10px] ml-2">Team {res.team}</span>
                    </div>
                    <span className="font-black text-amber-400 text-sm">+{res.points} PTS</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setTallyResults(null)}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs py-2.5 rounded-xl cursor-pointer"
              >
                Close & Done
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
