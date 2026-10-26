import type { JSX } from 'preact';
import type { PlayerConduct } from '../../sim/darkChoices/types';
import { formatTaka } from '../utils/bangla';

export interface ConsequenceJournalProps {
  conduct: PlayerConduct;
  onClose: () => void;
}

export function ConsequenceJournal({ conduct, onClose }: ConsequenceJournalProps): JSX.Element {
  const metrics = [
    { label: 'নৈতিকতা (Rider Integrity)', val: conduct.riderIntegrity, color: '#22c55e' },
    { label: 'শহরের সুনাম (Public Reputation)', val: conduct.publicReputation, color: '#38bdf8' },
    { label: 'উধাও অ্যাপ স্থিতি (Platform Standing)', val: conduct.platformStanding, color: '#a855f7' },
    { label: 'পুলিশি নজরদারি (Police Heat)', val: conduct.policeAttention, color: '#f59e0b' },
    { label: 'অপরাধ জগতে সংশ্লিষ্টতা (Underworld Exposure)', val: conduct.criminalExposure, color: '#ef4444' },
  ];

  return (
    <div
      data-testid="consequence-journal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9600,
        background: 'rgba(5, 10, 20, 0.85)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        userSelect: 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '540px',
          maxWidth: '92vw',
          maxHeight: '90vh',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>📋</span>
            <span style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>
              নৈতিকতা ও ঘটনা জার্নাল (Conduct & Consequences)
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Conduct Metrics Overview */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            borderRadius: '16px',
            padding: '14px 18px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {metrics.map((m) => (
            <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{m.label}</span>
                <span style={{ color: m.color, fontWeight: 800 }}>{Math.round(m.val)}%</span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
                <div style={{ width: `${m.val}%`, height: '100%', background: m.color, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Incident History List */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
            সাম্প্রতিক ঘটনাপঞ্জি (Incident History):
          </span>
          {conduct.incidentHistory.length === 0 ? (
            <span style={{ fontSize: '12px', color: '#64748b' }}>এখনও কোনো বিশেষ ঘটনা লিপিবদ্ধ হয়নি।</span>
          ) : (
            conduct.incidentHistory.map((inc) => (
              <div
                key={inc.id}
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
                    {inc.summaryKey}
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {inc.details}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 800,
                      color: inc.cashDelta >= 0 ? '#22c55e' : '#ef4444',
                    }}
                  >
                    {inc.cashDelta >= 0 ? '+' : ''}{formatTaka(inc.cashDelta)}
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>Day {inc.day}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
