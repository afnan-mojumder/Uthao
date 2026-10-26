import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConductManager,
  CrimeEncounterSystem,
  PoliceEncounterSystem,
  AccidentManager,
} from '../../../src/sim/darkChoices';

describe('Dark Choices, Crime & Police Corruption System', () => {
  let conduct: ConductManager;
  let crime: CrimeEncounterSystem;
  let police: PoliceEncounterSystem;
  let accidents: AccidentManager;

  beforeEach(() => {
    conduct = new ConductManager({ cashOnHand: 1000, riderIntegrity: 80 });
    crime = new CrimeEncounterSystem();
    police = new PoliceEncounterSystem();
    accidents = new AccidentManager();
  });

  describe('ConductManager & Dark Actions', () => {
    it('executes off-app ride, keeping extra cash with minor integrity cost', () => {
      const res = conduct.executeDarkAction('off_app_ride', 1, 720, 'p_nabila', 80);
      expect(res.success).toBe(true);
      expect(res.cashDelta).toBe(80);
      expect(conduct.getConduct().cashOnHand).toBe(1080);
      expect(conduct.getConduct().riderIntegrity).toBe(74); // 80 - 6
      expect(conduct.getConduct().incidentHistory.length).toBe(1);
    });

    it('keeping lost property awards cash but severely lowers integrity and platform standing', () => {
      conduct.executeDarkAction('keep_lost_property', 1, 800, 'p_nabila', 500);
      const c = conduct.getConduct();
      expect(c.cashOnHand).toBe(1500);
      expect(c.riderIntegrity).toBeLessThan(60);
      expect(c.platformStanding).toBeLessThan(75);
      expect(c.passengerTrust.p_nabila).toBeLessThan(50);
    });

    it('abandoning a passenger in danger drops trust and integrity heavily', () => {
      conduct.executeDarkAction('abandon_passenger_in_danger', 2, 900, 'p_nabila');
      const c = conduct.getConduct();
      expect(c.riderIntegrity).toBe(40); // 80 - 40
      expect(c.passengerTrust.p_nabila).toBe(0); // drops by 80
      expect(c.publicReputation).toBeLessThan(50);
    });
  });

  describe('CrimeEncounterSystem', () => {
    it('returns null during safe daylight hours', () => {
      const env = {
        segmentId: 'seg_1',
        districtId: 'mirpara',
        isNarrowAlley: true,
        lightingLevel: 'bright' as const,
        pedestrianActivity: 'moderate' as const,
        policePresence: false,
        isolated: false,
      };
      const enc = crime.checkForEncounter(env, 14, 'p_nabila'); // 2 PM
      expect(enc).toBeNull();
    });

    it('triggers danger encounter in pitch-black isolated alleys at night with fair warning signals', () => {
      const env = {
        segmentId: 'seg_dark_alley',
        districtId: 'puranpara',
        isNarrowAlley: true,
        lightingLevel: 'pitch_black' as const,
        pedestrianActivity: 'deserted' as const,
        policePresence: false,
        isolated: true,
      };
      const enc = crime.checkForEncounter(env, 23, 'p_nabila'); // 11 PM
      expect(enc).not.toBeNull();
      expect(enc?.riskLevel).toBe('critical');
      expect(enc?.warningSignals.length).toBeGreaterThan(0);
      expect(enc?.availableResponses.length).toBeGreaterThanOrEqual(4);
    });

    it('resolves protective escape with increased passenger trust', () => {
      const env = {
        segmentId: 'seg_2',
        districtId: 'mirpara',
        isNarrowAlley: true,
        lightingLevel: 'pitch_black' as const,
        pedestrianActivity: 'deserted' as const,
        policePresence: false,
        isolated: false,
      };
      const enc = crime.checkForEncounter(env, 22, 'p_nabila')!;
      const res = crime.resolveEncounter(enc.encounterId, 'stop_and_reroute', conduct, 1, 950);
      expect(res.success).toBe(true);
      expect(res.passengerRescued).toBe(true);
      expect(conduct.getConduct().passengerTrust.p_nabila).toBeGreaterThan(75);
    });
  });

  describe('PoliceEncounterSystem & Bribery', () => {
    it('pays official government fine cleanly', () => {
      const pCase = police.createCase('red_light', 'moderate', 2, 'honest');
      expect(pCase.officialFine).toBe(1000);

      const res = police.payOfficialFine(pCase.caseId, conduct, 1, 600);
      expect(res.success).toBe(true);
      expect(conduct.getConduct().cashOnHand).toBe(0); // 1000 - 1000
      expect(conduct.getConduct().riderIntegrity).toBe(85);
    });

    it('handles bribe attempts probabilistically', () => {
      const pCase = police.createCase('wrong_way', 'moderate', 0, 'corrupt');
      const res = police.attemptBribe(pCase.caseId, 500, conduct, 1, 620);
      expect(['accepted', 'rejected', 'escalated']).toContain(res.outcome);
      if (res.outcome === 'accepted') {
        expect(conduct.getConduct().corruptionReputation).toBeGreaterThan(0);
      }
    });

    it('contest dismisses minor allegation when evidence is light', () => {
      const pCase = police.createCase('speeding_congestion', 'minor', 0, 'balanced');
      pCase.evidenceStrength = 0.3; // weak evidence
      const res = police.contestCase(pCase.caseId, conduct);
      expect(res.dismissed).toBe(true);
    });

    it('fleeing checkpoint increases police attention and drops integrity', () => {
      const pCase = police.createCase('collision', 'severe', 3, 'honest');
      const res = police.fleeCheckpoint(pCase.caseId, conduct, 2, 700);
      expect(res.escaped).toBe(true);
      expect(conduct.getConduct().policeAttention).toBeGreaterThan(40);
      expect(conduct.getConduct().riderIntegrity).toBeLessThan(60);
    });
  });

  describe('AccidentManager', () => {
    it('reports collision and tracks damages and injuries', () => {
      const acc = accidents.reportCollision('moderate', 'rider_fault', true);
      expect(acc.severity).toBe('moderate');
      expect(acc.passengerInjuryState).toBe('bruised');
      expect(acc.thirdPartyDamage).toBeGreaterThan(0);
    });

    it('checking on victims builds passenger trust despite medical expense', () => {
      const acc = accidents.reportCollision('minor', 'rider_fault', true);
      const res = accidents.respondToAccident(acc.accidentId, 'checked_victims', conduct, 1, 750, 'p_nabila');
      expect(res.totalCost).toBe(acc.medicalExpenses);
      expect(conduct.getConduct().passengerTrust.p_nabila).toBeGreaterThan(75);
    });

    it('hit-and-run evasion severely harms reputation and leaves evidence', () => {
      const acc = accidents.reportCollision('severe', 'rider_fault', true);
      accidents.respondToAccident(acc.accidentId, 'evaded_fled', conduct, 1, 780, 'p_nabila');
      expect(conduct.getConduct().riderIntegrity).toBeLessThan(40);
      expect(conduct.getConduct().publicReputation).toBeLessThan(40);
      expect(conduct.getConduct().evidenceExposure).toBeGreaterThan(50);
    });
  });
});
