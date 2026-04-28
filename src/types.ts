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
  role?: string;
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

export interface CompetitionEvent {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface ThemeHelper {
  accent: string;
  text: string;
  bg: string;
  border: string;
  ring: string;
  shadow: string;
  glow: string;
  secondary: string;
  muted: string;
}

export const TEAM_COLORS: Record<Team, { primary: string; secondary: string; border: string }> = {
  blue: { primary: 'text-blue-accent', secondary: 'bg-blue-accent/10', border: 'border-blue-accent/50' },
  green: { primary: 'text-green-accent', secondary: 'bg-green-accent/10', border: 'border-green-accent/50' },
  purple: { primary: 'text-purple-accent', secondary: 'bg-purple-accent/10', border: 'border-purple-accent/50' },
  red: { primary: 'text-red-accent', secondary: 'bg-red-accent/10', border: 'border-red-accent/50' },
  none: { primary: 'text-white', secondary: 'bg-white/10', border: 'border-white/20' }
};
