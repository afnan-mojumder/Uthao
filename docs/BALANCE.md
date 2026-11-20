# Balance Metrics and Benchmark Reports

*Updated: 2026-11-20 — Real GameSession Bot Simulation (P5.3 / T11.3)*

## 1. Outcome Variety (200 rides, SmartPro)

- **Sample Size:** 200 completed rides
- **Mean Net per Ride:** ৳107.82
- **Standard Deviation:** ৳32.31 (**30.0%** of mean, target > 15%)
- **ReasonCodes Observed (5 distinct):**
  - `FAIR_PRICE`: 172 occurrences
  - `TOO_EXPENSIVE`: 45 occurrences
  - `URGENT`: 81 occurrences
  - `TRUSTS_YOU`: 21 occurrences
  - `BAD_TRAFFIC`: 113 occurrences

## 2. Unprofitable Ride Analysis (Declining is Sometimes Right)

Example of a low-fare offer in severe gridlock traffic:
- **Offered Fare:** ৳50
- **Virtual Distance:** 3 km
- **Duration in Jam:** 60 minutes (50 min idling in traffic)
- **App Commission (15%):** ৳7.5
- **Fuel Consumed:** 0.325 L (৳42)
- **Wear Cost:** ৳10
- **Expected Net Profit:** **৳-10.0** (< 0)
*Taking this ride causes a direct financial loss. Declining preserves capital.*

## 3. Bot Strategy Comparison (20-Day Work Shifts)

| Strategy | Completed/Day | Acceptance | Gross/Day | Tips/Day | Fuel/Day | Repairs/Day | Daily Net | Rating | Crashes/Day |
|---|---|---|---|---|---|---|---|---|---|
| **smartPro** | 18.7 | 95.9% | ৳3412 | ৳120 | ৳115 | ৳0 | **৳2287** | 5 | 0 |
| **acceptAll** | 17.2 | 97.5% | ৳2783 | ৳104 | ৳104 | ৳0 | **৳1704** | 5 | 0 |
| **trustFocused** | 8.7 | 97.2% | ৳1570 | ৳58 | ৳52 | ৳0 | **৳621** | 5 | 0 |
| **offAppHeavy** | 17.6 | 83.2% | ৳3352 | ৳111 | ৳111 | ৳100 | **৳2241** | 4.96 | 0.05 |
| **exploiter** | 8.6 | 62.8% | ৳3485 | ৳56 | ৳51 | ৳85 | **৳2407** | 4.76 | 0.1 |
| **briber** | 19 | 94.8% | ৳3569 | ৳119 | ৳116 | ৳651 | **৳1844** | 4.97 | 0.2 |
| **reckless** | 16.2 | 95.3% | ৳3029 | ৳95 | ৳100 | ৳120 | **৳1819** | 4.94 | 0.3 |
| **alwaysMaxCounter** | 0 | 0% | ৳0 | ৳0 | ৳0 | ৳0 | **৳-840** | 5 | 0 |

## 4. 20-Day Campaign & 5-Ending Reachability (Real GameSession)

| Policy Run | Ending | Savings | Debt | Integrity | Standing | Evidence | Suspended |
|---|---|---|---|---|---|---|---|
| **smartPro (workshop)** | `workshop_owner` | ৳14123 | ৳0 | 100 | 100 | 0 | no |
| **smartPro (bike)** | `independent_rider` | ৳24123 | ৳0 | 100 | 100 | 0 | no |
| **trustFocused** | `trusted_local` | ৳6821 | ৳0 | 100 | 100 | 0 | no |
| **offAppHeavy** | `trusted_local` | ৳36495 | ৳0 | 100 | 100 | 0 | yes |
| **exploiter** | `fresh_start` | ৳0 | ৳8775 | 0 | 13 | 72 | yes |
| **briber** | `fast_money` | ৳30348 | ৳0 | 0 | 100 | 100 | yes |
| **reckless (scheme)** | `fast_money` | ৳29309 | ৳0 | 0 | 100 | 100 | no |
| **alwaysMaxCounter** | `fresh_start` | ৳0 | ৳16200 | 50 | 80 | 0 | no |

## 5. Key Takeaways

1. **No Dominant Greedy Strategy:** `alwaysMaxCounter` achieves only **৳-840** daily net because passengers walk away when quoted exorbitant fares (acceptance rate 0%).
2. **SmartPro Beats Blind Acceptance:** `smartPro` earns **৳2287** vs `acceptAll`'s **৳1704** by negotiating fair prices and declining losing routes.
3. **Reckless & Exploitative Play Carry Real Penalties:** `reckless` earns **৳1819** (avg ৳120/day repairs), `exploiter` suffers severe integrity/standing loss and app suspension, and `briber` trades integrity and evidence exposure for police evasion.
