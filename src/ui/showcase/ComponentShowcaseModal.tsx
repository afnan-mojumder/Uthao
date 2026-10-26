import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  AmberButton,
  StatusBar,
  CharacterPortrait,
  NotificationToast,
  MapMarker,
  ModalPanel,
  Toggle,
  Badge,
  SearchInput,
} from '../components';

export interface ComponentShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ComponentShowcaseModal({
  isOpen,
  onClose,
}: ComponentShowcaseModalProps): JSX.Element | null {
  const [toggleVal, setToggleVal] = useState(true);
  const [searchVal, setSearchVal] = useState('');
  const [fuelVal, setFuelVal] = useState(75);

  if (!isOpen) return null;

  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title="Uthao UI Component Library & Reference Sheet"
      subtitle="Reusable UI elements & system tokens for low-poly Dhaka simulation"
      headerBadge={
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          Antigravity Design Expert
        </span>
      }
      footer={
        <div className="w-full flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Design tokens: Uthao Green (#22C55E), Dhaka Amber (#F59E0B), Danger Red (#EF4444)
          </span>
          <PrimaryButton size="sm" onClick={onClose}>
            Done (সম্পন্ন)
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Section 10: Core UI Components */}
        <section className="space-y-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            10. Core UI Components (Reusable)
          </h4>

          {/* Buttons Row */}
          <div className="flex flex-wrap items-center gap-2.5">
            <PrimaryButton size="sm">Primary Button</PrimaryButton>
            <SecondaryButton size="sm">Secondary</SecondaryButton>
            <DangerButton size="sm">Danger</DangerButton>
            <AmberButton size="sm">Amber Warning</AmberButton>
            <PrimaryButton size="sm" icon="🚀">
              Icon + Text
            </PrimaryButton>
          </div>

          {/* Toggles and Badges */}
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-800/80">
            <Toggle
              label="Sound Effects"
              checked={toggleVal}
              onChange={setToggleVal}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" icon="✓">Success</Badge>
              <Badge variant="warning" icon="!">Warning</Badge>
              <Badge variant="error" icon="✕">Error</Badge>
              <Badge variant="info" icon="ℹ">Info</Badge>
            </div>
          </div>

          {/* Search input */}
          <div className="pt-2">
            <SearchInput
              value={searchVal}
              onChange={setSearchVal}
              placeholder="Search Dhaka locations (e.g. Dhanmondi, Farmgate)..."
            />
          </div>
        </section>

        {/* Section 11: Status Indicators */}
        <section className="space-y-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            11. Status Indicators
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatusBar
              label="Fuel (জ্বালানী)"
              value={fuelVal}
              variant="fuel"
              icon="⛽"
            />
            <StatusBar
              label="Bike Condition (বাইক কন্ডিশন)"
              value={88}
              variant="health"
              icon="🏍️"
            />
            <StatusBar
              label="Passenger Patience (ধৈর্য)"
              value={60}
              variant="patience"
              icon="⏱️"
            />
            <StatusBar
              label="Police Attention / Heat"
              value={35}
              variant="police"
              icon="🚨"
            />
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-slate-800 text-xs">
            <span className="text-slate-400">Rider Rating:</span>
            <span className="font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-600/30">
              ★ 4.8 / 5.0 (127 rides)
            </span>
            <span className="text-slate-400 ml-auto">Crime Risk:</span>
            <span className="font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-600/30">
              Low-Med
            </span>
          </div>

          {/* Interactive Fuel Simulator */}
          <div className="flex items-center gap-3 pt-2 text-xs">
            <span className="text-slate-400">Test Fuel Gauge:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={fuelVal}
              onInput={(e) => setFuelVal(Number((e.target as HTMLInputElement).value))}
              className="flex-1 accent-emerald-500"
            />
            <span className="font-mono text-emerald-400 font-bold w-8">{fuelVal}%</span>
          </div>

          {/* Character Portraits Preview */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-4">
            <CharacterPortrait name="Nabila Rahman" rating={4.8} ridesCount={127} mood="happy" size="sm" />
            <CharacterPortrait name="Kamal Bhai" role="Garage" mood="neutral" size="sm" />
            <CharacterPortrait name="Mintu" role="Friend" mood="angry" size="sm" />
          </div>
        </section>

        {/* Section 12: Dialog & Notification Elements */}
        <section className="space-y-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            12. Dialog & Notification Elements
          </h4>

          {/* Passenger Speech Bubble */}
          <div className="relative p-3 rounded-2xl bg-slate-800/90 border border-slate-700/80 text-xs text-slate-200 max-w-sm">
            <div className="font-bold text-emerald-400 mb-0.5">নাবিলা রহমান (যাত্রী)</div>
            &quot;ভাই, একটু আস্তে চালান! ট্রাফিক জ্যাম বেশি।&quot;
          </div>

          {/* Danger Banner */}
          <NotificationToast
            title="Warning: High Crime Risk Route"
            message="This route is risky at night. Consider taking Green Road instead of the alley."
            variant="warning"
          />

          {/* Tip Banner */}
          <NotificationToast
            title="Tip: Main Road Pickup"
            message="Pick up from Farmgate Overbridge foot to avoid traffic delays."
            variant="info"
          />
        </section>

        {/* Section 13: Economy Icons */}
        <section className="space-y-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            13. Economy Icons
          </h4>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center">
            {[
              { icon: '💵', label: 'Earnings', color: 'text-emerald-400' },
              { icon: '⛽', label: 'Fuel', color: 'text-amber-400' },
              { icon: '🔧', label: 'Repair', color: 'text-cyan-400' },
              { icon: '📋', label: 'Fine', color: 'text-rose-400' },
              { icon: '🤝', label: 'Bribe', color: 'text-yellow-400' },
              { icon: '🏥', label: 'Medical', color: 'text-red-400' },
              { icon: '📦', label: 'Comp', color: 'text-purple-400' },
              { icon: '🎁', label: 'Tip', color: 'text-emerald-300' },
            ].map((item) => (
              <div
                key={item.label}
                className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 flex flex-col items-center gap-1 hover:border-slate-500 transition-colors"
              >
                <span className="text-lg">{item.icon}</span>
                <span className={`text-[10px] font-bold ${item.color}`}>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Section 14: Map Icons (Using Your Map) */}
        <section className="space-y-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            14. Map Icons (Dhaka District Map Pins)
          </h4>

          <div className="flex flex-wrap items-center gap-4">
            <MapMarker type="pickup" label="Pickup" />
            <MapMarker type="dropoff" label="Drop-off" />
            <MapMarker type="passenger" label="Passenger" />
            <MapMarker type="shop" label="Shop" />
            <MapMarker type="fuel" label="Fuel Station" />
            <MapMarker type="garage" label="Kamal's Garage" />
            <MapMarker type="danger" label="Danger Zone" />
            <MapMarker type="story" label="Story POI" />
            <MapMarker type="airport" label="Kurmitola" />
          </div>
        </section>
      </div>
    </ModalPanel>
  );
}
