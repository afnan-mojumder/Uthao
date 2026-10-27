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

