# Balance Metrics and Benchmark Reports

*Updated: 2026-10-26 — Headless Bot Simulation (T2.9)*

## 1. Outcome Variety (200 rides, SmartPro)

- **Sample Size:** 200 completed rides
- **Mean Net per Ride:** ৳59.23
- **Standard Deviation:** ৳17.42 (**29.4%** of mean, target > 15%)
- **ReasonCodes Observed (5 distinct):**
  - `FAIR_PRICE`: 211 occurrences
  - `TOO_EXPENSIVE`: 51 occurrences
  - `URGENT`: 120 occurrences
  - `TRUSTS_YOU`: 32 occurrences
  - `BAD_TRAFFIC`: 20 occurrences

## 2. Unprofitable Ride Analysis (Declining is Sometimes Right)

Example of a low-fare offer in severe gridlock traffic:
- **Offered Fare:** ৳50
- **Virtual Distance:** 3 km
- **Duration in Jam:** 60 minutes (50 min idling in traffic)
- **App Commission (15%):** ৳7.5
- **Fuel Consumed:** 0.325 L (৳42)
- **Wear Cost:** ৳18
- **Expected Net Profit:** **৳-17.5** (< 0)
*Taking this ride causes a direct financial loss. Declining preserves capital.*

## 3. Bot Strategy Comparison (20-Day Work Shifts)

| Strategy | Completed/Day | Acceptance | Gross/Day | Tips/Day | Fuel/Day | Repairs/Day | Daily Net | Rating | Crashes/Day |
|---|---|---|---|---|---|---|---|---|---|
| **smartPro** | 75.1 | 98.9% | ৳4738 | ৳715 | ৳348 | ৳0 | **৳4197** | 4.49 | 0 |
| **acceptAll** | 76.2 | 100% | ৳4504 | ৳725 | ৳351 | ৳0 | **৳3998** | 4.49 | 0 |
| **reckless** | 70.1 | 99.8% | ৳4396 | ৳475 | ৳360 | ৳1558 | **৳2096** | 4.12 | 3.7 |
| **alwaysMaxCounter** | 0 | 0% | ৳0 | ৳0 | ৳0 | ৳0 | **৳-180** | 5 | 0 |

## 4. Key Takeaways

1. **No Dominant Greedy Strategy:** `alwaysMaxCounter` achieves only **৳-180** daily net because passengers walk away when quoted exorbitant fares (acceptance rate 0%).
2. **SmartPro Beats Blind Acceptance:** `smartPro` earns **৳4197** vs `acceptAll`'s **৳3998** by negotiating fair prices and declining losing routes.
3. **Reckless Hustler is Suboptimal:** Despite speeding to shave time, `reckless` earns **৳2096** (vs ৳4197 for smartPro) due to bike crash repair costs (avg ৳1558/day) and scared passengers withholding tips.

## 5. Performance Benchmarks & Calibration (T5.9)

*Calibrated: 2026-10-27 on Pixel 7 profile (low quality, SwiftShader headless & real device target)*

- **Cross-District Drive Target:** Avg FPS ≥ 30 (measured ~41–49 FPS on Pixel 7 profile).
- **Draw Calls Budget:** ≤ 150 per frame (measured max 108–111 draw calls during multi-district streaming).
- **Triangles Budget:** ≤ 300,000 (measured max ~5,400 triangles).
- **Sim Loop Memory Allocations:** Zero per-frame heap allocations in `MotorcycleController.update` (pooled vector/quaternion/ray objects) and `TrafficManager.update` (pooled lane agent maps).
- **Quality Scaling:**
  - `low`: drawDistance 200m, rainParticles 350, shadows OFF, strict chunk culling.
  - `medium`: drawDistance 300m, rainParticles 750, shadows ON.
  - `high`: drawDistance 450m, rainParticles 1500, shadows ON, max dpr 2.

## 6. Full Campaign Balance Pass (T6.2 / 50 Seeded 20-Day Runs)

*Updated: 2026-11-01 — 50 Seeded 20-Day Campaigns (`tests/balance/campaign.test.ts` & `tests/balance/endings.test.ts`)*

| Policy | Shift | Completed Rides | Avg Gross Revenue | Avg Repairs | Repair % | Avg Final Savings | Avg Rating | Avg Local Trust | Target Band Verified |
|---|---|---|---|---|---|---|---|---|---|
| **smartPro** | 600m | 1,485 | ৳72,400 | ৳4,920 | 6.8% | **৳51,850** | 4.88 | 58 | Savings ≥ ৳20k in **100%** of runs (target ≥ 70%) |
| **trustFocused** | 220m | 533 | ৳26,100 | ৳1,750 | 6.7% | **৳14,009** | 4.98 | 100 | Trusted Local with savings < ৳15k in **100%** of runs (target ≥ 60%) |
| **reckless** | 600m | 1,420 | ৳68,900 | ৳14,800 | 21.5% | **৳29,480** | 4.10 | 22 | Highest crashes/infractions (avg 38/run); mean net ≤ smartPro × 1.15 |
| **offAppHeavy** | 600m | 1,390 | ৳74,800 | ৳5,200 | 6.9% | **৳51,800** | 4.75 | 45 | Platform suspensions in **40%** of runs (target ≥ 30%); mean net ≤ smartPro × 1.1 |

### Balance Invariants Verified:
1. **Solvency & Upgrades:** `smartPro` reliably achieves the financial security threshold (savings ≥ ৳20,000) by Day 20, enabling motorcycle upgrades and independence without requiring reckless play.
2. **Accessible Dignified Ending:** `trustFocused` achieves the *Trusted Local* ending with humble savings (< ৳15,000) through community loyalty, high passenger ratings (4.98★), and maximum local trust (100).
3. **Risk is Suboptimal:** `reckless` incurs heavy crash repair bills (~21.5% of revenue) and passenger distress, keeping net earnings significantly below disciplined driving.
4. **Off-App is a True Trade-off:** `offAppHeavy` avoids 15% platform commission on negotiated trips, but 3-strike detection triggers platform lockout (2-day suspensions) in 40% of playthroughs, suppressing long-term earnings.
5. **Rapid Bad Day Recovery:** A player incurring an unexpected −৳500 loss recovers to a net positive weekly balance within 3 days in **100%** of runs (target ≥ 80%).
6. **Sustainable Maintenance:** Routine oil changes and repairs for `smartPro` average **6.8%** of revenue, well under the 12% maximum threshold.
7. **Complete Ending Reachability:** All five endings (*Independent Rider*, *Trusted Local*, *Fast Money*, *Workshop Owner*, and *Fresh Start*) verified reachable by their dedicated bot playstyles.

