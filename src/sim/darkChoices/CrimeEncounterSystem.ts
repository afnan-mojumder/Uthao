import type {
  CrimeEncounter,
  CrimeEncounterType,
  EncounterResponseOption,
  EncounterResolution,
  EncounterRiskLevel,
} from './types';
import { ConductManager } from './ConductManager';

export interface RoadSegmentEnvironment {
  segmentId: string;
  districtId: string;
  isNarrowAlley: boolean;
  lightingLevel: 'bright' | 'dim' | 'pitch_black';
  pedestrianActivity: 'high' | 'moderate' | 'deserted';
  policePresence: boolean;
  isolated: boolean;
}

export class CrimeEncounterSystem {
  private activeEncounters = new Map<string, CrimeEncounter>();
  private seqId = 0;

  /**
   * Checks whether a road segment triggers a dynamic crime / danger event.
   * Fair design: Only isolated, pitch-black or deserted alleys at night have a risk chance.
   */
  public checkForEncounter(
    env: RoadSegmentEnvironment,
    hour: number,
    passengerId?: string
  ): CrimeEncounter | null {
    // Daytime (06:00 to 19:00) has near-zero robbery risk
    const isNight = hour >= 20 || hour <= 4;
    if (!isNight && env.lightingLevel !== 'pitch_black') {
      return null;
    }

    if (env.policePresence || env.pedestrianActivity === 'high') {
      return null; // Safe well-trafficked zone
    }

    // Evaluate risk level
    let riskLevel: EncounterRiskLevel = 'low';
    if (env.lightingLevel === 'pitch_black' && env.isNarrowAlley) {
      riskLevel = env.isolated ? 'critical' : 'high';
    } else if (env.pedestrianActivity === 'deserted') {
      riskLevel = 'moderate';
    }

    // Contextual warning signals visible to the rider
    const warnings: string[] = [];
    if (env.lightingLevel === 'pitch_black') warnings.push('রাস্তার সব বাতি নিভানো (Streetlights out)');
    if (env.isNarrowAlley) warnings.push('অত্যন্ত সরু গলি — ইউ-টার্ন নেওয়া কঠিন (Narrow dead-end alley)');
    if (env.pedestrianActivity === 'deserted') warnings.push('আশপাশে কোনো মানুষ নেই (Deserted zone)');
    warnings.push('সামনে অন্ধকারের ভেতর কয়েকজন লোক দাঁড়িয়ে আছে');

    const encounterType: CrimeEncounterType = env.isolated
      ? 'alley_ambush'
      : env.isNarrowAlley
      ? 'road_block'
      : 'pickup_robbery';

    const options: EncounterResponseOption[] = [
      {
        id: 'stop_and_reroute',
        labelKey: 'ঘুরে নিরাপদ রাস্তা দিয়ে যান (Reroute via lit road)',
        descriptionKey: 'আগে থেকেই সাবধান হয়ে বিকল্প রাস্তায় চলে যান',
        dangerLevel: 'low',
        moralCategory: 'protective',
      },
      {
        id: 'warn_and_accelerate',
        labelKey: 'যাত্রীকে শক্ত করে ধরতে বলে ফুল থ্রটল দিন (Escape full throttle)',
        descriptionKey: 'দ্রুত গতিতে ছিনতাইকারীদের পাশ কাটিয়ে পালিয়ে যান',
        dangerLevel: 'moderate',
        moralCategory: 'protective',
      },
      {
        id: 'call_local_help',
        labelKey: 'হর্ন বাজিয়ে আশপাশের দোকানদারদের ডাকুন (Call for help)',
        descriptionKey: 'চিৎকার করে স্থানীয়দের দৃষ্টি আকর্ষণ করুন',
        dangerLevel: 'moderate',
        moralCategory: 'neutral',
      },
      {
        id: 'abandon_passenger',
        labelKey: 'যাত্রীকে নামিয়ে একা পালিয়ে বাঁচুন (Abandon passenger)',
        descriptionKey: 'নিজের বাইক ও নগদ টাকা বাঁচাতে যাত্রীকে ফেলে যান',
        dangerLevel: 'low',
        moralCategory: 'selfish',
      },
      {
        id: 'cooperate_criminals',
        labelKey: 'ছিনতাইকারীদের সাথে চুক্তি করুন (Share the loot)',
        descriptionKey: 'যাত্রীর ব্যাগ ওদের হাতে তুলে দিয়ে নিজের ভাগ নিন',
        dangerLevel: 'critical',
        moralCategory: 'corrupt',
      },
    ];

    const encounter: CrimeEncounter = {
      encounterId: `encounter_${Date.now()}_${++this.seqId}`,
      roadSegmentId: env.segmentId,
      districtId: env.districtId,
      encounterType,
      riskLevel,
      warningSignals: warnings,
      passengerId,
      availableResponses: options,
    };

    this.activeEncounters.set(encounter.encounterId, encounter);
    return encounter;
  }

  public getEncounter(id: string): CrimeEncounter | undefined {
    return this.activeEncounters.get(id);
  }

  /**
   * Resolves a crime encounter with consequences and updates ConductManager.
   */
  public resolveEncounter(
    encounterId: string,
    responseId: string,
    conduct: ConductManager,
    day: number,
    minute: number
  ): EncounterResolution {
    const enc = this.activeEncounters.get(encounterId);
    let resolution: EncounterResolution;

    switch (responseId) {
      case 'stop_and_reroute': {
        // Safe, smart defensive driving
        resolution = {
          success: true,
          passengerRescued: true,
          riderInjured: false,
          cashLost: 0,
          bikeDamagePct: 0,
          trustDelta: 15,
          integrityDelta: 5,
          criminalExposureDelta: 0,
          summaryText: 'সতর্কতার সাথে বিকল্প রাস্তায় গিয়ে বিপদ এড়িয়েছেন। যাত্রী আপনার প্রতি কৃতজ্ঞ।',
        };
        break;
      }

      case 'warn_and_accelerate': {
        // High speed escape: successful, minor scrape
        resolution = {
          success: true,
          passengerRescued: true,
          riderInjured: false,
          cashLost: 0,
          bikeDamagePct: 5,
          trustDelta: 25,
          integrityDelta: 10,
          criminalExposureDelta: 5,
          summaryText: 'সাহসিকতার সাথে গতি বাড়িয়ে ছিনতাইকারীদের ফাঁকি দিয়ে যাত্রীকে নিরাপদে বের করে এনেছেন!',
        };
        break;
      }

      case 'call_local_help': {
        resolution = {
          success: true,
          passengerRescued: true,
          riderInjured: false,
          cashLost: 0,
          bikeDamagePct: 0,
          trustDelta: 18,
          integrityDelta: 8,
          criminalExposureDelta: 0,
          summaryText: 'হর্ন ও চিৎকারে স্থানীয়রা এগিয়ে আসায় ছিনতাইকারীরা পালিয়ে গেছে।',
        };
        break;
      }

      case 'abandon_passenger': {
        conduct.executeDarkAction('abandon_passenger_in_danger', day, minute, enc?.passengerId);
        resolution = {
          success: false,
          passengerRescued: false,
          riderInjured: false,
          cashLost: 0,
          bikeDamagePct: 0,
          trustDelta: -80,
          integrityDelta: -40,
          criminalExposureDelta: 0,
          summaryText: 'আপনি একা পালিয়ে গেছেন। যাত্রীর টাকা ও মোবাইল ছিনতাই হয়েছে। যাত্রী তীব্র ক্ষোভ প্রকাশ করেছে।',
        };
        break;
      }

      case 'cooperate_criminals': {
        conduct.executeDarkAction('cooperate_with_criminals', day, minute, enc?.passengerId, 400);
        resolution = {
          success: true,
          passengerRescued: false,
          riderInjured: false,
          cashLost: -400, // gained cash
          bikeDamagePct: 0,
          trustDelta: -100,
          integrityDelta: -45,
          criminalExposureDelta: 40,
          summaryText: 'ছিনতাইকারীদের সাথে সমঝোতা করে টাকা ভাগ নিয়েছেন। অন্ধকার জগতে আপনার পরিচয় তৈরি হচ্ছে।',
        };
        break;
      }

      default: {
        resolution = {
          success: true,
          passengerRescued: true,
          riderInjured: false,
          cashLost: 0,
          bikeDamagePct: 0,
          trustDelta: 0,
          integrityDelta: 0,
          criminalExposureDelta: 0,
          summaryText: 'বিপদ কেটে গেছে।',
        };
      }
    }

    if (enc?.passengerId && responseId !== 'abandon_passenger' && responseId !== 'cooperate_criminals') {
      conduct.modifyPassengerTrust(enc.passengerId, resolution.trustDelta);
      conduct.modifyIntegrity(resolution.integrityDelta);
      conduct.modifyCriminalExposure(resolution.criminalExposureDelta);
    }

    if (enc) {
      enc.resolution = resolution;
      this.activeEncounters.delete(encounterId);
    }

    return resolution;
  }
}
