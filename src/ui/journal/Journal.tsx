import { useState } from 'preact/hooks';
import { t } from '../i18n';
import type { SimSnapshot } from '../../sim/GameManager';
import type { MissionDef } from '../../sim/schemas';
import type { ObjectiveState } from '../../sim/mission/objectives';

export interface JournalProps {
  snapshot: SimSnapshot;
  activeMissions: MissionDef[];
  getObjectiveStates: (missionId: string) => ObjectiveState[];
  onClose: () => void;
}

export function Journal({
  snapshot,
  activeMissions,
  getObjectiveStates,
  onClose,
}: JournalProps) {
  const [activeTab, setActiveTab] = useState<'missions' | 'characters' | 'reputation' | 'tendencies'>('missions');

  const { story, reputation } = snapshot;

  // Derive identity tendencies (0-100)
  const rating = reputation?.rating ?? 5.0;
  const safety = reputation?.safetyRecord ?? { nearMisses: 0, bumps: 0, crashes: 0, infractions: 0 };
  const riskScore = reputation?.riskScore ?? 0;
  const localTrust = reputation?.localTrust ?? 30;

  const proScore = Math.min(100, Math.max(0, Math.round((rating / 5.0) * 80 - (safety.crashes * 20 + safety.bumps * 5))));
  const negScore = Math.min(100, Math.max(0, Math.round(50 + (reputation?.promises?.kept ?? 0) * 10 - (reputation?.promises?.broken ?? 0) * 15)));
  const hustlerScore = Math.min(100, Math.max(0, Math.round(riskScore * 15 + safety.infractions * 10)));
  const regularScore = Math.min(100, Math.max(0, Math.round(localTrust * 0.8 + Object.values(story.characterRelationships).reduce((a, b) => a + (b > 10 ? 10 : 0), 0))));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        color: '#f8fafc',
        fontFamily: "'Noto Sans Bengali', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: '90%',
          maxWidth: '800px',
          height: '85vh',
          backgroundColor: '#1e293b',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0f172a',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b' }}>
              {t('journal_title') || 'রাইডার জার্নাল (Rider Journal)'}
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              অধ্যায় {story.currentChapter} · দিন {snapshot.clock.day}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#334155',
              border: 'none',
              color: '#f8fafc',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            ✕ {t('btn_close') || 'বন্ধ'}
          </button>
        </div>

        {/* Tab Bar */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #334155',
            backgroundColor: '#1e293b',
          }}
        >
          {(
            [
              { id: 'missions', label: 'মিশন (Missions)' },
              { id: 'characters', label: 'পরিচিত মুখ (Characters)' },
              { id: 'reputation', label: 'সুনাম ও নিরাপত্তা (Reputation)' },
              { id: 'tendencies', label: 'রাইডার পরিচয় (Identity)' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '12px 8px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#334155' : 'transparent',
                color: activeTab === tab.id ? '#f59e0b' : '#94a3b8',
                fontWeight: activeTab === tab.id ? 700 : 500,
                borderBottom: activeTab === tab.id ? '3px solid #f59e0b' : 'none',
                cursor: 'pointer',
                fontSize: '0.9rem',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {activeTab === 'missions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#38bdf8' }}>
                  চলতি মিশন (Active Missions)
                </h3>
                {activeMissions.length === 0 ? (
                  <div style={{ color: '#64748b', fontStyle: 'italic' }}>
                    আপাতত কোনো সক্রিয় মিশন নেই। নতুন দিনের অপেক্ষা করুন।
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {activeMissions.map((m) => {
                      const states = getObjectiveStates(m.id);
                      return (
                        <div
                          key={m.id}
                          style={{
                            backgroundColor: '#0f172a',
                            padding: '16px',
                            borderRadius: '12px',
                            border: '1px solid #334155',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f59e0b', marginBottom: '4px' }}>
                            {t(m.titleKey)}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '12px' }}>
                            {t(m.descKey)}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {m.objectives.map((obj) => {
                              const s = states.find((st) => st.id === obj.id);
                              const done = s?.completed ?? false;
                              const progress = s?.progress ?? 0;
                              const target = s?.target ?? 1;
                              return (
                                <div
                                  key={obj.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    backgroundColor: '#1e293b',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: done ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>
                                      {done ? '✓' : '○'}
                                    </span>
                                    <span style={{ textDecoration: done ? 'line-through' : 'none', color: done ? '#94a3b8' : '#f8fafc' }}>
                                      {t(obj.descKey)}
                                    </span>
                                  </div>
                                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
                                    {target > 1 ? `${progress}/${target}` : done ? 'সম্পন্ন' : 'বাকি'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {story.completedMissions.length > 0 && (
                <div>
                  <h3 style={{ margin: '16px 0 12px 0', fontSize: '1.1rem', color: '#10b981' }}>
                    সম্পন্ন মিশন (Completed Missions)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {story.completedMissions.map((id) => (
                      <div
                        key={id}
                        style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          color: '#a7f3d0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>✓</span>
                        <span style={{ fontWeight: 600 }}>{t(`mission_${id}_title`) !== `mission_${id}_title` ? t(`mission_${id}_title`) : id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'characters' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {[
                { id: 'ma', name: 'মা (Mother)', role: 'পরিবার ও দায়িত্ব' },
                { id: 'mintu', name: 'মিন্টু (Mintu)', role: 'চা স্টল ও বন্ধু' },
                { id: 'kamal_bhai', name: 'কামাল ভাই (Kamal Bhai)', role: 'বিশ্বস্ত মেকানিক' },
                { id: 'nabila', name: 'নাবিলা (Nabila)', role: 'বিশ্ববিদ্যালয় শিক্ষার্থী' },
                { id: 'si_morshed', name: 'এসআই মোর্শেদ (SI Morshed)', role: 'ট্রাফিক পুলিশ' },
                { id: 'jamil', name: 'জামিল (Jamil)', role: 'রহস্যময় ক্লায়েন্ট' },
              ].map((c) => {
                const rel = story.characterRelationships[c.id] ?? 0;
                return (
                  <div
                    key={c.id}
                    style={{
                      backgroundColor: '#0f172a',
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid #334155',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc' }}>{c.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{c.role}</div>
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                        <span>সম্পর্ক (Trust)</span>
                        <span style={{ fontWeight: 700, color: rel >= 0 ? '#10b981' : '#ef4444' }}>
                          {rel > 0 ? `+${rel}` : rel}
                        </span>
                      </div>
                      <div style={{ height: '6px', backgroundColor: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(0, 50 + rel / 2))}%`,
                            backgroundColor: rel >= 0 ? '#10b981' : '#ef4444',
                            borderRadius: '3px',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'reputation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>অ্যাপ রেটিং (App Rating)</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                    ★ {rating.toFixed(2)}
                  </div>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>লোকাল আস্থা (Local Trust)</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                    {localTrust}/100
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#e2e8f0' }}>নিরাপত্তা রেকর্ড (Safety Record)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>{safety.nearMisses}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>নিয়ার মিস</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fbbf24' }}>{safety.bumps}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ধাক্কা</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>{safety.crashes}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>দুর্ঘটনা</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f97316' }}>{safety.infractions}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>আইন অমান্য</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tendencies' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '8px' }}>
                আপনার সিদ্ধান্ত এবং রাইডিং স্টাইল নির্ধারণ করবে ঢাকার রাস্তায় আপনার চূড়ান্ত পরিচয় ও সমাপ্তি:
              </div>
              {[
                { name: 'পেশাদার (Professional)', score: proScore, desc: 'নিরাপদ রাইডিং, উচ্চ রেটিং এবং সময়ানুবর্তিতা', color: '#38bdf8' },
                { name: 'দরকষাকষিবিদ (Negotiator)', score: negScore, desc: 'ভাড়া আদায় এবং নায্য লাভের ক্ষেত্রে কৌশলী', color: '#fbbf24' },
                { name: 'হাঁটুরে / ঝুঁকিপ্রিয় (Hustler)', score: hustlerScore, desc: 'দ্রুত আয়, আইন এড়িয়ে শর্টকাট ও ঝুঁকিপূর্ণ ট্রিপ', color: '#f97316' },
                { name: 'পাড়ার নিয়মিত (Regular)', score: regularScore, desc: 'স্থানীয় সম্পর্ক, প্রতিশ্রুতি রক্ষা ও社区বিশ্বাস', color: '#10b981' },
              ].map((item) => (
                <div
                  key={item.name}
                  style={{
                    backgroundColor: '#0f172a',
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: item.color }}>{item.name}</span>
                    <span style={{ fontWeight: 700, color: item.color }}>{item.score}%</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>{item.desc}</div>
                  <div style={{ height: '8px', backgroundColor: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${item.score}%`,
                        backgroundColor: item.color,
                        borderRadius: '4px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
