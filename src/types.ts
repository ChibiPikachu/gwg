export type Team = 'blue' | 'green' | 'purple' | 'red' | 'none';

export interface UserProfile {
  uid: string;
  steamId: string;
  steamName: string;
  steamAvatar: string;
  discordId?: string;
  discordName?: string;
  discordAvatar?: string;
  team: Team;
  isAdmin: boolean;
  status: string;
  points: number;
}

export type SubmissionStatus = 'pending' | 'verified' | 'rejected';

export interface Submission {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  gameId: string;
  gameTitle: string;
  gameImage: string;
  achievementsBefore: number;
  hoursBefore: number;
  achievementsDuring: number;
  hoursDuring: number;
  multiplier: number;
  points: number;
  status: SubmissionStatus;
  notes: string;
  eventId: string;
  createdAt: number;
  verifierId?: string;
  rejectionReason?: string;
}

export interface Event {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export const TEAM_COLORS: Record<Team, { primary: string; secondary: string; border: string }> = {
  blue: { primary: 'text-blue-400', secondary: 'bg-blue-400/10', border: 'border-blue-400/50' },
  green: { primary: 'text-green-400', secondary: 'bg-green-400/10', border: 'border-green-400/50' },
  purple: { primary: 'text-purple-400', secondary: 'bg-purple-400/10', border: 'border-purple-400/50' },
  red: { primary: 'text-red-400', secondary: 'bg-red-400/10', border: 'border-red-400/50' },
  none: { primary: 'text-white', secondary: 'bg-white/10', border: 'border-white/20' }
};
