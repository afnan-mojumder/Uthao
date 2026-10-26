import type {
  AccidentRecord,
  AccidentSeverity,
  AccidentResponsibility,
  PassengerInjuryState,
  AccidentResponse,
} from './types';
import { ConductManager } from './ConductManager';
import { Rng } from '../../core/rng';

export class AccidentManager {
  private activeAccidents = new Map<string, AccidentRecord>();
  private seqId = 0;
  private rng: Rng;

  constructor(rng?: Rng) {
    this.rng = rng ?? new Rng(Date.now());
  }

  public reportCollision(
    severity: AccidentSeverity,
    responsibility: AccidentResponsibility,
    hasPassenger: boolean
  ): AccidentRecord {
    let thirdPartyDamage: number;
    let motorcycleDamage: number;
    let injury: PassengerInjuryState;

    if (severity === 'minor') {
      thirdPartyDamage = 300;
      motorcycleDamage = 10;
      injury = hasPassenger ? 'bruised' : 'none';
    } else if (severity === 'moderate') {
      thirdPartyDamage = 1200;
      motorcycleDamage = 25;
      injury = hasPassenger ? 'bruised' : 'none';
    } else {
      thirdPartyDamage = 3500;
      motorcycleDamage = 55;
      injury = hasPassenger ? 'hospitalized' : 'none';
    }

    const record: AccidentRecord = {
      accidentId: `accident_${Date.now()}_${++this.seqId}`,
      severity,
      responsibility,
      passengerInjuryState: injury,
      thirdPartyDamage,
      motorcycleDamage,
      witnessCount: this.rng.int(1, 4),
      medicalExpenses: injury === 'hospitalized' ? 800 : injury === 'bruised' ? 200 : 0,
      compensationPaid: 0,
    };

    this.activeAccidents.set(record.accidentId, record);
    return record;
  }

  public getAccident(id: string): AccidentRecord | undefined {
    return this.activeAccidents.get(id);
  }

  public respondToAccident(
    accidentId: string,
    response: AccidentResponse,
    conduct: ConductManager,
    day: number,
    minute: number,
    passengerId?: string
  ): { resolution: string; totalCost: number } {
    const acc = this.activeAccidents.get(accidentId);
    if (!acc) return { resolution: 'Accident not found', totalCost: 0 };

    acc.responseChosen = response;
    let cost = 0;
    let resolution: string;

    switch (response) {
      case 'checked_victims': {
        cost = acc.medicalExpenses;
        conduct.deductCash(cost);
        conduct.modifyIntegrity(15);
        if (passengerId) conduct.modifyPassengerTrust(passengerId, 25);
        resolution = 'দ্রুত বাইক থামিয়ে যাত্রী ও ক্ষতিগ্রস্তদের প্রাথমিক সাহায্য করেছেন। যাত্রীর আস্থা দৃঢ় হয়েছে।';
        break;
      }

      case 'emergency_services': {
        cost = acc.medicalExpenses + Math.floor(acc.thirdPartyDamage * 0.5);
        conduct.deductCash(cost);
        conduct.modifyIntegrity(20);
        conduct.modifyPublicReputation(10);
        resolution = 'জরুরি সেবায় খবর দিয়ে দায়িত্বশীল নাগরিকের পরিচয় দিয়েছেন। আইনি ঝামেলা নিয়মতান্ত্রিকভাবে সামলানো হয়েছে।';
        break;
      }

      case 'settled_cash': {
        cost = acc.thirdPartyDamage;
        conduct.deductCash(cost);
        conduct.modifyIntegrity(5);
        resolution = `ঘটনাস্থলেই ৳${cost} দিয়ে ক্ষতিগ্রস্ত ব্যক্তির সাথে বিরোধ মীমাংসা করা হয়েছে।`;
        break;
      }

      case 'evaded_fled': {
        cost = 0;
        conduct.modifyIntegrity(-50);
        conduct.modifyPoliceAttention(50);
        conduct.modifyPublicReputation(-35);
        conduct.modifyEvidenceExposure(70);
        if (passengerId) conduct.modifyPassengerTrust(passengerId, -80);
        resolution = 'দুর্ঘটনার পর না থেমে আপনি পালিয়ে গেছেন (Hit & Run)! প্রত্যক্ষদর্শীরা পুলিশের কাছে নালিশ দিয়েছে।';
        break;
      }

      default: {
        resolution = 'পরিস্থিতি স্বাভাবিক হয়েছে।';
      }
    }

    acc.compensationPaid = cost;
    acc.resolution = resolution;

    conduct.getConduct().incidentHistory.unshift({
      id: `acc_log_${Date.now()}`,
      day,
      timeMinute: minute,
      category: 'accident',
      summaryKey: `সড়ক দুর্ঘটনা (${acc.severity}): ${response}`,
      details: resolution,
      cashDelta: -cost,
      integrityDelta: response === 'evaded_fled' ? -50 : 15,
      evidenceLeft: response === 'evaded_fled',
    });

    this.activeAccidents.delete(accidentId);
    return { resolution, totalCost: cost };
  }
}
