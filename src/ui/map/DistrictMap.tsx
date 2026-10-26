import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

export interface DistrictMapProps {
  onClose: () => void;
  onSetGps?: (poiId: string, name: string) => void;
}

interface POI {
  id: string;
  name: string;
  category: 'garages' | 'fuel' | 'passengers' | 'shops' | 'important';
  subtitle: string;
  xPct: number;
  yPct: number;
}

const DHAKA_POIS: POI[] = [
  {
    id: 'kamal_garage',
    name: "Kamal Bhai's Garage",
    category: 'garages',
    subtitle: 'Repair • Upgrade • Chat',
    xPct: 52,
    yPct: 62,
  },
  {
    id: 'farmgate_stand',
    name: 'Farmgate Bus Stand',
    category: 'passengers',
    subtitle: 'Nabila Rahman waiting',
    xPct: 48,
    yPct: 56,
  },
  {
    id: 'padma_fuel',
    name: 'Padma Fuel Station',
    category: 'fuel',
    subtitle: 'Petrol & Octane Refuel',
    xPct: 44,
    yPct: 65,
  },
  {
    id: 'mintu_tong',
    name: "Mintu's Tea Stall (Tong)",
    category: 'shops',
    subtitle: 'Recharge phone & hear rumors',
    xPct: 38,
    yPct: 52,
  },
];

export function DistrictMap({ onClose, onSetGps }: DistrictMapProps): JSX.Element {
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [selectedPoi, setSelectedPoi] = useState<POI>(DHAKA_POIS[0] as POI);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const filterOptions = [
    { id: 'All', label: 'All', icon: '🌐' },
    { id: 'Passengers', label: 'Passengers', icon: '👥' },
    { id: 'Shops', label: 'Shops', icon: '🏪' },
    { id: 'Fuel Stations', label: 'Fuel Stations', icon: '⛽' },
    { id: 'Garages', label: 'Garages', icon: '🔧' },
    { id: 'Important', label: 'Important', icon: '⭐' },
    { id: 'Story', label: 'Story', icon: '📖' },
  ];

  return (
    <div
      data-testid="district-map"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: '#090d16',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Map Header & Controls */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '24px',
          right: '24px',
          zIndex: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {/* Compass / Heading */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '50%',
            width: '46px',
            height: '46px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 25px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'auto',
          }}
        >
          <span style={{ fontSize: '14px', color: '#38bdf8', fontWeight: 900 }}>▲</span>
          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>N</span>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            color: '#ffffff',
            padding: '10px 18px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            pointerEvents: 'auto',
            boxShadow: '0 8px 25px rgba(0, 0, 0, 0.5)',
          }}
        >
          ✕ বন্ধ করুন (Back)
        </button>
      </div>

      {/* Main Map View Canvas / SVG */}
      <div
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          background: '#dceaf7', // River / Waterbody background color
          cursor: 'grab',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease',
          }}
        >
          {/* Detailed Dhaka SVG Outline */}
          <svg
            viewBox="0 0 1000 1200"
            style={{ width: '100%', height: '100%', minWidth: '900px' }}
          >
            {/* Waterbodies (Turag, Buriganga, Balu Rivers) */}
            <path
              d="M 280 0 Q 300 300 230 600 T 260 1000 Q 300 1150 500 1200 L 0 1200 L 0 0 Z"
              fill="#9ec5e8"
            />
            <path
              d="M 750 0 Q 720 400 800 700 T 730 1200 L 1000 1200 L 1000 0 Z"
              fill="#9ec5e8"
            />
            {/* Buriganga River (South) */}
            <path
              d="M 250 960 Q 450 1050 650 980 T 800 1100 L 800 1200 L 250 1200 Z"
              fill="#7baad4"
            />

            {/* Dhaka Land Mass (Cream / Beige land) */}
            <path
              d="M 380 60 L 620 60 Q 710 200 680 400 T 720 800 Q 650 980 480 970 Q 340 960 300 850 Q 260 650 330 400 Z"
              fill="#fefcf0"
              stroke="#b5c6ba"
              strokeWidth="3"
            />

            {/* Greenery / Parks / Cantonment */}
            <path d="M 460 280 Q 560 260 540 380 T 450 360 Z" fill="#d4e8cb" />
            <path d="M 520 700 Q 640 680 620 780 T 510 770 Z" fill="#d4e8cb" />
            <path d="M 370 780 Q 420 770 410 820 T 360 810 Z" fill="#d4e8cb" />

            {/* Airport Runway (Kurmitola / Zia) */}
            <rect x="520" y="240" width="22" height="110" transform="rotate(-25 520 240)" fill="#a0aab2" />

            {/* Major Arterial Highways (Yellow & Dark Grey) */}
            {/* Airport Road / Mymensingh Road */}
            <path d="M 480 80 L 510 240 L 525 450 L 500 580" fill="none" stroke="#eab308" strokeWidth="6" />
            <path d="M 480 80 L 510 240 L 525 450 L 500 580" fill="none" stroke="#334155" strokeWidth="3" />

            {/* Mirpur Road */}
            <path d="M 360 400 Q 380 550 440 680 L 460 820" fill="none" stroke="#eab308" strokeWidth="6" />
            <path d="M 360 400 Q 380 550 440 680 L 460 820" fill="none" stroke="#334155" strokeWidth="3" />

            {/* Kazi Nazrul Islam Ave to Old Dhaka / Motijheel */}
            <path d="M 500 580 L 510 720 L 560 850 L 520 950" fill="none" stroke="#eab308" strokeWidth="6" />
            <path d="M 500 580 L 510 720 L 560 850 L 520 950" fill="none" stroke="#334155" strokeWidth="3" />

            {/* Local Secondary Roads */}
            <path d="M 350 480 L 640 500" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
            <path d="M 410 600 L 670 640" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
            <path d="M 340 700 L 680 730" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
            <path d="M 320 860 L 650 880" fill="none" stroke="#94a3b8" strokeWidth="2.5" />

            {/* District Labels */}
            <text x="490" y="140" fontSize="18" fontWeight="bold" fill="#334155" textAnchor="middle">Uttara</text>
            <text x="610" y="170" fontSize="14" fill="#64748b" textAnchor="middle">Uttarkhan</text>
            <text x="590" y="270" fontSize="14" fill="#64748b" textAnchor="middle">Khilkhet</text>
            <text x="420" y="310" fontSize="16" fontWeight="bold" fill="#334155" textAnchor="middle">Mirpur</text>
            <text x="490" y="340" fontSize="15" fill="#64748b" textAnchor="middle">Cantonment</text>
            <text x="630" y="340" fontSize="16" fontWeight="bold" fill="#334155" textAnchor="middle">Bashundhara</text>
            <text x="440" y="440" fontSize="15" fill="#475569" textAnchor="middle">Kazipara</text>
            <text x="540" y="450" fontSize="15" fill="#475569" textAnchor="middle">Banani</text>
            <text x="610" y="460" fontSize="16" fontWeight="bold" fill="#334155" textAnchor="middle">Gulshan</text>
            <text x="630" y="520" fontSize="15" fill="#475569" textAnchor="middle">Badda</text>
            <text x="530" y="520" fontSize="16" fontWeight="bold" fill="#334155" textAnchor="middle">Mohakhali</text>
            <text x="360" y="560" fontSize="15" fill="#475569" textAnchor="middle">Gabtoli</text>
            <text x="440" y="560" fontSize="15" fill="#475569" textAnchor="middle">Agargaon</text>
            <text x="545" y="580" fontSize="16" fontWeight="bold" fill="#334155" textAnchor="middle">Tejgaon</text>
            <text x="480" y="620" fontSize="18" fontWeight="900" fill="#dc2626" textAnchor="middle">Farmgate</text>
            <text x="380" y="660" fontSize="16" fontWeight="bold" fill="#334155" textAnchor="middle">Mohammadpur</text>
            <text x="450" y="720" fontSize="18" fontWeight="bold" fill="#334155" textAnchor="middle">Dhanmondi</text>
            <text x="530" y="730" fontSize="15" fill="#475569" textAnchor="middle">Shahbagh</text>
            <text x="590" y="730" fontSize="15" fill="#475569" textAnchor="middle">Kakrail</text>
            <text x="620" y="790" fontSize="15" fill="#475569" textAnchor="middle">Khilgaon</text>
            <text x="550" y="800" fontSize="18" fontWeight="bold" fill="#334155" textAnchor="middle">Motijheel</text>
            <text x="430" y="840" fontSize="15" fill="#475569" textAnchor="middle">Lalbagh</text>
            <text x="510" y="890" fontSize="16" fontWeight="bold" fill="#334155" textAnchor="middle">Old Dhaka / Wari</text>
            <text x="620" y="890" fontSize="15" fill="#475569" textAnchor="middle">Jatrabari</text>
            <text x="510" y="930" fontSize="15" fill="#475569" textAnchor="middle">Sadarghat</text>
          </svg>

          {/* Interactive POI Pins */}
          {DHAKA_POIS.map((poi) => (
            <div
              key={poi.id}
              onClick={() => setSelectedPoi(poi)}
              style={{
                position: 'absolute',
                top: `${poi.yPct}%`,
                left: `${poi.xPct}%`,
                transform: 'translate(-50%, -100%)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                filter: selectedPoi.id === poi.id ? 'drop-shadow(0 0 10px #22c55e)' : 'none',
              }}
            >
              <div
                style={{
                  background: poi.category === 'garages' ? '#f59e0b' : poi.category === 'fuel' ? '#ef4444' : '#22c55e',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  border: '2px solid #ffffff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                {poi.category === 'garages' ? '🔧' : poi.category === 'fuel' ? '⛽' : '📍'}
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#0f172a',
                  background: 'rgba(255, 255, 255, 0.95)',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                }}
              >
                {poi.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Left POI Filter Drawer (Glass pill list) */}
      <div
        style={{
          position: 'absolute',
          top: '80px',
          left: '24px',
          zIndex: 10,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '18px',
          padding: '10px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          boxShadow: '0 15px 35px rgba(0, 0, 0, 0.6)',
        }}
      >
        {filterOptions.map((f) => (
          <button
            key={f.id}
            onClick={() => setSelectedFilter(f.id)}
            style={{
              background: selectedFilter === f.id ? '#22c55e' : 'transparent',
              color: selectedFilter === f.id ? '#052e16' : '#cbd5e1',
              border: 'none',
              borderRadius: '12px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{f.icon}</span>
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      {/* Bottom Selected POI Card */}
      {selectedPoi && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '20px',
            padding: '14px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.7)',
            minWidth: '380px',
          }}
        >
          {/* POI Preview Thumbnail */}
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
            }}
          >
            🔧
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
              {selectedPoi.name}
            </span>
            <span style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              {selectedPoi.subtitle}
            </span>
          </div>

          {/* Set GPS Button */}
          <button
            onClick={() => {
              if (onSetGps) onSetGps(selectedPoi.id, selectedPoi.name);
              onClose();
            }}
            style={{
              background: '#22c55e',
              border: 'none',
              borderRadius: '12px',
              color: '#052e16',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
            }}
          >
            <span>➤</span>
            <span>Set GPS</span>
          </button>
        </div>
      )}

      {/* Zoom Buttons (Bottom Right) */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <button
          onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            fontSize: '20px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          +
        </button>
        <button
          onClick={() => setZoomLevel((z) => Math.max(0.75, z - 0.25))}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            fontSize: '20px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          −
        </button>
      </div>
    </div>
  );
}
