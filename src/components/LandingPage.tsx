import React from 'react';
import { useAuth } from '@/components/AuthProvider';

export default function LandingPage() {
  const { loginWithSteam } = useAuth();

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-16 py-12">
      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-xl opacity-60">Welcome! We are</h1>
          <h2 className="text-6xl font-display text-white">Girls Who Game</h2>
        </div>
        
        <div className="flex flex-col gap-6 text-base opacity-80 leading-relaxed max-w-3xl">
          <p>
            We're a group of girls and enbys who enjoy playing and talking about videogames. Genre and platform don't matter in our community, you could be a Marvel's Rivals enthusiast, or enjoy metroidvanians, or play horror games or even on mobile. It also doesn't matter if you're a seasoned veteran or are just starting out, if you enjoy playing videogames, you have a place here with us!
          </p>
          <p className="opacity-60 text-sm">
            Our only requirement is that you identify with any of the following pronouns: <span className="text-blue-400">she/her - she/they - they/them</span>
          </p>
          <p>
            This website is basically to keep track of members' achievements since we run bimonthly events that end with a chance to get a Steam key for the winning team.
          </p>
          <p>
            That being said, we hope you found this site through our group. <br />
            If you didn't and you like what you read, here are some links that might help you!
          </p>
        </div>

        <div className="flex flex-col gap-8 mt-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-xl font-bold">SteamGifts Thread:</h3>
            <a href="#" className="text-blue-400 hover:underline">Read here.</a>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xl font-bold">Steam Group:</h3>
            <p className="text-sm">
              <a href="#" className="text-blue-400 hover:underline">Apply here</a>. If you're rejected, please add Chibi on Steam and explain your situation.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xl font-bold">Discord Server:</h3>
            <p className="text-sm opacity-80">Once you've been approved on Steam, you can find it in the discussions!</p>
          </div>
        </div>
      </section>

      <div className="h-px bg-white/5 w-full" />

      <section className="flex flex-col gap-8">
        <h2 className="text-3xl font-bold uppercase tracking-tight">FAQ</h2>
        
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
             <h3 className="text-xl font-bold">What are events about?</h3>
             <div className="flex flex-col gap-4 opacity-80 text-sm leading-relaxed">
                <p>The basic gist is that you send in screenshots and achievements of the games you've played for points. Screenshots you can share in the Discord server, and achievements you send in through here.</p>
                <p>We have four categories for game length, which will multiply your points based on how many hours you've played. They are:</p>
                <p className="font-bold">Short (0-8 hours) - Medium (8-15 hours) - Long (15-25 hours) - Very long (25+ hours).</p>
                <p>At the end of every event, a winner is decided and if you're a member of that team you get to vote on which game you'd like the mods to raffle between the members of the winning team.</p>
                <p>More information about events can be found in the Discord server (and soon in the Steam group too), so be sure to join it!</p>
             </div>
          </div>
        </div>
      </section>
    </div>
  );
}
