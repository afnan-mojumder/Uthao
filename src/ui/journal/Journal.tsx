import { useState } from 'preact/hooks';
import type { SimSnapshot } from '../../sim/GameManager';
import type { MissionDef } from '../../sim/schemas';
import type { StoryPromise } from '../../core/types';
import type { ObjectiveState } from '../../sim/mission/objectives';
import { CHARACTERS, isContactUnlocked } from '../../sim/passenger/PassengerAI';
import { MissionManager } from '../../sim/mission/MissionManager';
import { ModalPanel, CharacterPortrait, StatusBar } from '../components';
import {
  IconBell,
  IconCheck,
  IconClock,
  IconFlag,
  IconLock,
  IconMapPin,
  IconPhone,
  IconScroll,
  IconStar,
  IconWrench,
} from '../components/icons';
import { t, localDigits } from '../i18n';
import { Z_LAYER } from '../store';

export interface JournalProps {
  snapshot: SimSnapshot;
  activeMissions: MissionDef[];
  getObjectiveStates: (missionId: string) => ObjectiveState[];
  ownedUpgrades?: string[];
  onClose: () => void;
  zIndex?: number;
}

const KNOWN_FLAG_KEYS = new Set([
  'ch1_completed',
  'ch2_completed',
  'ch2_regulars_known',
  'ch2_rush_done',
  'ch3_completed',
  'ch4_completed',
  'ch5_calls_done',
  'ch5_completed',
  'ch6_decision_made',
  'campaign_completed',
  'appWarned',
  'appSuspended',
  'rentDelayedOnce',
  'rentEvictionWarning',
  'career_choice',
  'career_choice_savings',
  'joinedScheme',
  'cooperatedPolice',
  'contestedPoliceStop',
  'bribedPolice',
  'bribeRejected',
  'fledPolice',
  'fledAccident',
  'helpedHospitalFree',
  'kept_lost_phone',
  'm4_police_decision_made',
  'm5_package_delivered',
  'm5_promise_kept',
  'ma_payment_missed',
  'protectedPassenger',
  'tookRahimShortcut',
  'escapedRobbery',
  'robberyComply',
  'monsoon_survived',
  'puran_para_mastered',
]);

function formatDecisionLabel(flagKey: string): string {
  return t(`journal.flag_label.${flagKey}`);
}

function formatPromiseLabel(promise: StoryPromise): string {
  const translated = t(promise.descriptionKey);
  if (translated !== promise.descriptionKey) return translated;
  return promise.id.replace(/^promise_/, '').replace(/[_-]+/g, ' ');
}

function upgradeName(upgradeId: string): string {
  const short = upgradeId.replace(/^upgrade_/, '');
  const key = `upgrade.${short}.name`;
  const translated = t(key);
  return translated === key ? short.replace(/[_-]+/g, ' ') : translated;
}

export function Journal({
  snapshot,
  activeMissions,
  getObjectiveStates,
  ownedUpgrades: ownedUpgradesProp = [],
  onClose,
  zIndex = Z_LAYER.PANEL,
}: JournalProps) {
  const [activeTab, setActiveTab] = useState<'missions' | 'relations' | 'records'>('missions');

  const { day } = snapshot.clock;
  const { story, economy, reputation, todayCompletedRides } = snapshot;
  const chapter = story.currentChapter;
  const relationships = story.characterRelationships ?? {};
  const rating = reputation?.rating ?? economy.reputation ?? 5.0;
  const promisesRecord = reputation?.promises ?? { kept: 0, broken: 0 };
  const ownedUpgrades = ownedUpgradesProp;

  const unlockedDistricts = MissionManager.getUnlockedDistrictsForChapter(chapter).filter(
    // MissionManager already omits testloop in prod; fold out the literal so verify-prod-bundle stays clean.
    (d) => (import.meta.env.DEV ? d !== 'testloop' : true)
  );
  const activeFlags = Object.entries(story.branchFlags).filter(
    ([flagKey, val]) => KNOWN_FLAG_KEYS.has(flagKey) && Boolean(val)
  );
  const pendingPromises = story.promises.filter((p) => !p.fulfilled);
  const unlockedContacts = CHARACTERS.filter((c) => {
    const rel = relationships[c.id] ?? c.initialRelationship;
    return isContactUnlocked(c.id, rel);
  });

  const opportunities: Array<{ id: string; kind: 'district' | 'contact' | 'upgrade'; text: string }> = [
    ...unlockedDistricts.map((d) => ({
      id: `dist_${d}`,
      kind: 'district' as const,
      text: t('journal.opp_district', { name: t(`district.${d}`) }),
    })),
    ...unlockedContacts.map((c) => ({
      id: `contact_${c.id}`,
      kind: 'contact' as const,
      text: t('journal.opp_contact', { name: t(c.nameKey) }),
    })),
    ...ownedUpgrades.map((u) => ({
      id: `upg_${u}`,
      kind: 'upgrade' as const,
      text: t('journal.opp_upgrade', { name: upgradeName(u) }),
    })),
  ];

  const tabButtonStyle = (selected: boolean) => ({
    padding: '7px 14px',
    borderRadius: '9px',
    border: selected
      ? '1px solid rgba(245, 158, 11, 0.55)'
      : '1px solid rgba(148, 163, 184, 0.18)',
    backgroundColor: selected ? 'rgba(245, 158, 11, 0.18)' : 'rgba(30, 41, 59, 0.6)',
    color: selected ? '#FCD34D' : '#CBD5E1',
    fontWeight: 700,
    fontSize: '13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <ModalPanel
      testId="journal-panel"
      title={t('journal.title')}
      subtitle={t('journal.subtitle', {
        chapter: localDigits(chapter),
        day: localDigits(day),
      })}
      onClose={onClose}
      closeLabel={t('btn_close')}
      zIndex={zIndex}
      maxWidth="min(760px, 94vw)"
      panelStyle={{ maxHeight: '90dvh', overflowY: 'auto' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Compact Stats Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '8px',
          }}
        >
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: 'rgba(30, 41, 59, 0.62)',
              border: '1px solid rgba(148, 163, 184, 0.14)',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>{t('journal.summary_rides')}</div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>
              {localDigits(todayCompletedRides ?? 0)}
            </div>
          </div>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: 'rgba(30, 41, 59, 0.62)',
              border: '1px solid rgba(148, 163, 184, 0.14)',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>{t('journal.summary_earnings')}</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#4ADE80' }}>
              ৳{localDigits(economy.cash)}
            </div>
          </div>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: 'rgba(30, 41, 59, 0.62)',
              border: '1px solid rgba(148, 163, 184, 0.14)',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>{t('journal.summary_rating')}</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#FBBF24' }}>
              ★ {localDigits(rating.toFixed(1))}
            </div>
          </div>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: 'rgba(30, 41, 59, 0.62)',
              border: '1px solid rgba(148, 163, 184, 0.14)',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>{t('journal.summary_district')}</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#38BDF8' }}>
              {localDigits(unlockedDistricts.length)} / {localDigits(7)}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div role="tablist" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'missions'}
            data-testid="journal-tab-missions"
            onClick={() => setActiveTab('missions')}
            style={tabButtonStyle(activeTab === 'missions')}
          >
            {t('journal.tab_missions')} ({localDigits(activeMissions.length)})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'relations'}
            data-testid="journal-tab-relations"
            onClick={() => setActiveTab('relations')}
            style={tabButtonStyle(activeTab === 'relations')}
          >
            {t('journal.tab_relations', { count: localDigits(CHARACTERS.length) })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'records'}
            data-testid="journal-tab-records"
            onClick={() => setActiveTab('records')}
            style={tabButtonStyle(activeTab === 'records')}
          >
            {t('journal.tab_records')}
          </button>
        </div>

        {/* Tab 1: Active Missions */}
        {activeTab === 'missions' && (
          <section
            data-testid="journal-missions-section"
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            {activeMissions.length === 0 ? (
              <div
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(148, 163, 184, 0.16)',
                  color: '#94A3B8',
                  fontSize: '13px',
                  textAlign: 'center',
                }}
              >
                {t('journal.no_missions')}
              </div>
            ) : (
              activeMissions.map((mission) => {
                const states = getObjectiveStates(mission.id);
                const isSide = mission.id.startsWith('side_');
                return (
                  <div
                    key={mission.id}
                    data-testid={`journal-mission-${mission.id}`}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(30, 41, 59, 0.68)',
                      border: '1px solid rgba(148, 163, 184, 0.18)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '15px', color: '#F8FAFC' }}>
                        {t(mission.titleKey)}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isSide ? '#38BDF8' : '#FBBF24',
                        }}
                      >
                        {isSide ? t('map.poi_mission') : t('journal.story_focus_label')}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#CBD5E1' }}>
                      {t(mission.descKey)}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {states.map((st, idx) => {
                        const objDef = mission.objectives.find((o) => o.id === st.id);
                        return (
                          <div
                            key={st.id || idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '13px',
                              color: st.completed ? '#4ADE80' : '#E2E8F0',
                            }}
                          >
                            {st.completed ? (
                              <IconCheck size={14} color="#4ADE80" />
                            ) : (
                              <IconScroll size={14} color="#F59E0B" />
                            )}
                            <span style={{ flex: 1 }}>
                              {objDef ? t(objDef.descKey) : st.id}
                            </span>
                            {st.target > 1 && (
                              <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                                {localDigits(st.progress)}/{localDigits(st.target)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* Tab 2: All 10 Characters & Relationships */}
        {activeTab === 'relations' && (
          <section
            data-testid="journal-relations-section"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '10px',
            }}
          >
            {CHARACTERS.map((charDef) => {
              const rel = relationships[charDef.id] ?? charDef.initialRelationship;
              const unlocked = isContactUnlocked(charDef.id, rel);
              const clampedPct = Math.max(0, Math.min(100, Math.round(((rel + 50) / 150) * 100)));
              const moodTone: 'happy' | 'neutral' | 'tense' =
                rel >= 35 ? 'happy' : rel >= 0 ? 'neutral' : 'tense';

              return (
                <div
                  key={charDef.id}
                  data-testid={`journal-char-${charDef.id}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(30, 41, 59, 0.68)',
                    border: unlocked
                      ? '1px solid rgba(56, 189, 248, 0.35)'
                      : '1px solid rgba(148, 163, 184, 0.16)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <CharacterPortrait
                      name={t(charDef.nameKey)}
                      role={t(charDef.roleKey)}
                      characterId={charDef.id}
                      archetype={charDef.archetype}
                      mood={moodTone}
                      size={36}
                    />
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: unlocked ? '#38BDF8' : '#94A3B8',
                      }}
                    >
                      {unlocked ? <IconPhone size={12} /> : <IconLock size={12} />}
                      <span>
                        {unlocked
                          ? t('journal.char_contact_unlocked')
                          : t('journal.char_contact_locked', { min: localDigits(15) })}
                      </span>
                    </span>
                  </div>
                  <StatusBar
                    label={t('journal.relationship_label')}
                    value={clampedPct}
                    max={100}
                    tone={rel >= 25 ? 'green' : rel >= 0 ? 'amber' : 'red'}
                    valueText={localDigits(Math.round(rel))}
                  />
                </div>
              );
            })}
          </section>
        )}

        {/* Tab 3: Promises, Recent Decisions, and Unlocked Opportunities */}
        {activeTab === 'records' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Active Promises */}
            <section
              data-testid="journal-promises-section"
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: 'rgba(30, 41, 59, 0.64)',
                border: '1px solid rgba(148, 163, 184, 0.16)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '14px' }}>
                  <IconClock size={15} color="#FBBF24" />
                  <span>{t('journal.promises_title')}</span>
                </div>
                <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
                  {t('journal.promises_tally', {
                    kept: localDigits(promisesRecord.kept),
                    broken: localDigits(promisesRecord.broken),
                  })}
                </span>
              </div>
              {pendingPromises.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94A3B8' }}>{t('journal.no_promises')}</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {pendingPromises.map((promise) => (
                    <li key={promise.id} style={{ fontSize: '13px', color: '#FDE68A' }}>
                      {formatPromiseLabel(promise)}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Recent Decisions */}
            <section
              data-testid="journal-decisions-section"
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: 'rgba(30, 41, 59, 0.64)',
                border: '1px solid rgba(148, 163, 184, 0.16)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
                <IconFlag size={15} color="#38BDF8" />
                <span>{t('journal.decisions_title')}</span>
              </div>
              {activeFlags.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94A3B8' }}>{t('journal.no_decisions')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {activeFlags.slice(-8).reverse().map(([flagKey]) => (
                    <div
                      key={flagKey}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        color: '#E2E8F0',
                      }}
                    >
                      <IconCheck size={14} color="#38BDF8" />
                      <span>{formatDecisionLabel(flagKey)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Unlocked Opportunities */}
            <section
              data-testid="journal-opportunities-section"
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: 'rgba(30, 41, 59, 0.64)',
                border: '1px solid rgba(148, 163, 184, 0.16)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
                <IconStar size={15} color="#4ADE80" />
                <span>{t('journal.opportunities_title')}</span>
              </div>
              {opportunities.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94A3B8' }}>{t('journal.no_opportunities')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'row', gap: '6px', flexWrap: 'wrap' }}>
                  {opportunities.map((opp) => (
                    <span
                      key={opp.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 9px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        border: '1px solid rgba(148, 163, 184, 0.22)',
                        color: '#E2E8F0',
                      }}
                    >
                      {opp.kind === 'district' ? (
                        <IconMapPin size={12} color="#38BDF8" />
                      ) : opp.kind === 'contact' ? (
                        <IconBell size={12} color="#4ADE80" />
                      ) : (
                        <IconWrench size={12} color="#F59E0B" />
                      )}
                      <span>{opp.text}</span>
                    </span>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </ModalPanel>
  );
}
