import type { JSX } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { toBanglaDigits, formatTaka } from '../utils/bangla';
import { PrimaryButton, DangerButton, StatusBar } from '../components';

export interface UthaoPhoneProps {
  onAccept: (fare: number, isOffApp: boolean) => void;
  onDecline: () => void;
  onCounterOffer?: (newFare: number) => void;
  initialOffer?: number;
  suggestedFare?: number;
  passengerName?: string;
  rating?: number;
  completedRides?: number;
  pickupLocation?: string;
  dropoffLocation?: string;
  distanceKm?: number;
  durationMins?: number;
}

export function UthaoPhone({
  onAccept,
  onDecline,
  onCounterOffer,
  initialOffer = 80,
  suggestedFare = 120,
  passengerName = 'Nabila Rahman',
  rating = 4.8,
  completedRides = 127,
  pickupLocation = 'Farmgate Bus Stand',
  dropoffLocation = 'Dhanmondi 27 (Rapa Plaza)',
  distanceKm = 6.2,
  durationMins = 18,
}: UthaoPhoneProps): JSX.Element {
  const [viewMode, setViewMode] = useState<'request' | 'negotiate'>('request');
  const [currentOffer, setCurrentOffer] = useState<number>(initialOffer);
  const [patience, setPatience] = useState<number>(70);
  const [mood, setMood] = useState<'happy' | 'neutral' | 'angry'>('neutral');
  const [countdown, setCountdown] = useState<number>(12);
  const [customInputOpen, setCustomInputOpen] = useState<boolean>(false);
  const [customAmountStr, setCustomAmountStr] = useState<string>('');
  const [activeBottomTab, setActiveBottomTab] = useState<'home' | 'chat' | 'earnings' | 'profile'>('home');

  // Countdown timer for Ride Request
  useEffect(() => {
    if (viewMode !== 'request') return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [viewMode]);

  const handleQuickCounter = (additional: number) => {
    const nextFare = currentOffer + additional;
    setCurrentOffer(nextFare);
    setPatience((p) => Math.max(10, p - 20));
    if (nextFare > suggestedFare + 40) {
      setMood('angry');
    } else if (nextFare > suggestedFare) {
      setMood('neutral');
    } else {
      setMood('happy');
    }
    if (onCounterOffer) onCounterOffer(nextFare);
  };

  const handleCustomSubmit = () => {
    const val = parseInt(customAmountStr, 10);
    if (!isNaN(val) && val > 0) {
      setCurrentOffer(val);
      setPatience((p) => Math.max(10, p - 25));
      if (val > suggestedFare + 40) setMood('angry');
      setCustomInputOpen(false);
      if (onCounterOffer) onCounterOffer(val);
    }
  };

  return (
    <div
      data-testid="uthao-phone-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xl animate-fade-in font-sans select-none"
    >
      {/* Smartphone Casing */}
      <div
        className="relative w-[380px] max-w-full max-h-[92vh] rounded-[44px] border-[4px] border-slate-800 bg-[#0A0F1D] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_rgba(34,197,94,0.15)] flex flex-col overflow-hidden text-slate-100"
      >
        {/* Status Bar */}
        <header className="px-6 pt-3 pb-1 flex items-center justify-between text-xs font-bold text-slate-300 bg-[#0A0F1D]">
          <span>4:25</span>
          {/* Dynamic Island Speaker */}
          <div className="w-20 h-4 bg-black rounded-full shadow-inner" />
          <div className="flex items-center gap-1.5 text-[11px]">
            <span>5G</span>
            <span>📶</span>
            <span>78% 🔋</span>
          </div>
        </header>

        {/* View Mode Switcher Header Pill */}
        <div className="px-4 py-1.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium">Screen View:</span>
          <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('request')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                viewMode === 'request'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              2. Request
            </button>
            <button
              type="button"
              onClick={() => setViewMode('negotiate')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                viewMode === 'negotiate'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              3. Negotiate
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SCREEN 2: UTHAO PHONE APP (RIDE REQUEST)                      */}
        {/* ============================================================== */}
        {viewMode === 'request' && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* App Header */}
            <div className="px-5 py-3 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-lg shadow-md shadow-emerald-500/30">
                  উ
                </div>
                <div>
                  <h3 className="text-base font-black text-white leading-tight">Uthao</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Ride. Earn. Your City.</p>
                </div>
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white bg-slate-800/50"
                aria-label="Notifications"
              >
                🔔
              </button>
            </div>

            {/* Top Tabs */}
            <div className="px-4 py-2 flex items-center gap-2 bg-slate-900/30 border-b border-slate-800/50">
              <button
                type="button"
                className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500 text-slate-950 shadow-sm"
              >
                Ride Requests
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Map
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Earnings
              </button>
            </div>

            {/* Scrollable Request Content */}
            <div className="p-4 flex-1 space-y-3">
              {/* Passenger Request Card */}
              <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-lg shadow-inner">
                      👩
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-white">{passengerName}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                          Regular
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-amber-400 font-semibold mt-0.5">
                        <span>★ {rating}</span>
                        <span className="text-slate-400 text-[11px] font-normal">
                          ({toBanglaDigits(completedRides)} rides)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-black text-emerald-400 font-mono">
                      ৳ ৫৮০
                    </div>
                    <span className="text-[10px] text-slate-400">(Suggested)</span>
                  </div>
                </div>

                {/* Route Points */}
                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">🟢</span>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Pickup</span>
                      <p className="font-bold text-slate-100">{pickupLocation}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-rose-400 mt-0.5">🔴</span>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Drop-off</span>
                      <p className="font-bold text-slate-100">{dropoffLocation}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-700/40 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span>{toBanglaDigits(distanceKm)} km</span>
                  <span>~ {toBanglaDigits(durationMins)} mins</span>
                </div>
              </div>

              {/* Passenger Speech Bubble */}
              <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/60 shadow-sm relative">
                <p className="text-xs font-bold text-slate-100 italic leading-relaxed">
                  &quot;ভাই, ধানমন্ডি যাবেন? আমি আছি, একটু দ্রুত যাবেন।&quot;
                </p>
                <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-700/40">
                  <span className="text-[10px] text-slate-400">4:24 PM</span>
                  {/* Circular 12s timer */}
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-600/30">
                    <span>⏱️</span>
                    <span>{toBanglaDigits(countdown)} sec</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Accept / Decline */}
              <div className="flex items-center gap-2 pt-1">
                <PrimaryButton
                  fullWidth
                  size="md"
                  icon=">>"
                  onClick={() => setViewMode('negotiate')}
                >
                  Accept
                </PrimaryButton>
                <DangerButton
                  fullWidth
                  size="md"
                  icon="✕"
                  onClick={onDecline}
                >
                  Decline
                </DangerButton>
              </div>
            </div>

            {/* Bottom App Navigation Bar */}
            <nav className="px-4 py-2 bg-slate-900/90 border-t border-slate-800/80 flex items-center justify-around text-xs">
              {[
                { id: 'home', label: 'Home', icon: '🏠' },
                { id: 'chat', label: 'Chat', icon: '💬' },
                { id: 'earnings', label: 'Earnings', icon: '💵' },
                { id: 'profile', label: 'Profile', icon: '👤' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveBottomTab(tab.id as typeof activeBottomTab)}
                  className={`flex flex-col items-center gap-0.5 ${
                    activeBottomTab === tab.id
                      ? 'text-emerald-400 font-bold'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className="text-base">{tab.icon}</span>
                  <span className="text-[10px]">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* ============================================================== */}
        {/* SCREEN 3: RIDE NEGOTIATION DIALOG                             */}
        {/* ============================================================== */}
        {viewMode === 'negotiate' && (
          <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-3">
            {/* Header: Passenger & Mood */}
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-lg">
                  👩
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{passengerName}</h4>
                  <div className="text-xs text-amber-400 font-semibold">★ {rating}</div>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Passenger Mood</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-base">
                    {mood === 'happy' ? '😊' : mood === 'neutral' ? '😐' : '😠'}
                  </span>
                  <span
                    className={`text-xs font-bold capitalize ${
                      mood === 'happy'
                        ? 'text-emerald-400'
                        : mood === 'neutral'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {mood}
                  </span>
                </div>
              </div>
            </div>

            {/* Passenger Dialogue */}
            <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/70 relative">
              <p className="text-xs font-bold text-slate-100 italic leading-relaxed">
                &quot;ভাই, ধানমন্ডি যান। ৳ ৮০ হবে?&quot;
              </p>
            </div>

            {/* Fare Comparison Card */}
            <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Their Offer</span>
                <div className="text-xl font-black text-white font-mono mt-0.5">
                  {formatTaka(currentOffer)}
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-400 font-medium">Suggested Fare</span>
                <div className="text-lg font-black text-slate-400 font-mono mt-0.5">
                  {formatTaka(suggestedFare)}
                </div>
              </div>
            </div>

            {/* Patience Meter */}
            <div className="space-y-1">
              <StatusBar
                label="Patience (যাত্রীর ধৈর্য)"
                value={patience}
                variant="patience"
                icon="⏳"
              />
            </div>

            {/* Quick Bargaining Counters */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Counter Bargain (দরদাম)</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickCounter(20)}
                  className="py-2 px-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-amber-500/40 text-amber-300 font-bold text-xs shadow-sm active:scale-95 transition-all text-center"
                >
                  <div>+ ৳ ২০</div>
                  <div className="text-[10px] text-slate-400 font-normal">({formatTaka(currentOffer + 20)})</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickCounter(40)}
                  className="py-2 px-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-amber-500/40 text-amber-300 font-bold text-xs shadow-sm active:scale-95 transition-all text-center"
                >
                  <div>+ ৳ ৪০</div>
                  <div className="text-[10px] text-slate-400 font-normal">({formatTaka(currentOffer + 40)})</div>
                </button>
                <button
                  type="button"
                  onClick={() => setCustomInputOpen(!customInputOpen)}
                  className="py-2 px-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold text-xs shadow-sm active:scale-95 transition-all text-center"
                >
                  Custom Amount
                </button>
              </div>
            </div>

            {/* Custom Amount Drawer */}
            {customInputOpen && (
              <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Enter amount (৳)..."
                  value={customAmountStr}
                  onInput={(e) => setCustomAmountStr((e.target as HTMLInputElement).value)}
                  className="w-full px-2.5 py-1 text-xs rounded-lg bg-slate-900 border border-slate-600 text-white"
                />
                <button
                  type="button"
                  onClick={handleCustomSubmit}
                  className="px-3 py-1 bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg whitespace-nowrap"
                >
                  Offer
                </button>
              </div>
            )}

            {/* Dark Choice / Alternative Bargain Row */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onAccept(currentOffer, true)}
                className="p-2 rounded-xl bg-slate-800/70 border border-amber-500/50 hover:bg-amber-950/30 text-amber-300 text-xs font-bold transition-all shadow-sm flex flex-col items-center justify-center text-center"
                title="Bypass Uthao 20% platform commission"
              >
                <span>অ্যাপের বাইরে যাবেন?</span>
                <span className="text-[9px] text-amber-400/70">(Off-App 100% Cash)</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickCounter(10)}
                className="p-2 rounded-xl bg-slate-800/70 border border-slate-700 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all shadow-sm flex items-center justify-center text-center"
              >
                এটা বেশি, হবে না
              </button>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <PrimaryButton
                fullWidth
                size="md"
                onClick={() => onAccept(currentOffer, false)}
              >
                Accept {formatTaka(currentOffer)}
              </PrimaryButton>

              <DangerButton
                fullWidth
                size="md"
                onClick={onDecline}
              >
                Walk Away
              </DangerButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
