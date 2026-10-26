import type {
  PlayerConduct,
  DarkActionType,
  IncidentLog,
} from './types';

export class ConductManager {
  private conduct: PlayerConduct;
  private seqId = 0;

  constructor(initialConduct?: Partial<PlayerConduct>) {
    this.conduct = {
      riderIntegrity: initialConduct?.riderIntegrity ?? 80,
      passengerTrust: initialConduct?.passengerTrust ?? {
        p_nabila: 75,
        p_tanvir: 70,
        p_mrs_ferdousi: 80,
        p_rahim_chacha: 65,
        p_jamil: 50,
      },
      publicReputation: initialConduct?.publicReputation ?? 70,
      platformStanding: initialConduct?.platformStanding ?? 92,
      criminalExposure: initialConduct?.criminalExposure ?? 0,
      policeAttention: initialConduct?.policeAttention ?? 5,
      corruptionReputation: initialConduct?.corruptionReputation ?? 0,
      evidenceExposure: initialConduct?.evidenceExposure ?? 0,
      cashOnHand: initialConduct?.cashOnHand ?? 500,
      incidentHistory: initialConduct?.incidentHistory ?? [],
    };
  }

  public getConduct(): PlayerConduct {
    return {
      ...this.conduct,
      passengerTrust: { ...this.conduct.passengerTrust },
      incidentHistory: [...this.conduct.incidentHistory],
    };
  }

  public addCash(amount: number): void {
    this.conduct.cashOnHand = Math.max(0, this.conduct.cashOnHand + amount);
  }

  public deductCash(amount: number): boolean {
    if (this.conduct.cashOnHand >= amount) {
      this.conduct.cashOnHand -= amount;
      return true;
    }
    this.conduct.cashOnHand = Math.max(0, this.conduct.cashOnHand - amount);
    return false;
  }

  public modifyIntegrity(delta: number): void {
    this.conduct.riderIntegrity = Math.max(0, Math.min(100, this.conduct.riderIntegrity + delta));
  }

  public modifyPassengerTrust(passengerId: string, delta: number): void {
    const current = this.conduct.passengerTrust[passengerId] ?? 60;
    this.conduct.passengerTrust[passengerId] = Math.max(0, Math.min(100, current + delta));
  }

  public modifyPoliceAttention(delta: number): void {
    this.conduct.policeAttention = Math.max(0, Math.min(100, this.conduct.policeAttention + delta));
  }

  public modifyCriminalExposure(delta: number): void {
    this.conduct.criminalExposure = Math.max(0, Math.min(100, this.conduct.criminalExposure + delta));
  }

  public modifyPlatformStanding(delta: number): void {
    this.conduct.platformStanding = Math.max(0, Math.min(100, this.conduct.platformStanding + delta));
  }

  public modifyCorruptionReputation(delta: number): void {
    this.conduct.corruptionReputation = Math.max(0, Math.min(100, this.conduct.corruptionReputation + delta));
  }

  public modifyPublicReputation(delta: number): void {
    this.conduct.publicReputation = Math.max(0, Math.min(100, this.conduct.publicReputation + delta));
  }

  public modifyEvidenceExposure(delta: number): void {
    this.conduct.evidenceExposure = Math.max(0, Math.min(100, this.conduct.evidenceExposure + delta));
  }

  /**
   * Executes a dark / morally questionable rider action.
   */
  public executeDarkAction(
    type: DarkActionType,
    day: number,
    minute: number,
    passengerId?: string,
    extraAmount?: number
  ): {
    success: boolean;
    cashDelta: number;
    integrityDelta: number;
    evidenceRisk: number;
    summary: string;
  } {
    let cashDelta = 0;
    let integrityDelta = 0;
    let trustDelta = 0;
    let platformDelta = 0;
    let evidenceRisk = 0;
    let summary = '';

    switch (type) {
      case 'off_app_ride': {
        cashDelta = extraAmount ?? 60;
        integrityDelta = -6;
        platformDelta = -4;
        evidenceRisk = 25;
        summary = 'অ্যাপের বাইরে যাত্রী নেওয়া হয়েছে (Platform commission bypassed)';
        break;
      }

      case 'change_fare_after_pickup': {
        cashDelta = extraAmount ?? 50;
        integrityDelta = -15;
        trustDelta = -25;
        platformDelta = -10;
        evidenceRisk = 45;
        summary = 'গন্তব্যে ওঠার পর অতিরিক্ত ভাড়া দাবি করা হয়েছে';
        break;
      }

      case 'unnecessary_detour_demand': {
        cashDelta = extraAmount ?? 40;
        integrityDelta = -12;
        trustDelta = -18;
        evidenceRisk = 30;
        summary = 'অপ্রয়োজনীয় ঘুরতি পথের জন্য অতিরিক্ত ভাড়া নেওয়া হয়েছে';
        break;
      }

      case 'misrepresent_traffic': {
        cashDelta = extraAmount ?? 30;
        integrityDelta = -8;
        trustDelta = -10;
        evidenceRisk = 20;
        summary = 'জ্যামের মিথ্যা অজুহাত দিয়ে ভাড়া বাড়ানো হয়েছে';
        break;
      }

      case 'pressure_rushed_passenger': {
        cashDelta = extraAmount ?? 70;
        integrityDelta = -10;
        trustDelta = -15;
        evidenceRisk = 35;
        summary = 'জরুরি পরিস্থিতির সুযোগ নিয়ে যাত্রীর কাছ থেকে চড়া ভাড়া আদায়';
        break;
      }

      case 'suspicious_high_paying_trip': {
        cashDelta = extraAmount ?? 250;
        integrityDelta = -10;
        this.modifyCriminalExposure(20);
        this.modifyPoliceAttention(15);
        summary = 'সন্দেহজনক অন্ধকার গন্তব্যের ভাড়া গ্রহণ করা হয়েছে';
        break;
      }

      case 'exploit_unfamiliar_passenger': {
        cashDelta = extraAmount ?? 60;
        integrityDelta = -14;
        trustDelta = -20;
        evidenceRisk = 20;
        summary = 'অপরিচিত যাত্রীকে ভুল বুঝিয়ে অতিরিক্ত ভাড়া নেওয়া হয়েছে';
        break;
      }

      case 'keep_lost_property': {
        cashDelta = extraAmount ?? 300;
        integrityDelta = -25;
        trustDelta = -40;
        platformDelta = -25;
        evidenceRisk = 60;
        summary = 'যাত্রীর ফেলে যাওয়া ব্যাগ / মূল্যবান জিনিস রেখে দেওয়া হয়েছে';
        break;
      }

      case 'abandon_passenger_in_danger': {
        cashDelta = 0;
        integrityDelta = -40;
        trustDelta = -80;
        platformDelta = -30;
        this.modifyPublicReputation(-35);
        summary = 'বিপদে যাত্রীকে ফেলে একা পালিয়ে আসা হয়েছে';
        break;
      }

      case 'cooperate_with_criminals': {
        cashDelta = extraAmount ?? 500;
        integrityDelta = -45;
        trustDelta = -90;
        platformDelta = -40;
        this.modifyCriminalExposure(40);
        this.modifyPoliceAttention(30);
        summary = 'অন্ধকার গলির ছিনতাইকারীদের সাথে চুক্তি করা হয়েছে';
        break;
      }
    }

    // Apply outcomes
    this.addCash(cashDelta);
    this.modifyIntegrity(integrityDelta);
    if (passengerId) {
      this.modifyPassengerTrust(passengerId, trustDelta);
    }
    this.modifyPlatformStanding(platformDelta);
    this.modifyEvidenceExposure(evidenceRisk);

    const log: IncidentLog = {
      id: `incident_${Date.now()}_${++this.seqId}`,
      day,
      timeMinute: minute,
      category: 'dark_action',
      summaryKey: summary,
      details: `Cash: ${cashDelta >= 0 ? '+' : ''}${cashDelta} ৳, Integrity: ${integrityDelta}`,
      cashDelta,
      integrityDelta,
      evidenceLeft: evidenceRisk > 30,
    };
    this.conduct.incidentHistory.unshift(log);

    return {
      success: true,
      cashDelta,
      integrityDelta,
      evidenceRisk,
      summary,
    };
  }
}
