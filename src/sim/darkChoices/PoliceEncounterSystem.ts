import type {
  PoliceCase,
  PoliceViolationType,
  ViolationSeverity,
  OfficerCorruptionProfile,
} from './types';
import { ConductManager } from './ConductManager';
import { Rng } from '../../core/rng';

export class PoliceEncounterSystem {
  private activeCases = new Map<string, PoliceCase>();
  private seqId = 0;
  private rng: Rng;

  constructor(rng?: Rng) {
    this.rng = rng ?? new Rng(Date.now());
  }

  public createCase(
    violationType: PoliceViolationType,
    severity: ViolationSeverity = 'moderate',
    witnessCount: number = 2,
    officerType: 'honest' | 'corrupt' | 'balanced' = 'balanced'
  ): PoliceCase {
    let officialFine = 1000;
    if (severity === 'minor') officialFine = 500;
    if (severity === 'severe') officialFine = 2500;

    let officerProfile: OfficerCorruptionProfile;
    if (officerType === 'honest') {
      officerProfile = {
        nameKey: 'এসআই মোর্শেদ (SI Morshed)',
        honesty: 0.9,
        corruptionTolerant: false,
        strictness: 0.85,
        takesBribeLikelihood: 0.05,
      };
    } else if (officerType === 'corrupt') {
      officerProfile = {
        nameKey: 'সার্জেন্ট রফিক (Sgt. Rafiq)',
        honesty: 0.25,
        corruptionTolerant: true,
        strictness: 0.5,
        takesBribeLikelihood: 0.85,
      };
    } else {
      officerProfile = {
        nameKey: 'ট্রাফিক সার্জেন্ট কামাল (Sgt. Kamal)',
        honesty: 0.6,
        corruptionTolerant: true,
        strictness: 0.7,
        takesBribeLikelihood: 0.45,
      };
    }

    const policeCase: PoliceCase = {
      caseId: `case_${Date.now()}_${++this.seqId}`,
      violationType,
      severity,
      evidenceStrength: 0.7,
      witnessCount,
      officialFine,
      officerProfile,
      bribeAttemptHistory: [],
      caseStatus: 'pending',
      legalExposure: severity === 'severe' ? 60 : 25,
    };

    this.activeCases.set(policeCase.caseId, policeCase);
    return policeCase;
  }

  public getCase(caseId: string): PoliceCase | undefined {
    return this.activeCases.get(caseId);
  }

  /**
   * Resolves Option A: Pay official government fine.
   */
  public payOfficialFine(
    caseId: string,
    conduct: ConductManager,
    day: number,
    minute: number
  ): { success: boolean; message: string } {
    const pc = this.activeCases.get(caseId);
    if (!pc) return { success: false, message: 'Case not found' };

    conduct.deductCash(pc.officialFine);
    conduct.modifyIntegrity(5); // Law-abiding resolution
    pc.caseStatus = 'fine_paid';

    conduct.getConduct().incidentHistory.unshift({
      id: `fine_${Date.now()}`,
      day,
      timeMinute: minute,
      category: 'police_stop',
      summaryKey: `সরকারি জরিমানা পরিশোধ: ৳${pc.officialFine}`,
      details: `Violation: ${pc.violationType}`,
      cashDelta: -pc.officialFine,
      integrityDelta: 5,
      evidenceLeft: false,
    });

    this.activeCases.delete(caseId);
    return {
      success: true,
      message: `সরকারি জরিমানা ৳${pc.officialFine} পরিশোধ করা হয়েছে। মামলা নিষ্পন্ন।`,
    };
  }

  /**
   * Resolves Option B: Attempt to offer an unofficial bribe.
   */
  public attemptBribe(
    caseId: string,
    offerAmount: number,
    conduct: ConductManager,
    day: number,
    minute: number
  ): {
    outcome: 'accepted' | 'rejected' | 'escalated';
    cashDeducted: number;
    message: string;
  } {
    const pc = this.activeCases.get(caseId);
    if (!pc) {
      return { outcome: 'rejected', cashDeducted: 0, message: 'Case not found' };
    }

    // Probability calculation
    // More witnesses, severe case, and honest officer lower chance
    const ratio = offerAmount / pc.officialFine;
    const baseChance = pc.officerProfile.takesBribeLikelihood * 100;
    const witnessPenalty = pc.witnessCount * 12;
    const severityPenalty = pc.severity === 'severe' ? 35 : 0;
    const offerBonus = Math.min(30, (ratio - 0.4) * 50);

    const acceptProbability = Math.max(5, Math.min(90, baseChance - witnessPenalty - severityPenalty + offerBonus));
    const roll = this.rng.next() * 100;

    if (roll <= acceptProbability) {
      // Bribe Accepted
      conduct.deductCash(offerAmount);
      conduct.modifyIntegrity(-15);
      conduct.modifyCorruptionReputation(15);
      pc.caseStatus = 'bribe_accepted';
      pc.bribeAttemptHistory.push({ offer: offerAmount, accepted: true, timestamp: Date.now() });

      conduct.getConduct().incidentHistory.unshift({
        id: `bribe_${Date.now()}`,
        day,
        timeMinute: minute,
        category: 'police_stop',
        summaryKey: `অনানুষ্ঠানিক রফা (ঘুষ প্রদান): ৳${offerAmount}`,
        details: `Police bribe accepted by ${pc.officerProfile.nameKey}`,
        cashDelta: -offerAmount,
        integrityDelta: -15,
        evidenceLeft: true,
      });

      this.activeCases.delete(caseId);
      return {
        outcome: 'accepted',
        cashDeducted: offerAmount,
        message: `সার্জেন্ট টাকাটা পকেটে নিয়ে বললেন: "যান, দেখে চালাবেন।" কেস খালাস।`,
      };
    } else if (roll > acceptProbability + 25 && pc.officerProfile.honesty > 0.7) {
      // Escalated: Officer is offended by bribe
      conduct.modifyIntegrity(-20);
      conduct.modifyPoliceAttention(30);
      pc.caseStatus = 'bribe_rejected';
      pc.officialFine += 1000; // Extra penalty for bribing law enforcement
      pc.bribeAttemptHistory.push({ offer: offerAmount, accepted: false, timestamp: Date.now() });

      return {
        outcome: 'escalated',
        cashDeducted: 0,
        message: `${pc.officerProfile.nameKey} গর্জে উঠলেন: "ঘুষ দেওয়ার চেষ্টা? লাইসেন্স দেন, আরও ১০০০ টাকা জরিমানা বাড়ল!"`,
      };
    } else {
      // Rejected: Just refused bribe, official fine remains
      conduct.modifyIntegrity(-10);
      pc.caseStatus = 'bribe_rejected';
      pc.bribeAttemptHistory.push({ offer: offerAmount, accepted: false, timestamp: Date.now() });

      return {
        outcome: 'rejected',
        cashDeducted: 0,
        message: `অফিসার টাকা ফিরিয়ে দিয়ে বললেন: "এসব ধান্দা বাদ দিন। অফিসিয়াল জরিমানা জমা দিন।"`,
      };
    }
  }

  /**
   * Resolves Option C: Contest allegation using reason.
   */
  public contestCase(
    caseId: string,
    conduct: ConductManager
  ): { dismissed: boolean; message: string } {
    const pc = this.activeCases.get(caseId);
    if (!pc) return { dismissed: false, message: 'Case not found' };

    // If evidence is weak or minor severity, successful contest
    if (pc.evidenceStrength < 0.5 || pc.severity === 'minor') {
      pc.caseStatus = 'dismissed';
      conduct.modifyIntegrity(5);
      this.activeCases.delete(caseId);
      return {
        dismissed: true,
        message: 'যুক্তিসঙ্গত ব্যাখ্যা শুনে অফিসার সন্তুষ্ট হলেন। কোনো জরিমানা ছাড়াই মামলা খারিজ হলো।',
      };
    }

    return {
      dismissed: false,
      message: 'প্রমাণ স্পষ্ট থাকায় অফিসার যুক্তি মানলেন না। সরকারি জরিমানা বহাল রইল।',
    };
  }

  /**
   * Resolves Option D: Accept a polite warning.
   */
  public acceptWarning(
    caseId: string,
    conduct: ConductManager
  ): { success: boolean; message: string } {
    const pc = this.activeCases.get(caseId);
    if (!pc || pc.severity !== 'minor') {
      return { success: false, message: 'গুরুতর অপরাধে কোনো সতর্কবার্তা প্রযোজ্য নয়।' };
    }

    pc.caseStatus = 'warning_issued';
    conduct.modifyIntegrity(5);
    conduct.modifyPoliceAttention(5);
    this.activeCases.delete(caseId);
    return {
      success: true,
      message: 'প্রথমবারের মতো অফিসার সতর্ক করে ছেড়ে দিলেন: "এরপর কিন্তু মামলা দেব!"',
    };
  }

  /**
   * Resolves Option E: High-risk flight / fleeing the checkpoint.
   */
  public fleeCheckpoint(
    caseId: string,
    conduct: ConductManager,
    day: number,
    minute: number
  ): { escaped: boolean; message: string } {
    const pc = this.activeCases.get(caseId);
    if (!pc) return { escaped: false, message: 'Case not found' };

    conduct.modifyIntegrity(-30);
    conduct.modifyPoliceAttention(45);
    pc.caseStatus = 'fled';

    conduct.getConduct().incidentHistory.unshift({
      id: `flee_${Date.now()}`,
      day,
      timeMinute: minute,
      category: 'police_stop',
      summaryKey: 'চেকপোস্ট ফাঁকি দিয়ে দ্রুত পালিয়ে যাওয়া হয়েছে',
      details: `Fled police check for ${pc.violationType}`,
      cashDelta: 0,
      integrityDelta: -30,
      evidenceLeft: true,
    });

    this.activeCases.delete(caseId);
    return {
      escaped: true,
      message: 'দ্রুত গতিতে ট্রাফিক চেকপোস্ট ফাঁকি দিয়ে পালিয়েছেন! পুলিশের খাতায় আপনার নম্বর টুকে রাখা হয়েছে।',
    };
  }
}
