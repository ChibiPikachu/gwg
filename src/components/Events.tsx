import React from 'react';
import { Calendar, Plus, Edit2, Clock, CheckCircle2, AlertCircle, Loader2, History } from 'lucide-react';
import { CompetitionEvent, TEAM_COLORS } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';

export default function EventsPanel() {
  const { user, theme } = useAuth();
  const [events, setEvents] = React.useState<CompetitionEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editingEvent, setEditingEvent] = React.useState<Partial<CompetitionEvent> | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const isAdmin = user?.isAdmin || user?.role === 'admin' || user?.role === 'admins';

  const fetchEvents = React.useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;

    setSubmitting(true);
    try {
      const url = editingEvent.id 
        ? `/api/admin/events/${editingEvent.id}` 
        : '/api/admin/events';
      
      const res = await fetch(url, {
        method: editingEvent.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingEvent.title,
          description: editingEvent.description,
          startDate: editingEvent.start_date,
          endDate: editingEvent.end_date,
          isActive: editingEvent.is_active
        })
      });

      if (res.ok) {
        setIsEditing(false);
        setEditingEvent(null);
        fetchEvents();
      } else {
        alert('Failed to save event');
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving event');
    } finally {
      setSubmitting(false);
    }
  };

  const currentEvent = events.find(e => e.is_active);
  const pastEvents = events.filter(e => !e.is_active);

  if (loading) {
    return (
      <div className="p-20 flex justify-center">
        <Loader2 className={cn("animate-spin", theme.text)} size={40} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-12 pb-20">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter transition-all">Events</h1>
          <p className="opacity-40 text-sm font-medium">Track your progress and competition timelines</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => {
              setEditingEvent({ title: '', startDate: '', endDate: '', isActive: false });
              setIsEditing(true);
            }}
            className={cn("px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2", theme.bg, theme.glow, "text-white")}
          >
            <Plus size={20} />
            Create Event
          </button>
        )}
      </header>

      {/* Current Event Section */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <div className={cn("w-2 h-2 rounded-full animate-pulse", theme.bg)} />
          <h2 className="text-xs uppercase font-bold tracking-[0.2em] opacity-30">Active Event</h2>
        </div>
        
        {currentEvent ? (
          <div className={cn("bg-[#111111] rounded-3xl border-2 p-8 relative overflow-hidden group shadow-2xl", theme.border)}>
             <div className={cn("absolute top-0 right-0 w-64 h-64 opacity-5 blur-[100px] pointer-events-none rounded-full translate-x-1/2 -translate-y-1/2", theme.bg)} />
             
             <div className="relative z-10">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                 <div className="space-y-4 max-w-2xl">
                   <h3 className={cn("text-5xl font-black uppercase tracking-tight leading-none group-hover:scale-[1.02] transition-transform origin-left underline underline-offset-8", theme.text)}>
                     {currentEvent.title}
                   </h3>
                   <p className="opacity-60 text-lg">
                     {(currentEvent as any).description || "Join the seasonal competition and earn points for your team!"}
                   </p>
                   <div className="flex flex-wrap gap-4 pt-4">
                     <div className="bg-white/5 px-4 py-2 rounded-xl flex items-center gap-2 border border-white/5">
                        <Calendar size={16} className={theme.text} />
                        <span className="text-sm font-bold opacity-80">
                          {new Date((currentEvent as any).start_date).toLocaleDateString()} - {new Date((currentEvent as any).end_date).toLocaleDateString()}
                        </span>
                     </div>
                   </div>
                 </div>

                 <div className="flex flex-col gap-4 min-w-[240px] w-full md:w-auto">
                    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col items-center">
                       <Clock size={32} className={cn("mb-3", theme.text)} />
                       <div className="text-center font-mono space-y-1">
                          <div className="text-3xl font-black">ACTIVE</div>
                          <div className="text-[10px] uppercase opacity-40 font-bold">Progression is open</div>
                       </div>
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => {
                          setEditingEvent(currentEvent);
                          setIsEditing(true);
                        }}
                        className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                      >
                        <Edit2 size={14} />
                        Modify Event
                      </button>
                    )}
                 </div>
               </div>
             </div>
          </div>
        ) : (
          <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-12 text-center opacity-40 italic">
            No active event currently. Stay tuned!
          </div>
        )}
      </section>

      {/* Past Events Section */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <History size={16} className="opacity-30" />
          <h2 className="text-xs uppercase font-bold tracking-[0.2em] opacity-30">Archive</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pastEvents.map((event) => (
            <div key={event.id} className="bg-white/5 rounded-2xl border border-white/5 p-6 hover:bg-white/10 transition-all group relative">
              <div className="flex justify-between items-start mb-4">
                <div className={cn("px-2 py-1 rounded text-[8px] uppercase font-bold tracking-widest border border-white/10", event.is_active ? theme.text : "opacity-40")}>
                  {event.is_active ? "Current" : "Closed"}
                </div>
                {isAdmin && (
                  <button 
                    onClick={() => {
                      setEditingEvent(event);
                      setIsEditing(true);
                    }}
                    className="p-2 hover:bg-white/10 rounded-lg text-white/30 hover:text-white transition-all"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </div>
              <h4 className={cn("font-bold text-xl mb-2 transition-colors uppercase tracking-tight", theme.text)}>{event.title}</h4>
              <p className="text-xs opacity-50 mb-6 line-clamp-2">{event.description}</p>
              <div className="pt-4 border-t border-white/5 flex items-center justify-between text-[10px] uppercase font-bold tracking-widest opacity-30">
                <span>Timeline</span>
                <span>{new Date(event.end_date).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Management Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#111111] w-full max-w-lg rounded-3xl border border-white/10 p-8 shadow-2xl space-y-8 animate-in zoom-in-95 duration-200">
            <header className="flex justify-between items-center">
              <h3 className="text-2xl font-black uppercase">{editingEvent?.id ? 'Edit Event' : 'Create Event'}</h3>
              <button onClick={() => setIsEditing(false)} className="opacity-40 hover:opacity-100 transition-all text-2xl">×</button>
            </header>

            <form onSubmit={handleSaveEvent} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold opacity-40">Event Title</label>
                <input 
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-white/30 transition-all"
                  value={editingEvent?.title}
                  onChange={e => setEditingEvent({ ...editingEvent!, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold opacity-40">Description</label>
                <textarea 
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-white/30 transition-all min-h-[100px] resize-none"
                  value={editingEvent?.description || ''}
                  onChange={e => setEditingEvent({ ...editingEvent!, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold opacity-40">Start Date</label>
                  <input 
                    type="date"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-white/30 transition-all"
                    value={editingEvent?.start_date?.split('T')[0] || ''}
                    onChange={e => setEditingEvent({ ...editingEvent!, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold opacity-40">End Date</label>
                  <input 
                    type="date"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-white/30 transition-all"
                    value={editingEvent?.end_date?.split('T')[0] || ''}
                    onChange={e => setEditingEvent({ ...editingEvent!, end_date: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-all">
                <input 
                  type="checkbox"
                  className={cn("w-5 h-5 rounded border-white/10 bg-black/40", theme.text)}
                  checked={!!editingEvent?.is_active}
                  onChange={e => setEditingEvent({ ...editingEvent!, is_active: e.target.checked })}
                />
                <div className="flex flex-col">
                  <span className="font-bold text-sm uppercase tracking-tight">Active Event</span>
                  <span className="text-[10px] opacity-40">Marks this as the primary event for submissions</span>
                </div>
              </label>

              <button 
                disabled={submitting}
                className={cn("w-full py-4 text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2", theme.bg, theme.glow)}
              >
                {submitting ? <Loader2 className="animate-spin" size={20} /> : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

