import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { ModalPanel, PrimaryButton, SecondaryButton } from '../components';

export interface CharacterRelationship {
  id: string;
  name: string;
  role: string;
  quote: string;
  affinity: number; // -100 to +100
  avatarIcon: string;
  actionIcon: string;
  actionLabel: string;
}

export interface StoryRelationshipsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const INITIAL_CHARACTERS: CharacterRelationship[] = [
  {
    id: 'ma',
    name: 'Ma (মা)',
    role: 'Family',
    quote: 'সবসময় আমার পাশে আছেন। সাবধানে বাইক চালাও বাবা।',
    affinity: 80,
    avatarIcon: '👵',
    actionIcon: '🎁',
    actionLabel: 'Send Money',
  },
  {
    id: 'mintu',
    name: 'Mintu (বন্ধু)',
    role: 'Tea Stall Friend',
    quote: 'ধীর আছে, পরে ক্যাফেতে হবে। কাচ্চি খাওয়াবি কবে?',
    affinity: -20,
    avatarIcon: '🧔',
    actionIcon: '💬',
    actionLabel: 'Chat',
  },
  {
    id: 'kamal',
    name: 'Kamal Bhai (গ্যারেজ)',
    role: 'Master Mechanic',
    quote: 'বাইক ভালো রাখলে কম নেবে। সার্ভিসিং সময় মতো করাইস।',
    affinity: 60,
    avatarIcon: '👨‍🔧',
    actionIcon: '🔧',
    actionLabel: 'Repair Discount',
  },
  {
    id: 'nabila',
    name: 'Nabila Rahman',
    role: 'Frequent Rider (Dhanmondi)',
    quote: 'বিশ্বস্ত যাত্রী, আশা করছি আবার যাবেন।',
    affinity: 30,
    avatarIcon: '👩',
    actionIcon: '⭐',
    actionLabel: 'Direct Ride',
  },
];

export function StoryRelationshipsModal({
  isOpen,
  onClose,
}: StoryRelationshipsModalProps): JSX.Element | null {
  const [activeTab, setActiveTab] = useState<'people' | 'story' | 'goals'>('people');
  const [characters, setCharacters] = useState<CharacterRelationship[]>(INITIAL_CHARACTERS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAction = (char: CharacterRelationship) => {
    setToastMessage(`Action with ${char.name} performed! Affinity increased.`);
    setCharacters((prev) =>
      prev.map((c) =>
        c.id === char.id ? { ...c, affinity: Math.min(100, c.affinity + 5) } : c,
      ),
    );
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title="Story & Relationships (সম্পর্ক ও গল্প)"
      subtitle="Dhaka street connections and narrative progression"
      headerBadge={
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-pink-500/20 text-pink-400 border border-pink-500/30">
          Chapter 1: The New Rider
        </span>
      }
      footer={
        <div className="w-full flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Keep your network healthy for discounts and emergency contacts.
          </span>
          <SecondaryButton size="sm" onClick={onClose}>
            Close (বন্ধ)
          </SecondaryButton>
        </div>
      }
    >
      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {(['people', 'story', 'goals'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all capitalize ${
              activeTab === tab
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'people' ? '👥 People (মানুষ)' : tab === 'story' ? '📖 Story (গল্প)' : '🎯 Goals (লক্ষ্য)'}
          </button>
        ))}
      </div>

      {toastMessage && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-600/40 text-emerald-300 text-xs flex items-center gap-2">
          <span>✨</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Tab: People */}
      {activeTab === 'people' && (
        <div className="space-y-3">
          {characters.map((char) => {
            const isPositive = char.affinity >= 0;
            const barWidth = Math.abs(char.affinity);
            return (
              <div
                key={char.id}
                className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between gap-4 backdrop-blur-md hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-center text-2xl shadow-inner">
                    {char.avatarIcon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-100">{char.name}</h4>
                      <span className="text-[10px] text-slate-400 font-medium">({char.role})</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5 italic truncate max-w-xs">
                      &quot;{char.quote}&quot;
                    </p>

                    {/* Affinity Bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="w-32 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isPositive ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span
                        className={`text-[10px] font-mono font-bold ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? `+${char.affinity}` : char.affinity}
                      </span>
                    </div>
                  </div>
                </div>

                <PrimaryButton
                  size="sm"
                  onClick={() => handleAction(char)}
                  icon={char.actionIcon}
                  className="flex-shrink-0"
                >
                  {char.actionLabel}
                </PrimaryButton>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Story */}
      {activeTab === 'story' && (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400">Chapter 1: The Fresh Fuel</span>
              <span className="text-[10px] text-slate-400">In Progress</span>
            </div>
            <h4 className="text-sm font-bold text-slate-100 mt-1">Starting Out in Farmgate</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              You bought an old 125cc commuter bike with Kamal Bhai’s help. Now you have to earn ৳ ১,০০০
              every day to pay the installment and save up for your own workshop dream.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 opacity-60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Chapter 2: Dhaka Alleyways</span>
              <span className="text-[10px] text-slate-500">Locked</span>
            </div>
            <h4 className="text-sm font-bold text-slate-300 mt-1">Night Runs & Shadows</h4>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Complete 25 rides and maintain a 4.5+ platform rating to unlock Gulshan and Banani VIP requests.
            </p>
          </div>
        </div>
      )}

      {/* Tab: Goals */}
      {activeTab === 'goals' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-200">Daily Living Target</span>
              <span className="text-emerald-400">৳ ৬৫০ / ৳ ১,০০০</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '65%' }} />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-200">Own Garage Workshop Fund</span>
              <span className="text-amber-400">৳ ৪,৫০০ / ৳ ৫০,০০০</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: '9%' }} />
            </div>
          </div>
        </div>
      )}
    </ModalPanel>
  );
}
