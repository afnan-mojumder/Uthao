import type { JSX } from 'preact';
import defaultUpgrades from '../../../data/upgrades.json';
import {
  type RepairItem,
  type UpgradeDef,
  calculateRepairCost,
  calculateUpgradeCost,
} from '../../sim/economy/maintenance';
import { t } from '../i18n';
import type { BikeId } from '../../core/types';
import {
  BIKES,
  calculateTradeInValue,
  calculateNetBikePurchaseCost,
  getBikeDef,
} from '../../sim/economy/bikes';
import { onBuyBikeCallback, onSwitchBikeCallback } from '../store';
import { garageTabSignal } from '../store';

export interface GarageProps {
  isOpen: boolean;
  atKamalBhai?: boolean;
  kamalRelationship?: number;
  cash?: number;
  engineCondition?: number;
  tiresCondition?: number;
  brakesCondition?: number;
  kmSinceOilChange?: number;
  ownedUpgrades?: string[];
  installedCosmetics?: { paint?: string; seatCover?: string };
  currentBikeId?: BikeId;
  ownedBikes?: BikeId[];
  savings?: number;
  activeTab?: 'repairs' | 'upgrades' | 'cosmetics' | 'bikes';
  onSelectTab?: (tab: 'repairs' | 'upgrades' | 'cosmetics' | 'bikes') => void;
  onRepair?: (item: RepairItem) => void;
  onBuyUpgrade?: (upgradeId: string) => void;
  onBuyBike?: (bikeId: string, useTradeIn?: boolean) => void;
  onSwitchBike?: (bikeId: string) => void;
  onClose?: () => void;
}

export function Garage({
  isOpen,
  atKamalBhai = true,
  kamalRelationship = 0,
  cash = 600,
  engineCondition = 85,
  tiresCondition = 80,
  brakesCondition = 85,
  kmSinceOilChange = 15,
  ownedUpgrades = [],
  currentBikeId = 'old100',
  ownedBikes = ['old100'],
  savings = 0,
  activeTab: propActiveTab,
  onSelectTab,
  onRepair,
  onBuyUpgrade,
  onBuyBike: propBuyBike,
  onSwitchBike: propSwitchBike,
  onClose,
}: GarageProps): JSX.Element | null {
  if (!isOpen) return null;

  const activeTab: 'repairs' | 'upgrades' | 'cosmetics' | 'bikes' = propActiveTab ?? garageTabSignal.value;
  const setActiveTab = (tab: 'repairs' | 'upgrades' | 'cosmetics' | 'bikes') => {
    garageTabSignal.value = tab;
    onSelectTab?.(tab);
  };
  const hasKamalDiscount = atKamalBhai && kamalRelationship >= 20;
  const onBuyBike = propBuyBike ?? onBuyBikeCallback ?? undefined;
  const onSwitchBike = propSwitchBike ?? onSwitchBikeCallback ?? undefined;
  const upgrades = defaultUpgrades as UpgradeDef[];
  const mechanicalUpgrades = upgrades.filter((u) => u.category === 'mechanical');
  const cosmeticUpgrades = upgrades.filter((u) => u.category === 'cosmetic');

  const oilFreshness = Math.max(0, Math.round(100 - (kmSinceOilChange / 60) * 100));

  const getConditionColor = (val: number) => {
    if (val >= 75) return '#10b981'; // Green
    if (val >= 40) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  };

  return (
    <div
      data-testid="garage-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9996,
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: "'Hind Siliguri', 'Segoe UI', system-ui, sans-serif",
        color: '#f8fafc',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(56, 189, 248, 0.12)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <div>
            <h2
              data-testid="garage-title"
              style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8' }}
            >
              🛠️ {t('garage.title')}
            </h2>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
              {t('garage.subtitle')}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {hasKamalDiscount && (
              <span
                data-testid="garage-discount-badge"
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  color: '#34d399',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                ★ {t('garage.kamal_discount_badge')}
              </span>
            )}
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                padding: '6px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '0.9rem',
                fontWeight: 700,
              }}
            >
              <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Cash: </span>
              <span data-testid="garage-cash" style={{ color: '#34d399' }}>৳{cash}</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.3)',
          }}
        >
          <button
            data-testid="garage-tab-repairs"
            onClick={() => setActiveTab('repairs')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'repairs' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderBottom: activeTab === 'repairs' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'repairs' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            🔧 {t('garage.tab_repairs')}
          </button>
          <button
            data-testid="garage-tab-upgrades"
            onClick={() => setActiveTab('upgrades')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'upgrades' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderBottom: activeTab === 'upgrades' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'upgrades' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            ⚡ {t('garage.tab_upgrades')}
          </button>
          <button
            data-testid="garage-tab-cosmetics"
            onClick={() => setActiveTab('cosmetics')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'cosmetics' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderBottom: activeTab === 'cosmetics' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'cosmetics' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            🎨 {t('garage.tab_cosmetics')}
          </button>
          <button
            data-testid="garage-tab-bikes"
            onClick={() => setActiveTab('bikes')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'bikes' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderBottom: activeTab === 'bikes' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'bikes' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            🛵 {t('garage.tab_bikes')}
          </button>
        </div>

        {/* Tab Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Tab 1: Repairs */}
          {activeTab === 'repairs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Condition Bars */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  background: 'rgba(15, 23, 42, 0.4)',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                {/* Engine */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                    <span>⚙️ {t('garage.condition_engine')}</span>
                    <span data-testid="garage-condition-engine" style={{ color: getConditionColor(engineCondition) }}>
                      {engineCondition}%
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${engineCondition}%`, background: getConditionColor(engineCondition) }} />
                  </div>
                  <button
                    data-testid="garage-repair-engine-btn"
                    disabled={engineCondition >= 100 || cash < calculateRepairCost('engine', atKamalBhai, kamalRelationship)}
                    onClick={() => onRepair?.('engine')}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '6px',
                      borderRadius: '8px',
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t('garage.repair_btn')} (৳{calculateRepairCost('engine', atKamalBhai, kamalRelationship)})
                  </button>
                </div>

                {/* Tires */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                    <span>🛞 {t('garage.condition_tires')}</span>
                    <span data-testid="garage-condition-tires" style={{ color: getConditionColor(tiresCondition) }}>
                      {tiresCondition}%
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${tiresCondition}%`, background: getConditionColor(tiresCondition) }} />
                  </div>
                  <button
                    data-testid="garage-repair-tires-btn"
                    disabled={tiresCondition >= 100 || cash < calculateRepairCost('tires', atKamalBhai, kamalRelationship)}
                    onClick={() => onRepair?.('tires')}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '6px',
                      borderRadius: '8px',
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t('garage.repair_btn')} (৳{calculateRepairCost('tires', atKamalBhai, kamalRelationship)})
                  </button>
                </div>

                {/* Brakes */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                    <span>🛑 {t('garage.condition_brakes')}</span>
                    <span data-testid="garage-condition-brakes" style={{ color: getConditionColor(brakesCondition) }}>
                      {brakesCondition}%
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${brakesCondition}%`, background: getConditionColor(brakesCondition) }} />
                  </div>
                  <button
                    data-testid="garage-repair-brakes-btn"
                    disabled={brakesCondition >= 100 || cash < calculateRepairCost('brakes', atKamalBhai, kamalRelationship)}
                    onClick={() => onRepair?.('brakes')}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '6px',
                      borderRadius: '8px',
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t('garage.repair_btn')} (৳{calculateRepairCost('brakes', atKamalBhai, kamalRelationship)})
                  </button>
                </div>

                {/* Oil */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                    <span>🛢️ {t('garage.condition_oil')}</span>
                    <span data-testid="garage-condition-oil" style={{ color: getConditionColor(oilFreshness) }}>
                      {oilFreshness}%
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${oilFreshness}%`, background: getConditionColor(oilFreshness) }} />
                  </div>
                  <button
                    data-testid="garage-repair-oil-btn"
                    disabled={oilFreshness >= 100 || cash < calculateRepairCost('oil', atKamalBhai, kamalRelationship)}
                    onClick={() => onRepair?.('oil')}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '6px',
                      borderRadius: '8px',
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t('garage.repair_btn')} (৳{calculateRepairCost('oil', atKamalBhai, kamalRelationship)})
                  </button>
                </div>
              </div>

              {/* Full Service Overhaul Button */}
              <button
                data-testid="garage-repair-all-btn"
                disabled={cash < calculateRepairCost('full', atKamalBhai, kamalRelationship)}
                onClick={() => onRepair?.('full')}
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                ✨ {t('garage.repair_all')} (৳{calculateRepairCost('full', atKamalBhai, kamalRelationship)})
              </button>
            </div>
          )}

          {/* Tab 2: Mechanical Upgrades */}
          {activeTab === 'upgrades' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {mechanicalUpgrades.map((upg) => {
                const isOwned = ownedUpgrades.includes(upg.id);
                const cost = calculateUpgradeCost(upg.cost, atKamalBhai, kamalRelationship);
                const canAfford = cash >= cost;

                return (
                  <div
                    key={upg.id}
                    data-testid={`upgrade-card-${upg.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: isOwned ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.4)',
                      border: isOwned ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '14px',
                      gap: '12px',
                    }}
                  >
                    <div style={{ fontSize: '1.6rem', minWidth: '36px', textAlign: 'center' }}>
                      {upg.icon ?? '⚙️'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>
                        {t(upg.nameKey)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                        {t(upg.descKey)}
                      </div>
                    </div>
                    <div>
                      {isOwned ? (
                        <span
                          style={{
                            padding: '6px 12px',
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: '#34d399',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                          }}
                        >
                          ✓ {t('garage.installed')}
                        </span>
                      ) : (
                        <button
                          data-testid={`upgrade-buy-${upg.id}`}
                          disabled={!canAfford}
                          onClick={() => onBuyUpgrade?.(upg.id)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: canAfford ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'rgba(100, 116, 139, 0.3)',
                            border: 'none',
                            color: canAfford ? '#ffffff' : '#64748b',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: canAfford ? 'pointer' : 'not-allowed',
                            boxShadow: canAfford ? '0 2px 8px rgba(2, 132, 199, 0.3)' : 'none',
                          }}
                        >
                          {t('garage.btn_buy')} ৳{cost}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 3: Cosmetics */}
          {activeTab === 'cosmetics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cosmeticUpgrades.map((cosm) => {
                const isOwned = ownedUpgrades.includes(cosm.id);
                const cost = calculateUpgradeCost(cosm.cost, atKamalBhai, kamalRelationship);
                const canAfford = cash >= cost;

                return (
                  <div
                    key={cosm.id}
                    data-testid={`cosmetic-card-${cosm.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: isOwned ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.4)',
                      border: isOwned ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '14px',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {cosm.color ? (
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: cosm.color,
                            border: '2px solid rgba(255, 255, 255, 0.4)',
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: '1.4rem' }}>{cosm.icon ?? '🎨'}</span>
                      )}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>
                          {t(cosm.nameKey)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                          {t(cosm.descKey)}
                        </div>
                      </div>
                    </div>
                    <div>
                      {isOwned ? (
                        <span
                          style={{
                            padding: '6px 12px',
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: '#34d399',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                          }}
                        >
                          ✓ {t('garage.installed')}
                        </span>
                      ) : (
                        <button
                          data-testid={`cosmetic-buy-${cosm.id}`}
                          disabled={!canAfford}
                          onClick={() => onBuyUpgrade?.(cosm.id)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: canAfford ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'rgba(100, 116, 139, 0.3)',
                            border: 'none',
                            color: canAfford ? '#ffffff' : '#64748b',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: canAfford ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {t('garage.btn_buy')} ৳{cost}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>


          {/* Tab 4: Bikes Dealership */}
          {activeTab === 'bikes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {BIKES.map((bike) => {
                const isCurrent = bike.id === currentBikeId;
                const isOwned = ownedBikes.includes(bike.id);
                const currentDef = getBikeDef(currentBikeId);
                const overallCond = Math.round(
                  (engineCondition + tiresCondition + brakesCondition + oilFreshness) / 4
                );
                const tradeInVal = calculateTradeInValue(currentDef, overallCond);
                const netCost = calculateNetBikePurchaseCost(
                  bike,
                  currentDef,
                  overallCond,
                  hasKamalDiscount
                );
                const canAfford = cash + savings >= netCost;

                return (
                  <div
                    key={bike.id}
                    data-testid={`bike-card-${bike.id}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      background: isCurrent ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: isCurrent ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '14px 18px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.4rem' }}>
                          {bike.id === 'new150' ? '🏍️' : '🛵'}
                        </span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f8fafc' }}>
                            {t(bike.nameKey)}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                            {t(bike.descKey)}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                        }}
                      >
                        {bike.displacementCc}cc
                      </div>
                    </div>

                    {/* Stats Specs */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px',
                        fontSize: '0.75rem',
                        background: 'rgba(15, 23, 42, 0.4)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                      }}
                    >
                      <div>
                        <span style={{ color: '#94a3b8' }}>Top Speed: </span>
                        <span style={{ color: '#f8fafc', fontWeight: 700 }}>
                          {Math.round(bike.vmax * 3.6)} km/h
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Mileage: </span>
                        <span style={{ color: '#34d399', fontWeight: 700 }}>
                          {bike.efficiencyKmPerL} km/L
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Insurance: </span>
                        <span style={{ color: bike.dailyInsuranceCost > 0 ? '#f59e0b' : '#34d399', fontWeight: 700 }}>
                          {bike.dailyInsuranceCost > 0 ? `৳${bike.dailyInsuranceCost}/day` : 'None'}
                        </span>
                      </div>
                    </div>

                    {/* Trade-in & Action */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                      <div>
                        {isCurrent ? (
                          <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.85rem' }}>
                            ★ {t('garage.current_bike')}
                          </span>
                        ) : isOwned ? (
                          <span style={{ color: '#34d399', fontWeight: 700, fontSize: '0.85rem' }}>
                            ✓ In Your Garage
                          </span>
                        ) : (
                          <div style={{ fontSize: '0.8rem' }}>
                            <span style={{ color: '#94a3b8' }}>
                              {t('garage.trade_in_value', { amount: tradeInVal })} •{' '}
                            </span>
                            <span style={{ color: '#34d399', fontWeight: 800 }}>
                              {t('garage.net_cost', { amount: netCost })}
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        {isCurrent ? (
                          <span
                            style={{
                              padding: '6px 14px',
                              background: 'rgba(56, 189, 248, 0.2)',
                              color: '#38bdf8',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                            }}
                          >
                            Active
                          </span>
                        ) : isOwned ? (
                          <button
                            data-testid={`bike-switch-${bike.id}`}
                            onClick={() => onSwitchBike?.(bike.id)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              border: 'none',
                              color: '#ffffff',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                            }}
                          >
                            {t('garage.btn_switch')}
                          </button>
                        ) : (
                          <button
                            data-testid={`bike-buy-${bike.id}`}
                            disabled={!canAfford}
                            onClick={() => onBuyBike?.(bike.id, true)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '8px',
                              background: canAfford
                                ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                                : 'rgba(100, 116, 139, 0.3)',
                              border: 'none',
                              color: canAfford ? '#ffffff' : '#64748b',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              cursor: canAfford ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {t('garage.btn_trade_in')} (৳{netCost})
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        {/* Footer with Exit button */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <button
            data-testid="garage-exit-btn"
            onClick={onClose}
            style={{
              padding: '10px 24px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#f8fafc',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            ← {t('garage.exit')}
          </button>
        </div>
      </div>
    </div>
  );
}
