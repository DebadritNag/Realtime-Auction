"""Eligibility and canonicalization for the supplied FC career-mode dataset.
No player-name blacklists. Unknown classifications are quarantined, never guessed.
"""
import re
from collections import Counter

TYPE_FIELDS = ('card_type', 'rarity', 'rarity_name', 'player_type', 'item_type', 'fut_type', 'category', 'edition', 'version')
REGULAR = {'base', 'normal', 'regular', 'gold', 'silver', 'bronze', 'rare gold', 'common gold', 'gold rare', 'gold common', 'rare silver', 'common silver', 'silver rare', 'silver common', 'rare bronze', 'common bronze', 'bronze rare', 'bronze common', 'rare', 'common'}
SPECIAL = re.compile(r'\b(icon(?:s)?|legend(?:s)?|hero(?:es)?|special|promo|flashback|end of an era|centurions|toty|tots|totw|inform|in form|sbc|objective|birthday|winter wildcards|road to the final|trailblazers|thunderstruck|future stars)\b')
POSITIONS = {'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'ST', 'CF', 'LW', 'RW'}

def norm(value):
    return re.sub(r'[_-]+', ' ', str(value or '').strip().lower())

def flag(row, key):
    value = norm(row.get(key))
    if value in ('true', '1', 'yes'): return True
    if value in ('false', '0', 'no'): return False
    return None

def audit(row, reason):
    return dict(player_id=row.get('player_id', ''), name=row.get('short_name', ''), overall=row.get('overall', ''),
        position=row.get('player_positions', ''), club=row.get('club_name', ''),
        rarity='; '.join(f'{k}={row[k]}' for k in TYPE_FIELDS if row.get(k)), version=row.get('fifa_version', ''), reason=reason)

def classify(row):
    labels = ' '.join(norm(row.get(k)) for k in (*TYPE_FIELDS, 'club_name', 'team', 'club', 'league_name'))
    if flag(row, 'is_icon') is True or re.search(r'\b(icons?|legends?)\b', labels): return 'icon', 'Icon/legend classification'
    if flag(row, 'is_hero') is True or re.search(r'\b(hero|heroes)\b', labels): return 'hero', 'Hero classification'
    if flag(row, 'is_special') is True or flag(row, 'is_base') is False or SPECIAL.search(labels): return 'special', 'Non-base card classification'
    for key in ('is_icon', 'is_hero', 'is_special', 'is_base'):
        if row.get(key, '').strip() and flag(row, key) is None: return 'suspicious', f'Unknown boolean {key}'
    for key in TYPE_FIELDS:
        value = norm(row.get(key))
        if value and value not in REGULAR: return 'suspicious', f'Unrecognized {key}: {value}'
    if not row.get('club_name', '').strip() or not row.get('league_name', '').strip(): return 'suspicious', 'Missing normal club or league'
    if not row.get('club_team_id', '').strip() or not row.get('league_id', '').strip(): return 'suspicious', 'Missing club/league identity'
    if row.get('player_positions', '').split(',')[0].strip() not in POSITIONS: return 'suspicious', 'Unknown primary position'
    if not row.get('player_id', '').strip() or not row.get('short_name', '').strip(): return 'suspicious', 'Missing player identity'
    if not row.get('overall', '').isdigit() or not 1 <= int(row['overall']) <= 99: return 'suspicious', 'Invalid overall'
    # This supplied source is a career-mode male-player dataset, not a FUT item feed.
    # Require FC24 career-record provenance; an unclassified replacement feed fails closed.
    pid = re.escape(row['player_id'])
    if not re.search(r'/player/' + pid + r'/[^/]+/24\d{4}(?:/|$)', row.get('player_url', '')):
        return 'suspicious', 'Missing FC24 career-record provenance'
    return 'regular', ''

def clean_records(rows):
    report = dict(records_read=len(rows), fc24_records=0, other_editions_removed=0,
        special_records_removed=0, icons_removed=0, heroes_removed=0, promo_special_variants_removed=0,
        duplicate_player_records_removed=0, suspicious_records=0, regular_players_remaining=0)
    removed, suspicious, candidates = [], [], {}
    legacy_examples = []
    for row in rows:
        try: version = float(row.get('fifa_version', ''))
        except ValueError: version = None
        if version != 24:
            report['other_editions_removed'] += 1
            if len(legacy_examples) < 10: legacy_examples.append(audit(row, 'Not FC24'))
            continue
        report['fc24_records'] += 1
        kind, reason = classify(row)
        if kind in ('icon', 'hero', 'special'):
            report['special_records_removed'] += 1
            report[{'icon':'icons_removed', 'hero':'heroes_removed', 'special':'promo_special_variants_removed'}[kind]] += 1
            removed.append(audit(row, reason)); continue
        if kind == 'suspicious': suspicious.append(audit(row, reason)); continue
        candidates.setdefault(row['player_id'], []).append(row)
    regular = []
    for pid, versions in candidates.items():
        report['duplicate_player_records_removed'] += len(versions) - 1
        # Retain most recent regular FC24 update, never highest OVR.
        def update(row):
            try: return (float(row.get('fifa_update', '0')), row.get('update_as_of', ''))
            except ValueError: return (-1, '')
        newest = max(map(update, versions))
        latest = [r for r in versions if update(r) == newest]
        if any(r != latest[0] for r in latest):
            suspicious.extend(audit(r, 'Conflicting base records for same player/update') for r in latest)
            continue
        regular.append(latest[0])
    report['suspicious_records'] = len(suspicious)
    report['regular_players_remaining'] = len(regular)
    report['other_edition_examples'] = legacy_examples
    report['removed_examples'] = removed[:10]
    report['suspicious_examples'] = suspicious[:10]
    return regular, report, removed, suspicious
