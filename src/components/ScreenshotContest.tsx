import React, { useState, useEffect, useMemo } from 'react';
import { 
  Camera, Image as ImageIcon, Upload, Eye, EyeOff, Heart, MessageSquare, 
  Sparkles, Trophy, ShieldCheck, Filter, Star, CheckCircle, AlertCircle, 
  Trash2, Edit3, Lock, Settings, RefreshCw, Send, Plus, X, Layers,
  ChevronLeft, ChevronRight, Maximize2, Users, BarChart3, UserCheck, Search, ListFilter,
  Clock, XCircle, Check, LayoutGrid, List
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
  status?: 'pending' | 'approved' | 'rejected' | 'verified';
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
  is_voting_active?: boolean;
  max_submissions_per_user: number;
  submission_points?: number;
  created_at: string;
}

const TEAM_HOVER_BORDERS: Record<string, string> = {
  blue: 'hover:border-sky-500 hover:shadow-sky-500/20',
  green: 'hover:border-green-500 hover:shadow-green-500/20',
  purple: 'hover:border-purple-500 hover:shadow-purple-500/20',
  red: 'hover:border-red-500 hover:shadow-red-500/20',
  none: 'hover:border-slate-400 hover:shadow-slate-500/20'
};

const TEAM_SOLID_BUTTON: Record<string, string> = {
  blue: 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-500/25 border border-sky-500',
  green: 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/25 border border-green-500',
  purple: 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/25 border border-purple-500',
  red: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/25 border border-red-500',
  none: 'bg-slate-700 hover:bg-slate-600 text-white shadow-lg shadow-slate-500/25 border border-slate-600'
};

const TEAM_ACTIVE_TAB: Record<string, string> = {
  blue: 'bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm',
  green: 'bg-green-500/20 text-green-300 border border-green-500/30 shadow-sm',
  purple: 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm',
  red: 'bg-red-500/20 text-red-300 border border-red-500/30 shadow-sm',
  none: 'bg-slate-500/20 text-slate-300 border border-slate-500/30 shadow-sm'
};

const TEAM_SUBTLE_BUTTON: Record<string, string> = {
  blue: 'bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30',
  green: 'bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/30',
  purple: 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30',
  red: 'bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30',
  none: 'bg-slate-600/20 hover:bg-slate-600/30 text-slate-300 border border-slate-500/30'
};

const TEAM_FOCUS_BORDER: Record<string, string> = {
  blue: 'focus:border-sky-500/50',
  green: 'focus:border-green-500/50',
  purple: 'focus:border-purple-500/50',
  red: 'focus:border-red-500/50',
  none: 'focus:border-white/30'
};

const TEAM_TEXT_ACCENT: Record<string, string> = {
  blue: 'text-sky-400',
  green: 'text-green-400',
  purple: 'text-purple-400',
  red: 'text-red-400',
  none: 'text-slate-400'
};

const TEAM_BG_ACCENT: Record<string, string> = {
  blue: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
  green: 'bg-green-500/10 border-green-500/20 text-green-400',
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  red: 'bg-red-500/10 border-red-500/20 text-red-400',
  none: 'bg-slate-500/10 border-slate-500/20 text-slate-400'
};

export default function ScreenshotContest({ onViewProfile }: { onViewProfile?: (steamId: string) => void }) {
  const { user, theme } = useAuth();
  const currentUserId = user?.steamId || user?.discordId || user?.uid || '';
  const userTeam = user?.team || 'none';
  const hoverBorderClass = TEAM_HOVER_BORDERS[userTeam] || TEAM_HOVER_BORDERS['none'];
  const teamSolidBtn = TEAM_SOLID_BUTTON[userTeam] || TEAM_SOLID_BUTTON['none'];
  const teamActiveTab = TEAM_ACTIVE_TAB[userTeam] || TEAM_ACTIVE_TAB['none'];
  const teamSubtleBtn = TEAM_SUBTLE_BUTTON[userTeam] || TEAM_SUBTLE_BUTTON['none'];
  const teamFocusBorder = TEAM_FOCUS_BORDER[userTeam] || TEAM_FOCUS_BORDER['none'];
  const teamTextAccent = TEAM_TEXT_ACCENT[userTeam] || TEAM_TEXT_ACCENT['none'];
  const teamBgAccent = TEAM_BG_ACCENT[userTeam] || TEAM_BG_ACCENT['none'];
  const userTeamColors = TEAM_COLORS[userTeam as Team] || TEAM_COLORS['none'];

  const [event, setEvent] = useState<ScreenshotEvent | null>(null);
  const [submissions, setSubmissions] = useState<ScreenshotSubmission[]>([]);
  const [votes, setVotes] = useState<ScreenshotVote[]>([]);
  const [comments, setComments] = useState<ScreenshotComment[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & view state
  const [activeTab, setActiveTab] = useState<'all' | 'voting' | 'mine'>('all');
  const [viewMode, setViewMode] = useState<'gallery' | 'list'>(() => {
    const saved = localStorage.getItem('screenshot_view_mode');
    return saved === 'list' ? 'list' : 'gallery';
  });
  const [searchGame, setSearchGame] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});

  // Lightbox state
  const [lightboxSubId, setLightboxSubId] = useState<string | null>(null);

  // Admin settings state (with local storage persistence)
  const [editSubmissionPoints, setEditSubmissionPoints] = useState<number>(() => {
    const saved = localStorage.getItem('admin_screenshot_submission_points');
    return saved && !isNaN(Number(saved)) ? Number(saved) : 20;
  });

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
  const [editStatus, setEditStatus] = useState<'pending' | 'approved' | 'rejected'>('approved');

  // Notice modal for voting inactive
  const [votingNoticeMessage, setVotingNoticeMessage] = useState<string | null>(null);

  // Admin tally result modal
  const [tallyResults, setTallyResults] = useState<any[] | null>(null);
  const [isTallying, setIsTallying] = useState(false);

  // Admin user submission counts breakdown modal & user filter
  const [adminUserModalOpen, setAdminUserModalOpen] = useState(false);
  const [adminFilterUserId, setAdminFilterUserId] = useState<string | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/screenshots');
      if (res.ok) {
        const data = await res.json();
        setEvent(data.event || null);
        if (data.event?.submission_points !== undefined && data.event?.submission_points !== null) {
          const pts = Number(data.event.submission_points);
          setEditSubmissionPoints(pts);
          localStorage.setItem('admin_screenshot_submission_points', String(pts));
        }
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

interface UserSubmissionStat {
  userId: string;
  name: string;
  avatar: string;
  team: Team;
  count: number;
  selectedCount: number;
  lastSubmitted: string;
  games: string[];
}

  // Calculate per-user submission counts & stats for admin view and user indicators
  const userSubmissionCounts = useMemo<Record<string, UserSubmissionStat>>(() => {
    const map: Record<string, UserSubmissionStat> = {};

    submissions.forEach(s => {
      const uid = s.user_id;
      if (!map[uid]) {
        map[uid] = {
          userId: uid,
          name: s.user_name || 'Member',
          avatar: s.user_avatar || '',
          team: s.user_team || 'none',
          count: 0,
          selectedCount: 0,
          lastSubmitted: s.created_at,
          games: []
        };
      }
      map[uid].count += 1;
      if (s.is_selected) map[uid].selectedCount += 1;
      if (s.game_name && !map[uid].games.includes(s.game_name)) {
        map[uid].games.push(s.game_name);
      }
      if (new Date(s.created_at) > new Date(map[uid].lastSubmitted)) {
        map[uid].lastSubmitted = s.created_at;
      }
    });

    return map;
  }, [submissions]);

  const userSubmissionsList = useMemo<UserSubmissionStat[]>(() => {
    const list: UserSubmissionStat[] = Object.values(userSubmissionCounts);
    return list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [userSubmissionCounts]);

  const filteredUserList = useMemo<UserSubmissionStat[]>(() => {
    if (!userSearchTerm.trim()) return userSubmissionsList;
    const q = userSearchTerm.toLowerCase();
    return userSubmissionsList.filter(u => 
      u.name.toLowerCase().includes(q) || 
      u.team.toLowerCase().includes(q) ||
      u.games.some(g => g.toLowerCase().includes(q))
    );
  }, [userSubmissionsList, userSearchTerm]);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileChange(file);
    }
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
    const isVotingActive = event?.status === 'voting_active' || event?.is_voting_active;
    if (!isVotingActive) {
      setVotingNoticeMessage("You can't vote yet!");
      return;
    }

    if (sub.user_id === currentUserId) {
      setVotingNoticeMessage("You can't vote for yourself, silly!");
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
        setVotingNoticeMessage(data.error || "You can't vote yet!");
      } else {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to vote:', err);
    }
  };

  // Submit comment
  const handleAddComment = async (eOrSubId?: React.FormEvent | string) => {
    if (eOrSubId && typeof eOrSubId === 'object' && 'preventDefault' in eOrSubId) {
      eOrSubId.preventDefault();
    }
    const targetSubId = typeof eOrSubId === 'string' ? eOrSubId : activeCommentSubId;
    if (!targetSubId || !commentText.trim()) return;

    setCommenting(true);
    try {
      const res = await fetch('/api/screenshots?action=comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: targetSubId,
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
  const handleAdminUpdatePoints = async (points: number) => {
    const validatedPoints = Math.max(0, Number(points));
    setEditSubmissionPoints(validatedPoints);
    localStorage.setItem('admin_screenshot_submission_points', String(validatedPoints));
    setEvent(prev => prev ? { ...prev, submission_points: validatedPoints } : prev);
    try {
      const res = await fetch('/api/screenshots?action=admin-event-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionPoints: validatedPoints })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.event) {
          setEvent(data.event);
          if (data.event.submission_points !== undefined && data.event.submission_points !== null) {
            const pts = Number(data.event.submission_points);
            setEditSubmissionPoints(pts);
            localStorage.setItem('admin_screenshot_submission_points', String(pts));
          }
        }
      }
    } catch (err) {
      console.error('Failed to update submission points:', err);
    }
  };

  const handleAdminToggleVoting = async () => {
    try {
      const res = await fetch('/api/screenshots?action=admin-toggle-voting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionPoints: editSubmissionPoints })
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to toggle voting period:', err);
    }
  };

  const handleAdminUpdateStatus = async (newStatus: string) => {
    // Optimistically update local state so phase selector doesn't snap back
    setEvent(prev => prev ? {
      ...prev,
      status: newStatus as any,
      is_voting_active: newStatus === 'voting_active'
    } : {
      id: 'default-evt',
      title: 'Screenshot Submission',
      status: newStatus as any,
      submission_points: editSubmissionPoints,
      is_admin_only: false,
      is_voting_active: newStatus === 'voting_active'
    });

    try {
      const res = await fetch('/api/screenshots?action=admin-event-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, submissionPoints: editSubmissionPoints })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.event) {
          setEvent(data.event);
        } else {
          fetchData();
        }
      }
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

  const handleAdminSetStatus = async (subId: string, newStatus: 'approved' | 'pending' | 'rejected') => {
    // Optimistic local update
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status: newStatus } : s));
    try {
      const res = await fetch('/api/screenshots?action=admin-set-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: subId, status: newStatus })
      });
      if (res.ok) {
        fetchData();
        window.dispatchEvent(new Event('leaderboard-updated'));
      }
    } catch (err) {
      console.error('Failed to update submission status:', err);
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
      if (res.ok) {
        fetchData();
        // Dispatch custom event to notify other components (e.g. Leaderboard)
        window.dispatchEvent(new Event('leaderboard-updated'));
      }
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
          isSpoiler: editIsSpoiler,
          status: editStatus
        })
      });
      if (res.ok) {
        setEditingSub(null);
        fetchData();
        window.dispatchEvent(new Event('leaderboard-updated'));
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

  // Featured Approved Screenshots for top showcase
  const featuredSubmissions = useMemo(() => {
    return submissions.filter(s => (s.status === 'approved' || !s.status || s.status === 'verified')).slice(0, 6);
  }, [submissions]);

  // Filtered Submissions list
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(sub => {
      if (adminFilterUserId && sub.user_id !== adminFilterUserId) return false;
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
  }, [submissions, activeTab, currentUserId, searchGame, adminFilterUserId]);

  // Lightbox Navigation Handlers
  const handlePrevLightbox = () => {
    if (!lightboxSubId || filteredSubmissions.length === 0) return;
    const currentIndex = filteredSubmissions.findIndex(s => s.id === lightboxSubId);
    const prevIndex = (currentIndex - 1 + filteredSubmissions.length) % filteredSubmissions.length;
    setLightboxSubId(filteredSubmissions[prevIndex].id);
  };

  const handleNextLightbox = () => {
    if (!lightboxSubId || filteredSubmissions.length === 0) return;
    const currentIndex = filteredSubmissions.findIndex(s => s.id === lightboxSubId);
    const nextIndex = (currentIndex + 1) % filteredSubmissions.length;
    setLightboxSubId(filteredSubmissions[nextIndex].id);
  };

  useEffect(() => {
    if (!lightboxSubId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxSubId(null);
      if (e.key === 'ArrowLeft') handlePrevLightbox();
      if (e.key === 'ArrowRight') handleNextLightbox();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxSubId, filteredSubmissions]);

  const activeCommentsForSub = useMemo(() => {
    if (!activeCommentSubId) return [];
    return comments.filter(c => c.submission_id === activeCommentSubId);
  }, [comments, activeCommentSubId]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Admin Early Access Lock Notice & Settings Box */}
      {user?.isAdmin && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
              <Lock size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-400 flex items-center gap-2">
                Admin Controls & Event Settings
              </p>
              <p className="text-xs text-amber-200/70">
                Manage event phase, voting window, and global screenshot points.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {/* Global Screenshot Points Setting Box */}
            <div className="flex items-center gap-1.5 bg-black/40 border border-amber-500/30 rounded-xl px-3 py-1 text-xs text-white">
              <span className="font-bold text-amber-300">Points / Upload:</span>
              <input
                type="number"
                min="0"
                max="500"
                value={editSubmissionPoints}
                onChange={(e) => setEditSubmissionPoints(Number(e.target.value))}
                onBlur={() => handleAdminUpdatePoints(editSubmissionPoints)}
                className="w-14 bg-white/10 border border-white/20 rounded-lg px-1.5 py-0.5 text-center font-black text-amber-400 focus:outline-none focus:border-amber-400"
              />
              <button
                onClick={() => handleAdminUpdatePoints(editSubmissionPoints)}
                className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[10px] uppercase px-2 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Save
              </button>
            </div>

            {/* Admin User Submissions Count Overview Button */}
            <button
              onClick={() => setAdminUserModalOpen(true)}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
            >
              <Users size={14} />
              User Submissions ({userSubmissionsList.length})
            </button>

            <button
              onClick={handleAdminToggleVoting}
              className={cn(
                "font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer border",
                (event?.status === 'voting_active' || event?.is_voting_active)
                  ? "bg-amber-500 text-black border-amber-400 hover:bg-amber-400"
                  : teamSolidBtn
              )}
            >
              <Star size={14} className={(event?.status === 'voting_active' || event?.is_voting_active) ? "fill-black" : ""} />
              {(event?.status === 'voting_active' || event?.is_voting_active) ? "Voting Period: Active (Click to Pause)" : "Toggle Voting Period"}
            </button>
            <select
              value={event?.status || 'submissions_open'}
              onChange={(e) => handleAdminUpdateStatus(e.target.value)}
              className="bg-black/40 border border-amber-500/30 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none cursor-pointer hover:border-amber-400 transition-colors"
            >
              <option value="draft">Phase: Draft</option>
              <option value="submissions_open">Phase: Submissions Open</option>
              <option value="voting_active">Phase: Voting Active</option>
              <option value="concluded">Phase: Concluded</option>
            </select>
            <button
              onClick={handleAdminTallyPoints}
              disabled={isTallying}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-black text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
            >
              <Trophy size={14} />
              {isTallying ? 'Calculating...' : 'Tally & Award Points'}
            </button>
          </div>
        </div>
      )}

      {/* Admin Active User Filter Banner */}
      {adminFilterUserId && (
        <div className="bg-amber-500/15 border border-amber-500/30 rounded-2xl p-3 px-4 flex items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-amber-400 shrink-0" />
            <span>
              Admin Filter Active: Viewing screenshots submitted by <strong className="text-white font-bold">{userSubmissionCounts[adminFilterUserId]?.name || 'User'}</strong> ({userSubmissionCounts[adminFilterUserId]?.count || 0}/10 uploads)
            </span>
          </div>
          <button
            onClick={() => setAdminFilterUserId(null)}
            className="text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-3 py-1 rounded-lg border border-amber-500/30 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
          >
            <X size={12} /> Clear User Filter
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl dark:bg-[#111111] bg-white border border-black/5 dark:border-white/10 p-6 md:p-10 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={cn("border text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5", teamBgAccent)}>
                <Camera size={12} /> Screenshot Submission
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
              Submit up to 10 screenshots. Every submission is worth <strong className="text-emerald-400">+{event?.submission_points ?? editSubmissionPoints ?? 20} points</strong> for your team! Select <b>one</b> official screenshot for voting when the Voting Period starts. Screenshots taken during and before the event are allowed.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => setIsSubmitModalOpen(true)}
              className={cn("w-full sm:w-auto font-bold text-sm px-6 py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer", teamSolidBtn)}
            >
              <Plus size={18} />
              Submit Screenshot
            </button>
          </div>
        </div>
      </div>

      {/* FEATURED SCREENSHOTS SHOWCASE GRID */}
      {featuredSubmissions.length > 0 && (
        <div className="bg-black/5 dark:bg-white/[0.03] border border-black/5 dark:border-white/10 rounded-3xl p-5 md:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={cn("p-2 rounded-xl border flex items-center justify-center shadow-inner", teamBgAccent)}>
                <Sparkles size={18} className={teamTextAccent} />
              </div>
              <div>
                <h2 className="text-sm md:text-base font-black dark:text-white text-slate-900 tracking-tight flex items-center gap-2">
                  Featured Highlights
                  <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider", teamBgAccent)}>
                    {featuredSubmissions.length} Approved
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-white/40">
                  Recent approved community screenshots. Click any capture to view in full-screen mode.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {featuredSubmissions.slice(0, 4).map((sub) => {
              const isSpoilerHidden = sub.is_spoiler && !revealedSpoilers[sub.id];
              const team = sub.user_team || 'none';
              const teamColor = TEAM_COLORS[team as Team] || TEAM_COLORS['none'];

              return (
                <motion.div
                  key={`featured-${sub.id}`}
                  whileHover={{ y: -3 }}
                  onClick={() => setLightboxSubId(sub.id)}
                  className={cn(
                    "group relative aspect-[16/10] bg-black/90 rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-md cursor-pointer flex flex-col justify-end transition-all",
                    hoverBorderClass
                  )}
                >
                  <img
                    src={sub.image_url}
                    alt={sub.caption || sub.game_name}
                    className={cn(
                      "absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
                      isSpoilerHidden && "blur-xl scale-110 opacity-30 select-none pointer-events-none"
                    )}
                  />

                  {/* Gradient Scrim */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent z-10" />

                  {/* Hover Expand Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 z-20 pointer-events-none">
                    <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-black shadow-lg">
                      <Maximize2 size={14} />
                      <span>Full-Screen View</span>
                    </div>
                  </div>

                  {/* Top Badges */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 z-20 pointer-events-none">
                    <span className="bg-black/80 backdrop-blur-md text-white font-bold text-[10px] px-2 py-0.5 rounded-lg border border-white/10 truncate max-w-[130px]">
                      {sub.game_name}
                    </span>
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border flex items-center gap-1 shadow-sm backdrop-blur-md",
                      team !== 'none'
                        ? cn(teamColor.secondary, teamColor.primary, teamColor.border)
                        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    )}>
                      <CheckCircle size={10} className={team !== 'none' ? teamColor.primary : "text-emerald-400"} />
                      Approved
                    </span>
                  </div>

                  {/* Bottom Info */}
                  <div className="relative z-20 p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        {sub.user_avatar ? (
                          <img src={sub.user_avatar} alt="" className="w-5 h-5 rounded-full border border-white/20 shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-purple-500/30 text-purple-200 flex items-center justify-center font-bold text-[9px] shrink-0">
                            {sub.user_name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <span className="text-[11px] font-bold text-white truncate drop-shadow-sm">
                          {sub.user_name}
                        </span>
                      </div>

                      {sub.user_team && sub.user_team !== 'none' && (
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                          TEAM_COLORS[sub.user_team as Team]?.secondary,
                          TEAM_COLORS[sub.user_team as Team]?.primary,
                          TEAM_COLORS[sub.user_team as Team]?.border
                        )}>
                          {sub.user_team}
                        </span>
                      )}
                    </div>
                    {sub.caption && (
                      <p className="text-[10px] text-white/80 line-clamp-1 italic">
                        "{sub.caption}"
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation & Controls Bar */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
        {/* Tabs */}
        <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap",
              activeTab === 'all'
                ? teamActiveTab
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
                ? teamActiveTab
                : "text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
            )}
          >
            <ImageIcon size={14} />
            My Screenshots ({mySubmissions.length}/10)
          </button>
        </div>

        {/* Right Controls: View Switcher & Search Bar */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          {/* View Mode Toggle: Gallery vs List */}
          <div className="flex items-center bg-black/5 dark:bg-white/5 p-1 rounded-xl border border-black/10 dark:border-white/10 shrink-0">
            <button
              onClick={() => {
                setViewMode('gallery');
                localStorage.setItem('screenshot_view_mode', 'gallery');
              }}
              title="Gallery View (Large Cards)"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                viewMode === 'gallery'
                  ? teamActiveTab
                  : "text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">Gallery</span>
            </button>

            <button
              onClick={() => {
                setViewMode('list');
                localStorage.setItem('screenshot_view_mode', 'list');
              }}
              title="List View (Streamlined Rows)"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                viewMode === 'list'
                  ? teamActiveTab
                  : "text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <List size={14} />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Filter size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" />
            <input
              type="text"
              placeholder="Search game, caption, or user..."
              value={searchGame}
              onChange={(e) => setSearchGame(e.target.value)}
              className={cn("w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs font-medium dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none transition-colors", teamFocusBorder)}
            />
          </div>
        </div>
      </div>

      {/* Submissions Content */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
          <RefreshCw size={28} className={cn("animate-spin", teamTextAccent)} />
          <p className="text-xs font-medium">Loading screenshots gallery...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-black/5 dark:border-white/10 rounded-3xl p-8 space-y-3">
          <Camera size={40} className={cn("mx-auto opacity-30", teamTextAccent)} />
          <h3 className="text-base font-bold dark:text-white text-slate-800">No screenshots found</h3>
          <p className="text-xs opacity-50 max-w-md mx-auto">
            {searchGame ? 'Try clearing your search filter.' : 'Be the first to submit a screenshot for your team!'}
          </p>
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className={cn("mt-2 font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer", teamSubtleBtn)}
          >
            + Upload Screenshot
          </button>
        </div>
      ) : viewMode === 'gallery' ? (
        /* GALLERY VIEW: Large Card-Based Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6 md:gap-7">
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
                className={cn(
                  "group relative bg-white dark:bg-[#111111] rounded-2xl border border-black/5 dark:border-white/10 overflow-hidden shadow-md dark:shadow-none flex flex-col justify-between transition-all",
                  hoverBorderClass
                )}
              >
                {/* Image Container */}
                <div
                  onClick={() => setLightboxSubId(sub.id)}
                  className="relative aspect-video bg-black/90 overflow-hidden flex items-center justify-center cursor-pointer group/img"
                >
                  <img
                    src={sub.image_url}
                    alt={sub.caption || sub.game_name}
                    className={cn(
                      "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
                      isSpoilerHidden && "blur-xl scale-110 select-none pointer-events-none opacity-40"
                    )}
                  />

                  {/* Hover Fullscreen View Overlay */}
                  {!isSpoilerHidden && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1.5 pointer-events-none z-10">
                      <Maximize2 size={24} className="drop-shadow-lg" />
                      <span className="text-[10px] font-black tracking-widest uppercase drop-shadow-md">Full-Screen View</span>
                    </div>
                  )}

                  {/* Spoiler Overlay */}
                  {isSpoilerHidden && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-black/60 backdrop-blur-md z-10 text-center gap-2">
                      <div className="p-2 bg-red-500/20 text-red-400 rounded-full">
                        <EyeOff size={20} />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-white/90">Contains Spoiler</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRevealedSpoilers(prev => ({ ...prev, [sub.id]: true }));
                        }}
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
                      {/* Color-Coded Status Badge matching Team Palette */}
                      {(() => {
                        const status = sub.status || 'approved';
                        const team = sub.user_team || 'none';
                        const teamColor = TEAM_COLORS[team as Team] || TEAM_COLORS['none'];

                        if (status === 'approved' || status === 'verified') {
                          return (
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border flex items-center gap-1 shadow-sm backdrop-blur-md",
                              team !== 'none'
                                ? cn(teamColor.secondary, teamColor.primary, teamColor.border)
                                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            )}>
                              <CheckCircle size={10} className={team !== 'none' ? teamColor.primary : "text-emerald-400"} />
                              Approved
                            </span>
                          );
                        }
                        if (status === 'pending') {
                          return (
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm backdrop-blur-md">
                              <Clock size={10} className="text-amber-400 animate-pulse" />
                              Pending
                            </span>
                          );
                        }
                        return (
                          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm backdrop-blur-md">
                            <XCircle size={10} className="text-rose-400" />
                            Rejected
                          </span>
                        );
                      })()}

                      {sub.is_selected && (
                        <span className="bg-amber-500 text-black font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-lg shadow-md flex items-center gap-1">
                          <Star size={10} className="fill-black" /> Voting Entry
                        </span>
                      )}

                      {sub.is_spoiler && !isSpoilerHidden && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRevealedSpoilers(prev => ({ ...prev, [sub.id]: false }));
                          }}
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
                      {/* Quick Status Buttons for Admin */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminSetStatus(sub.id, 'approved');
                        }}
                        title="Mark as Approved"
                        className={cn(
                          "p-1.5 rounded-lg border transition-colors cursor-pointer",
                          (sub.status === 'approved' || !sub.status)
                            ? "bg-emerald-500 text-black border-emerald-400"
                            : "bg-black/80 hover:bg-black text-emerald-400 border-emerald-500/30"
                        )}
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminSetStatus(sub.id, 'pending');
                        }}
                        title="Mark as Pending"
                        className={cn(
                          "p-1.5 rounded-lg border transition-colors cursor-pointer",
                          sub.status === 'pending'
                            ? "bg-amber-500 text-black border-amber-400"
                            : "bg-black/80 hover:bg-black text-amber-400 border-amber-500/30"
                        )}
                      >
                        <Clock size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminSetStatus(sub.id, 'rejected');
                        }}
                        title="Mark as Rejected"
                        className={cn(
                          "p-1.5 rounded-lg border transition-colors cursor-pointer",
                          sub.status === 'rejected'
                            ? "bg-rose-500 text-white border-rose-400"
                            : "bg-black/80 hover:bg-black text-rose-400 border-rose-500/30"
                        )}
                      >
                        <XCircle size={12} />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminToggleSpoiler(sub);
                        }}
                        title={sub.is_spoiler ? "Unmark Spoiler" : "Force Spoiler"}
                        className="p-1.5 bg-black/80 hover:bg-black text-amber-400 rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSub(sub);
                          setEditCaption(sub.caption);
                          setEditGameName(sub.game_name);
                          setEditIsSpoiler(sub.is_spoiler);
                          setEditStatus(sub.status as any || 'approved');
                        }}
                        title="Edit Submission"
                        className="p-1.5 bg-black/80 hover:bg-black text-sky-400 rounded-lg border border-sky-500/30 transition-colors cursor-pointer"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminDelete(sub.id);
                        }}
                        title="Delete Submission"
                        className="p-1.5 bg-black/80 hover:bg-black text-red-400 rounded-lg border border-red-500/30 transition-colors cursor-pointer"
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
                          <img src={sub.user_avatar} alt="" className="w-6 h-6 rounded-full border border-white/10 shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                            {sub.user_name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <span className="text-xs font-bold dark:text-white text-slate-800 truncate">
                          {sub.user_name}
                        </span>
                      </div>

                      {/* Team badge and Admin User Submission Count */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {user?.isAdmin && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAdminFilterUserId(adminFilterUserId === sub.user_id ? null : sub.user_id);
                            }}
                            title={`Admin View: ${sub.user_name} has submitted ${userSubmissionCounts[sub.user_id]?.count || 1}/10 screenshots. Click to filter.`}
                            className={cn(
                              "text-[9px] font-black px-1.5 py-0.5 rounded border transition-colors cursor-pointer flex items-center gap-1",
                              adminFilterUserId === sub.user_id
                                ? "bg-amber-500 text-black border-amber-400"
                                : "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                            )}
                          >
                            <Camera size={10} />
                            <span>{userSubmissionCounts[sub.user_id]?.count || 1}/10</span>
                          </button>
                        )}

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
                        {sub.is_selected ? "Official Entry" : "Set for Voting"}
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
      ) : (
        /* LIST VIEW: Streamlined Horizontal Rows */
        <div className="flex flex-col space-y-3.5">
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "group relative bg-white dark:bg-[#111111] rounded-2xl border border-black/5 dark:border-white/10 p-3.5 sm:p-4 shadow-md dark:shadow-none transition-all flex flex-col sm:flex-row items-stretch sm:items-center gap-4 hover:border-black/20 dark:hover:border-white/20",
                  hoverBorderClass
                )}
              >
                {/* Left Thumbnail with Lightbox trigger */}
                <div
                  onClick={() => setLightboxSubId(sub.id)}
                  className="w-full sm:w-48 md:w-56 aspect-video shrink-0 rounded-xl overflow-hidden relative bg-black/90 cursor-pointer group/thumb border border-black/10 dark:border-white/10"
                >
                  <img
                    src={sub.image_url}
                    alt={sub.caption || sub.game_name}
                    className={cn(
                      "w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-105",
                      isSpoilerHidden && "blur-lg scale-110 select-none pointer-events-none opacity-40"
                    )}
                  />

                  {/* Hover Fullscreen Overlay */}
                  {!isSpoilerHidden && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 pointer-events-none z-10">
                      <Maximize2 size={18} className="drop-shadow-lg" />
                      <span className="text-[9px] font-black uppercase tracking-wider">Expand</span>
                    </div>
                  )}

                  {/* Spoiler Tag & Reveal Button */}
                  {isSpoilerHidden && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-2 bg-black/60 backdrop-blur-md z-10 text-center gap-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-red-400">Spoiler</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRevealedSpoilers(prev => ({ ...prev, [sub.id]: true }));
                        }}
                        className="bg-white/20 hover:bg-white/30 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg backdrop-blur-md transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Eye size={10} /> Reveal
                      </button>
                    </div>
                  )}

                  {/* Top Left Game Pill */}
                  <div className="absolute top-2 left-2 z-10 pointer-events-none">
                    <span className="bg-black/80 backdrop-blur-md text-white/90 font-bold text-[9px] px-2 py-0.5 rounded border border-white/10 truncate max-w-[120px] block">
                      {sub.game_name}
                    </span>
                  </div>
                </div>

                {/* Center Content Section */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Top Row: User Avatar, Name, Team, Date & Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      {sub.user_avatar ? (
                        <img src={sub.user_avatar} alt="" className="w-6 h-6 rounded-full border border-white/10 shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {sub.user_name?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                      <span className="text-xs font-bold dark:text-white text-slate-800 truncate">
                        {sub.user_name}
                      </span>

                      {sub.user_team && sub.user_team !== 'none' && (
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                          TEAM_COLORS[sub.user_team as Team]?.secondary,
                          TEAM_COLORS[sub.user_team as Team]?.primary,
                          TEAM_COLORS[sub.user_team as Team]?.border
                        )}>
                          Team {sub.user_team}
                        </span>
                      )}

                      <span className="text-[10px] opacity-40 font-medium hidden md:inline">
                        • {new Date(sub.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Status & Voting Badges */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Color-coded status badge matching team color */}
                      {(() => {
                        const status = sub.status || 'approved';
                        const team = sub.user_team || 'none';
                        const teamColor = TEAM_COLORS[team as Team] || TEAM_COLORS['none'];

                        if (status === 'approved' || status === 'verified') {
                          return (
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border flex items-center gap-1 shadow-sm backdrop-blur-md",
                              team !== 'none'
                                ? cn(teamColor.secondary, teamColor.primary, teamColor.border)
                                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            )}>
                              <CheckCircle size={10} className={team !== 'none' ? teamColor.primary : "text-emerald-400"} />
                              Approved
                            </span>
                          );
                        }
                        if (status === 'pending') {
                          return (
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm backdrop-blur-md">
                              <Clock size={10} className="text-amber-400 animate-pulse" />
                              Pending
                            </span>
                          );
                        }
                        return (
                          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm backdrop-blur-md">
                            <XCircle size={10} className="text-rose-400" />
                            Rejected
                          </span>
                        );
                      })()}

                      {sub.is_selected && (
                        <span className="bg-amber-500 text-black font-black text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-lg shadow-sm flex items-center gap-1">
                          <Star size={10} className="fill-black" /> Voting Entry
                        </span>
                      )}

                      {/* Admin count badge */}
                      {user?.isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAdminFilterUserId(adminFilterUserId === sub.user_id ? null : sub.user_id);
                          }}
                          title={`Admin View: ${sub.user_name} has submitted ${userSubmissionCounts[sub.user_id]?.count || 1}/10 screenshots. Click to filter.`}
                          className={cn(
                            "text-[9px] font-black px-1.5 py-0.5 rounded border transition-colors cursor-pointer flex items-center gap-1",
                            adminFilterUserId === sub.user_id
                              ? "bg-amber-500 text-black border-amber-400"
                              : "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                          )}
                        >
                          <Camera size={10} />
                          <span>{userSubmissionCounts[sub.user_id]?.count || 1}/10</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Caption & Game */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold dark:text-white/90 text-slate-700">
                      {sub.game_name}
                    </p>
                    {sub.caption ? (
                      <p className="text-xs dark:text-white/70 text-slate-600 line-clamp-2 italic leading-relaxed">
                        "{sub.caption}"
                      </p>
                    ) : (
                      <p className="text-xs italic dark:text-white/30 text-slate-400">
                        No caption provided
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Action Toolbar */}
                <div className="flex sm:flex-col items-center justify-between sm:justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    {/* Set for Voting Star */}
                    {isMine && (
                      <button
                        onClick={() => handleSetForVoting(sub.id)}
                        title={sub.is_selected ? "Currently your official voting entry" : "Set this as your official voting entry"}
                        className={cn(
                          "p-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border",
                          sub.is_selected
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-black/5 dark:bg-white/5 text-slate-500 dark:text-white/50 border-black/10 dark:border-white/10 hover:border-amber-500/40"
                        )}
                      >
                        <Star size={14} className={sub.is_selected ? "fill-amber-400 text-amber-400" : ""} />
                        <span className="hidden sm:inline text-[10px]">{sub.is_selected ? "Entry" : "Set Entry"}</span>
                      </button>
                    )}

                    {/* Comments Button */}
                    <button
                      onClick={() => setActiveCommentSubId(sub.id)}
                      title="View & Add Comments"
                      className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-1.5 cursor-pointer border border-black/5 dark:border-white/5"
                    >
                      <MessageSquare size={14} />
                      <span>{subComments.length}</span>
                    </button>

                    {/* Vote Button */}
                    <button
                      onClick={() => handleVote(sub)}
                      disabled={isMine}
                      title={isMine ? "You cannot vote for your own submission" : (hasVoted ? "Remove vote" : "Vote for this screenshot")}
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

                  {/* Admin Quick Toolbar */}
                  {user?.isAdmin && (
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminSetStatus(sub.id, 'approved');
                        }}
                        title="Approve"
                        className={cn(
                          "p-1.5 rounded-lg border transition-colors cursor-pointer",
                          (sub.status === 'approved' || !sub.status)
                            ? "bg-emerald-500 text-black border-emerald-400"
                            : "bg-black/5 dark:bg-white/5 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                        )}
                      >
                        <Check size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminSetStatus(sub.id, 'pending');
                        }}
                        title="Pending"
                        className={cn(
                          "p-1.5 rounded-lg border transition-colors cursor-pointer",
                          sub.status === 'pending'
                            ? "bg-amber-500 text-black border-amber-400"
                            : "bg-black/5 dark:bg-white/5 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                        )}
                      >
                        <Clock size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminSetStatus(sub.id, 'rejected');
                        }}
                        title="Reject"
                        className={cn(
                          "p-1.5 rounded-lg border transition-colors cursor-pointer",
                          sub.status === 'rejected'
                            ? "bg-rose-500 text-white border-rose-400"
                            : "bg-black/5 dark:bg-white/5 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                        )}
                      >
                        <XCircle size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSub(sub);
                          setEditCaption(sub.caption);
                          setEditGameName(sub.game_name);
                          setEditIsSpoiler(sub.is_spoiler);
                          setEditStatus(sub.status as any || 'approved');
                        }}
                        title="Edit Submission"
                        className="p-1.5 bg-black/5 dark:bg-white/5 hover:bg-sky-500/20 text-sky-400 rounded-lg border border-sky-500/30 transition-colors cursor-pointer"
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminDelete(sub.id);
                        }}
                        title="Delete Submission"
                        className="p-1.5 bg-black/5 dark:bg-white/5 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 transition-colors cursor-pointer"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
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
                  <div className={cn("p-2 rounded-xl", userTeamColors.secondary, userTeamColors.primary)}>
                    <Camera size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Upload Screenshot</h3>
                    <p className="text-xs text-white/50">Earn +{event?.submission_points ?? editSubmissionPoints ?? 20} points for Team {user?.team || 'Members'}</p>
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
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={cn(
                        "border-2 border-dashed rounded-2xl p-6 text-center space-y-2 cursor-pointer transition-all",
                        isDragging
                          ? "border-white/40 bg-white/10 scale-[1.02]"
                          : "border-white/20 hover:border-white/40 bg-white/5"
                      )}
                    >
                      <Upload size={32} className={cn("mx-auto opacity-70", teamTextAccent)} />
                      <p className="text-xs font-bold text-white">Click or Drag Image Here</p>
                      <p className="text-[10px] text-white/40">PNG, JPG, WEBP up to 8MB</p>
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
                    className={cn("w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none", teamFocusBorder)}
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
                    className={cn("w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none", teamFocusBorder)}
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
                    className={cn("w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none resize-none", teamFocusBorder)}
                  />
                </div>

                {/* Checkboxes */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isSpoilerInput}
                      onChange={(e) => setIsSpoilerInput(e.target.checked)}
                      className="w-4 h-4 rounded bg-black/40 border-white/20 text-red-500 focus:ring-0 cursor-pointer"
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
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <Star size={12} className="fill-amber-400" />
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
                    className={cn("font-bold text-xs px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer", teamSolidBtn)}
                  >
                    {submitting ? 'Uploading...' : `Submit (+${event?.submission_points ?? editSubmissionPoints ?? 20} Points)`}
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
                  <MessageSquare size={16} className={teamTextAccent} />
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
                        <span className="text-[11px] font-bold text-white/90">
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
                  className={cn("flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none", teamFocusBorder)}
                />
                <button
                  type="submit"
                  disabled={commenting || !commentText.trim()}
                  className={cn("disabled:opacity-40 text-white font-bold p-2.5 rounded-xl transition-all cursor-pointer", teamSolidBtn)}
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

                <div>
                  <label className="block text-[11px] font-bold text-white/70 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="approved">Approved</option>
                    <option value="pending">Pending Review</option>
                    <option value="rejected">Rejected</option>
                  </select>
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

      {/* FULL-SCREEN LIGHTBOX MODAL */}
      <AnimatePresence>
        {lightboxSubId && (() => {
          const currentSub = submissions.find(s => s.id === lightboxSubId);
          if (!currentSub) return null;

          const isSpoilerHidden = currentSub.is_spoiler && !revealedSpoilers[currentSub.id];
          const voteCount = voteCounts[currentSub.id] || 0;
          const hasVoted = myVotedSubIds.has(currentSub.id);
          const isMine = currentSub.user_id === currentUserId;
          const subComments = comments.filter(c => c.submission_id === currentSub.id);
          const currentIndex = filteredSubmissions.findIndex(s => s.id === lightboxSubId);
          const totalCount = filteredSubmissions.length;

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-2xl flex flex-col select-none overflow-hidden cursor-pointer"
              onClick={(e) => {
                if (e.target === e.currentTarget) setLightboxSubId(null);
              }}
            >
              {/* Lightbox Top Header */}
              <div 
                className="flex items-center justify-between p-4 px-6 border-b border-white/10 bg-black/60 backdrop-blur-md z-10 shrink-0 cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <span className={cn("text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1.5", teamActiveTab)}>
                    <Camera size={14} /> {currentSub.game_name}
                  </span>
                  {totalCount > 1 && (
                    <span className="text-xs font-bold text-white/50">
                      {currentIndex >= 0 ? currentIndex + 1 : 1} of {totalCount}
                    </span>
                  )}
                  {currentSub.is_selected && (
                    <span className="bg-amber-500 text-black font-black text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1">
                      <Star size={12} className="fill-black" /> Official Voting Entry
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="hidden md:inline-block text-[11px] text-white/40 font-mono">
                    Use ← → to navigate, Esc to close
                  </span>
                  <button
                    onClick={() => setLightboxSubId(null)}
                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
                    title="Close (Esc)"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Lightbox Main Container (Image + Interactive Overlay Details Panel) */}
              <div className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
                {/* Main Image View Container */}
                <div 
                  className="flex-1 relative bg-black flex items-center justify-center p-4 md:p-8 overflow-hidden group cursor-pointer"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setLightboxSubId(null);
                  }}
                >
                  {/* Prev / Next Controls */}
                  {totalCount > 1 && (
                    <>
                      <button
                        onClick={handlePrevLightbox}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3.5 bg-black/60 hover:bg-black/90 text-white/80 hover:text-white rounded-full border border-white/10 backdrop-blur-md transition-all z-30 cursor-pointer hover:scale-110 active:scale-95"
                        title="Previous Screenshot (←)"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <button
                        onClick={handleNextLightbox}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3.5 bg-black/60 hover:bg-black/90 text-white/80 hover:text-white rounded-full border border-white/10 backdrop-blur-md transition-all z-30 cursor-pointer hover:scale-110 active:scale-95"
                        title="Next Screenshot (→)"
                      >
                        <ChevronRight size={24} />
                      </button>
                    </>
                  )}

                  {/* Full Image */}
                  <div className="relative max-w-full max-h-full flex items-center justify-center">
                    <img
                      src={currentSub.image_url}
                      alt={currentSub.caption || currentSub.game_name}
                      className={cn(
                        "max-w-full max-h-[75vh] md:max-h-[85vh] object-contain rounded-xl shadow-2xl transition-all duration-300",
                        isSpoilerHidden && "blur-2xl scale-105 pointer-events-none select-none opacity-30"
                      )}
                    />

                    {/* Spoiler Blur Overlay inside Lightbox */}
                    {isSpoilerHidden && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/70 backdrop-blur-lg rounded-xl text-center gap-3">
                        <div className="p-3 bg-red-500/20 text-red-400 rounded-full">
                          <EyeOff size={28} />
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-white">Contains Spoiler</h3>
                        <button
                          onClick={() => setRevealedSpoilers(prev => ({ ...prev, [currentSub.id]: true }))}
                          className="bg-white/20 hover:bg-white/30 text-white font-bold text-xs px-4 py-2 rounded-xl backdrop-blur-md transition-colors cursor-pointer flex items-center gap-2"
                        >
                          <Eye size={14} /> Click to Reveal Image
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Side Overlay Panel with Details & Interactive Controls */}
                <div 
                  className="w-full md:w-96 bg-[#121215] border-t md:border-t-0 md:border-l border-white/10 flex flex-col justify-between overflow-y-auto p-6 space-y-6 shrink-0 cursor-default"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="space-y-5">
                    {/* Contributor Profile */}
                    <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/10">
                      <div className="flex items-center gap-3 truncate">
                        {currentSub.user_avatar ? (
                          <img src={currentSub.user_avatar} alt="" className="w-10 h-10 rounded-full border border-white/20" />
                        ) : (
                          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm", teamActiveTab)}>
                            {currentSub.user_name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <div className="truncate">
                          <h4 className="text-sm font-bold text-white truncate">{currentSub.user_name}</h4>
                          <span className="text-[11px] text-white/40">
                            {new Date(currentSub.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {currentSub.user_team && currentSub.user_team !== 'none' && (
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md border shrink-0",
                          TEAM_COLORS[currentSub.user_team as Team]?.secondary,
                          TEAM_COLORS[currentSub.user_team as Team]?.primary,
                          TEAM_COLORS[currentSub.user_team as Team]?.border
                        )}>
                          Team {currentSub.user_team}
                        </span>
                      )}
                    </div>

                    {/* Admin User Submission Stats Pill in Lightbox */}
                    {user?.isAdmin && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
                        <div className="flex items-center gap-1.5">
                          <Camera size={13} className="text-amber-400" />
                          <span>
                            Admin: <strong>{userSubmissionCounts[currentSub.user_id]?.count || 1} / 10</strong> uploaded ({userSubmissionCounts[currentSub.user_id]?.selectedCount || 0} voting entry)
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setAdminFilterUserId(currentSub.user_id);
                            setLightboxSubId(null);
                          }}
                          className="text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 px-2 py-0.5 rounded text-amber-200 transition-colors cursor-pointer"
                        >
                          Filter by user
                        </button>
                      </div>
                    )}

                    {/* Game Title & Overlay Caption Box */}
                    <div className="space-y-2">
                      <span className={cn("text-[10px] font-black uppercase tracking-widest", teamTextAccent)}>Game Title</span>
                      <h3 className="text-base font-extrabold text-white">{currentSub.game_name}</h3>

                      {currentSub.caption ? (
                        <div className="mt-3 p-3.5 rounded-xl bg-white/5 border border-white/10">
                          <p className="text-xs text-white/90 leading-relaxed italic">
                            "{currentSub.caption}"
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs italic text-white/30">No caption provided</p>
                      )}
                    </div>

                    {/* Lightbox Voting & Official Entry Controls */}
                    <div className="space-y-2.5 pt-2">
                      <button
                        onClick={() => handleVote(currentSub)}
                        disabled={isMine}
                        className={cn(
                          "w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-95",
                          hasVoted
                            ? "bg-rose-500 text-white shadow-rose-500/30"
                            : "bg-white/10 hover:bg-rose-500/20 text-white hover:text-rose-400 border border-white/10",
                          isMine && "opacity-40 cursor-not-allowed hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <Heart size={16} className={cn(hasVoted && "fill-white")} />
                        <span>{hasVoted ? 'You Voted for this Screenshot!' : `Vote for Screenshot (${voteCount})`}</span>
                      </button>

                      {isMine && (
                        <button
                          onClick={() => handleSetForVoting(currentSub.id)}
                          className={cn(
                            "w-full py-2 px-3 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                            currentSub.is_selected
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : "bg-white/5 text-white/70 border-white/10 hover:border-amber-500/40"
                          )}
                        >
                          <Star size={14} className={currentSub.is_selected ? "fill-amber-400 text-amber-400" : ""} />
                          {currentSub.is_selected ? "Official Entry for Voting" : "Set as Official Voting Entry"}
                        </button>
                      )}
                    </div>

                    {/* Lightbox Comments Section */}
                    <div className="space-y-3 pt-4 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                          <MessageSquare size={14} className={teamTextAccent} />
                          Comments ({subComments.length})
                        </h4>
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-2.5 pr-1">
                        {subComments.length === 0 ? (
                          <p className="text-xs italic text-white/40 text-center py-4">No comments yet. Be the first!</p>
                        ) : (
                          subComments.map(c => (
                            <div key={c.id} className="p-2.5 rounded-xl bg-white/5 border border-white/5 space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-white/90">{c.user_name}</span>
                                <span className="text-[9px] text-white/30">{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <p className="text-xs text-white/80 leading-normal">{c.content}</p>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Comment Input */}
                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="text"
                          placeholder="Write a comment..."
                          value={activeCommentSubId === currentSub.id ? commentText : ''}
                          onFocus={() => setActiveCommentSubId(currentSub.id)}
                          onChange={(e) => {
                            setActiveCommentSubId(currentSub.id);
                            setCommentText(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddComment(currentSub.id);
                          }}
                          className={cn("flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none", teamFocusBorder)}
                        />
                        <button
                          onClick={() => handleAddComment(currentSub.id)}
                          disabled={commenting || !commentText.trim()}
                          className={cn("p-2 disabled:opacity-40 text-white rounded-xl transition-colors cursor-pointer", teamSolidBtn)}
                        >
                          <Send size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Admin Delete Action inside Lightbox */}
                  {user?.isAdmin && (
                    <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[10px] text-amber-400 font-mono">Admin Action</span>
                      <button
                        onClick={() => {
                          handleAdminDelete(currentSub.id);
                          setLightboxSubId(null);
                        }}
                        className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={12} /> Delete Submission
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
      {/* ADMIN USER SUBMISSIONS BREAKDOWN MODAL */}
      <AnimatePresence>
        {adminUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 md:p-8 max-w-2xl w-full space-y-6 shadow-2xl overflow-y-auto max-h-[85vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl">
                    <Users size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      User Screenshot Submissions
                      <span className="bg-amber-500/20 text-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-500/30">
                        Admin Overview
                      </span>
                    </h3>
                    <p className="text-xs text-white/50">
                      View how many screenshots each member has uploaded (Max 10 / user)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAdminUserModalOpen(false)}
                  className="p-2 text-white/40 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 rounded-2xl p-3 border border-white/5 text-center">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">Total Submissions</span>
                  <span className="text-lg font-black text-white">{submissions.length}</span>
                </div>
                <div className="bg-white/5 rounded-2xl p-3 border border-white/5 text-center">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">Active Users</span>
                  <span className="text-lg font-black text-amber-400">{userSubmissionsList.length}</span>
                </div>
                <div className="bg-white/5 rounded-2xl p-3 border border-white/5 text-center">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">Voting Entries</span>
                  <span className="text-lg font-black text-emerald-400">{submissions.filter(s => s.is_selected).length}</span>
                </div>
              </div>

              {/* User Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  placeholder="Search user name, team, or game..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Users List */}
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {filteredUserList.length === 0 ? (
                  <div className="text-center py-8 text-white/40 text-xs italic">
                    {userSearchTerm ? 'No users matching your search.' : 'No screenshot submissions yet.'}
                  </div>
                ) : (
                  filteredUserList.map((usr) => (
                    <div
                      key={usr.userId}
                      className="p-3.5 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {usr.avatar ? (
                          <img src={usr.avatar} alt="" className="w-8 h-8 rounded-full border border-white/10" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-xs">
                            {usr.name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{usr.name}</span>
                            {usr.team && usr.team !== 'none' && (
                              <span className={cn(
                                "text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0",
                                TEAM_COLORS[usr.team as Team]?.secondary,
                                TEAM_COLORS[usr.team as Team]?.primary,
                                TEAM_COLORS[usr.team as Team]?.border
                              )}>
                                Team {usr.team}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/40">
                            <span>Games: {usr.games.slice(0, 2).join(', ')}{usr.games.length > 2 ? ` +${usr.games.length - 2}` : ''}</span>
                            <span>•</span>
                            <span>{new Date(usr.lastSubmitted).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Counts & Actions */}
                      <div className="flex items-center gap-3 justify-between sm:justify-end">
                        <div className="text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-xs font-black text-amber-400">{usr.count} / 10</span>
                            <span className="text-[10px] text-white/50 font-medium">uploads</span>
                          </div>
                          {usr.selectedCount > 0 ? (
                            <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1 justify-end">
                              <Star size={10} className="fill-emerald-400" /> Voting Entry Set
                            </span>
                          ) : (
                            <span className="text-[9px] font-medium text-white/30 block">No voting entry set</span>
                          )}
                        </div>

                        <button
                          onClick={() => {
                            setAdminFilterUserId(usr.userId);
                            setAdminUserModalOpen(false);
                          }}
                          className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold px-3 py-1.5 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                        >
                          View Screenshots
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Close Button */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-white/40">
                  Showing {filteredUserList.length} of {userSubmissionsList.length} active contributors
                </span>
                <button
                  onClick={() => setAdminUserModalOpen(false)}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
