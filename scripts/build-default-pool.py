"""Build Default FC24 Auction Player Pool from male_players.csv.

This script parses the full FC24 dataset, validates every record, extracts
the curated default player pool across GK (24), DEF (84), MID (84), and ATT (96),
ensuring tactical position balance, rating tiers, and base prices.
Outputs:
  - backend/data/default-pool/gk.csv
  - backend/data/default-pool/def.csv
  - backend/data/default-pool/mid.csv
  - backend/data/default-pool/att.csv
  - backend/data/default-pool/default-player-pool.csv
"""

import csv
import os
import sys
from collections import Counter, defaultdict

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding="utf-8")

SOURCE_CSV = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "male_players.csv")
)
OUTPUT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "backend", "data", "default-pool")
)


def get_tier(ovr: int) -> str:
    if ovr >= 90:
        return "ELITE"
    if ovr >= 87:
        return "PREMIUM"
    if ovr >= 84:
        return "STRONG"
    if ovr >= 81:
        return "GOOD"
    return "VALUE"


def get_base_price_cr(ovr: int) -> int:
    if ovr >= 90:
        return 5
    if ovr >= 87:
        return 4
    if ovr >= 84:
        return 3
    if ovr >= 81:
        return 2
    return 1


def parse_stat(val: str):
    if not val:
        return ""
    val = val.strip()
    return int(val) if val.isdigit() else ""


def build_pool():
    print(f"Reading source dataset from: {SOURCE_CSV}")
    if not os.path.exists(SOURCE_CSV):
        raise FileNotFoundError(f"Source file not found: {SOURCE_CSV}")

    total_source_rows = 0
    fc24_rows = 0
    rejected_rows = []
    valid_players = []

    with open(SOURCE_CSV, mode="r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row_idx, row in enumerate(reader, start=2):
            total_source_rows += 1
            fifa_version = row.get("fifa_version", "").strip()
            if fifa_version != "24.0":
                # Legacy FIFA versions (15 - 23)
                continue
            fc24_rows += 1

            pid = row.get("player_id", "").strip()
            name = row.get("short_name", "").strip()
            ovr_str = row.get("overall", "").strip()
            pos_str = row.get("player_positions", "").strip()

            if not pid:
                rejected_rows.append((row_idx, "missing player_id", name))
                continue
            if not name:
                rejected_rows.append((row_idx, "missing short_name", pid))
                continue
            if not ovr_str or not ovr_str.isdigit():
                rejected_rows.append((row_idx, "invalid overall rating", pid))
                continue
            if not pos_str:
                rejected_rows.append((row_idx, "missing player_positions", pid))
                continue

            ovr = int(ovr_str)
            if ovr < 1 or ovr > 99:
                rejected_rows.append((row_idx, f"out of range overall rating {ovr}", pid))
                continue

            pos_list = [p.strip().upper() for p in pos_str.split(",") if p.strip()]
            if not pos_list:
                rejected_rows.append((row_idx, "empty positions list", pid))
                continue

            primary_pos = pos_list[0]
            if primary_pos == "GK":
                group = "GK"
            elif primary_pos in ["CB", "LB", "RB", "LWB", "RWB"]:
                group = "DEF"
            elif primary_pos in ["CDM", "CM", "CAM", "LM", "RM"]:
                group = "MID"
            elif primary_pos in ["ST", "CF", "LW", "RW"]:
                group = "ATT"
            else:
                rejected_rows.append((row_idx, f"unknown position {primary_pos}", pid))
                continue

            sec_pos = ", ".join(pos_list[1:]) if len(pos_list) > 1 else ""

            valid_players.append(
                {
                    "player_id": pid,
                    "name": name,
                    "overall": ovr,
                    "position": primary_pos,
                    "secondary_positions": sec_pos,
                    "age": parse_stat(row.get("age")),
                    "nationality": row.get("nationality_name", "").strip(),
                    "club": row.get("club_name", "").strip(),
                    "league": row.get("league_name", "").strip(),
                    "preferred_foot": row.get("preferred_foot", "").strip(),
                    "pace": parse_stat(row.get("pace")),
                    "shooting": parse_stat(row.get("shooting")),
                    "passing": parse_stat(row.get("passing")),
                    "dribbling": parse_stat(row.get("dribbling")),
                    "defending": parse_stat(row.get("defending")),
                    "physical": parse_stat(row.get("physic")),
                    "image_url": "",
                    "auction_group": group,
                    "rating_tier": get_tier(ovr),
                    "base_price_cr": get_base_price_cr(ovr),
                }
            )

    print(f"Total source rows in CSV: {total_source_rows}")
    print(f"Total FC24 player rows: {fc24_rows}")
    print(f"Valid FC24 players: {len(valid_players)}")
    print(f"Rejected FC24 rows: {len(rejected_rows)}")
    if rejected_rows:
        for r in rejected_rows[:5]:
            print(f"  Rejected sample: Row {r[0]} - {r[1]} (id/name: {r[2]})")

    # 1. GK selection (24 players)
    gks = [p for p in valid_players if p["auction_group"] == "GK"]
    gks.sort(key=lambda x: (-x["overall"], x["name"]))
    sel_gk = gks[:24]

    # 2. DEF selection (84 players: CB: 50, LB/LWB: 17, RB/RWB: 17)
    cbs = [p for p in valid_players if p["position"] == "CB"]
    cbs.sort(key=lambda x: (-x["overall"], x["name"]))
    lbs = [p for p in valid_players if p["position"] in ("LB", "LWB")]
    lbs.sort(key=lambda x: (-x["overall"], x["name"]))
    rbs = [p for p in valid_players if p["position"] in ("RB", "RWB")]
    rbs.sort(key=lambda x: (-x["overall"], x["name"]))
    sel_def = cbs[:50] + lbs[:17] + rbs[:17]
    sel_def.sort(key=lambda x: (-x["overall"], x["name"]))

    # 3. MID selection (84 players: CDM: 24, CM: 30, CAM: 14, LM: 8, RM: 8)
    cdms = [p for p in valid_players if p["position"] == "CDM"]
    cdms.sort(key=lambda x: (-x["overall"], x["name"]))
    cms = [p for p in valid_players if p["position"] == "CM"]
    cms.sort(key=lambda x: (-x["overall"], x["name"]))
    cams = [p for p in valid_players if p["position"] == "CAM"]
    cams.sort(key=lambda x: (-x["overall"], x["name"]))
    lms = [p for p in valid_players if p["position"] == "LM"]
    lms.sort(key=lambda x: (-x["overall"], x["name"]))
    rms = [p for p in valid_players if p["position"] == "RM"]
    rms.sort(key=lambda x: (-x["overall"], x["name"]))
    sel_mid = cdms[:24] + cms[:30] + cams[:14] + lms[:8] + rms[:8]
    sel_mid.sort(key=lambda x: (-x["overall"], x["name"]))

    # 4. ATT selection (96 players: ST: 48, CF: 8, LW: 20, RW: 20)
    sts = [p for p in valid_players if p["position"] == "ST"]
    sts.sort(key=lambda x: (-x["overall"], x["name"]))
    cfs = [p for p in valid_players if p["position"] == "CF"]
    cfs.sort(key=lambda x: (-x["overall"], x["name"]))
    lws = [p for p in valid_players if p["position"] == "LW"]
    lws.sort(key=lambda x: (-x["overall"], x["name"]))
    rws = [p for p in valid_players if p["position"] == "RW"]
    rws.sort(key=lambda x: (-x["overall"], x["name"]))
    sel_att = sts[:48] + cfs[:8] + lws[:20] + rws[:20]
    sel_att.sort(key=lambda x: (-x["overall"], x["name"]))

    # Combined pool: sorted overall DESC, name ASC
    all_selected = sel_gk + sel_def + sel_mid + sel_att
    all_selected.sort(key=lambda x: (-x["overall"], x["name"]))

    # Verification checks
    assert len(sel_gk) == 24, f"Expected 24 GK, got {len(sel_gk)}"
    assert len(sel_def) == 84, f"Expected 84 DEF, got {len(sel_def)}"
    assert len(sel_mid) == 84, f"Expected 84 MID, got {len(sel_mid)}"
    assert len(sel_att) == 96, f"Expected 96 ATT, got {len(sel_att)}"
    assert len(all_selected) == 288, f"Expected 288 total, got {len(all_selected)}"

    pids = [p["player_id"] for p in all_selected]
    assert len(pids) == len(set(pids)), "Duplicate player_id detected in selection!"

    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    fieldnames = [
        "player_id",
        "name",
        "overall",
        "position",
        "secondary_positions",
        "age",
        "nationality",
        "club",
        "league",
        "preferred_foot",
        "pace",
        "shooting",
        "passing",
        "dribbling",
        "defending",
        "physical",
        "image_url",
        "auction_group",
        "rating_tier",
        "base_price_cr",
    ]

    files_to_write = [
        ("gk.csv", sel_gk),
        ("def.csv", sel_def),
        ("mid.csv", sel_mid),
        ("att.csv", sel_att),
        ("default-player-pool.csv", all_selected),
    ]

    for filename, player_list in files_to_write:
        filepath = os.path.join(OUTPUT_DIR, filename)
        with open(filepath, mode="w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for p in player_list:
                writer.writerow(p)
        print(f"Wrote {len(player_list)} rows to: {filepath}")

    print("\n================== DEFAULT POOL STATISTICS ==================")
    for grp, p_list in [
        ("GK", sel_gk),
        ("DEF", sel_def),
        ("MID", sel_mid),
        ("ATT", sel_att),
    ]:
        min_ovr = min(p["overall"] for p in p_list)
        max_ovr = max(p["overall"] for p in p_list)
        pos_dist = Counter(p["position"] for p in p_list)
        tier_dist = Counter(p["rating_tier"] for p in p_list)
        print(f"\n--- {grp} (Count: {len(p_list)}) ---")
        print(f"  OVR Range: {min_ovr} - {max_ovr}")
        print(f"  Position Distribution: {dict(sorted(pos_dist.items()))}")
        print(f"  Tier Distribution: {dict(sorted(tier_dist.items()))}")

    total_tier_dist = Counter(p["rating_tier"] for p in all_selected)
    print(f"\nOverall Tier Distribution (Total 288): {dict(sorted(total_tier_dist.items()))}")
    print("=============================================================")


if __name__ == "__main__":
    build_pool()
