"""Generate Manager Mode free agents without modifying the curated auction pool."""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from player_catalog import clean_records, classify, POSITIONS

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ['player_id', 'name', 'overall', 'primary_position', 'secondary_positions', 'auction_category', 'age', 'nationality', 'club', 'league', 'preferred_foot', 'pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical', 'image_url', 'tier', 'source', 'source_fifa_version', 'source_record_kind']
AUCTION_FILES = ['gk.csv', 'def.csv', 'mid.csv', 'att.csv', 'default-player-pool.csv']

def identity(row):
    return next((str(row[k]).strip() for k in ('player_id', 'sofifa_id', 'ea_id') if row.get(k)), '')

def category(position):
    return 'GK' if position == 'GK' else 'DEF' if position in ('CB','LB','RB','LWB','RWB') else 'MID' if position in ('CDM','CM','CAM','LM','RM') else 'ATT'

def tier(overall):
    return next(label for minimum,label in [(90,'ELITE'),(87,'PREMIUM'),(84,'STRONG'),(81,'GOOD'),(0,'VALUE')] if overall >= minimum)

def generate(rows, auction_ids):
    # Career-mode provenance, structured card flags and latest regular FC24 update.
    normalized = [dict(r, player_id=identity(r)) for r in rows]
    regular, cleaning, removed, suspicious = clean_records(normalized)
    output, diagnostics = [], []
    for row in removed:
        text=row['reason'].lower()
        diagnostics.append(dict(row, reason='ICON' if 'icon' in text else 'HERO' if 'hero' in text else 'SPECIAL_CARD'))
    for row in suspicious:
        diagnostics.append(dict(row, reason='INVALID_POSITION' if 'position' in row['reason'].lower() else 'QUARANTINED', detail=row['reason']))
    chosen = {r['player_id']: r for r in regular}
    seen = set()
    for r in normalized:
        pid=r['player_id']
        if pid not in chosen or r.get('fifa_version') not in ('24','24.0') or classify(r)[0] != 'regular': continue
        if r != chosen[pid] or pid in seen:
            diagnostics.append(dict(player_id=pid,name=r.get('short_name',''),overall=r.get('overall',''),reason='DUPLICATE'))
        else: seen.add(pid)
    counts = Counter()
    for r in regular:
        pid=r['player_id']; overall=int(r['overall'])
        reason = 'ALREADY_IN_AUCTION' if pid in auction_ids else 'OVR_BELOW_79' if overall < 79 else None
        if reason:
            counts[reason]+=1
            diagnostics.append(dict(player_id=pid,name=r['short_name'],overall=overall,reason=reason)); continue
        positions=[p.strip() for p in r['player_positions'].split(',')]
        if any(p not in POSITIONS for p in positions):
            diagnostics.append(dict(player_id=pid,name=r['short_name'],overall=overall,reason='INVALID_POSITION'));continue
        output.append(dict(player_id=pid,name=r['short_name'],overall=overall,primary_position=positions[0],secondary_positions=','.join(positions[1:]),auction_category=category(positions[0]),age=r.get('age',''),nationality=r.get('nationality_name',''),club=r.get('club_name',''),league=r.get('league_name',''),preferred_foot=r.get('preferred_foot',''),**{k:r.get(k,'') for k in ('pace','shooting','passing','dribbling','defending')},physical=r.get('physic',''),image_url=r.get('image_url',''),tier=tier(overall),source='EXTERNAL_POOL',source_fifa_version=24,source_record_kind='REGULAR_CAREER'))
    output.sort(key=lambda r:(-r['overall'],r['name'].casefold(),r['player_id']))
    report={'full_source_players':len(rows),'auction_players_excluded':counts['ALREADY_IN_AUCTION'],'special_icon_hero_excluded':cleaning['special_records_removed'],'below_79_excluded':counts['OVR_BELOW_79'],'duplicates_removed':cleaning['duplicate_player_records_removed'],'other_editions_excluded':cleaning['other_editions_removed'],'quarantined':cleaning['suspicious_records'],'external_players_generated':len(output),'by_category':{g:sum(p['auction_category']==g for p in output) for g in ('GK','DEF','MID','ATT')}}
    assert len({p['player_id'] for p in output}) == len(output)
    assert not auction_ids.intersection(p['player_id'] for p in output)
    return output, diagnostics, report

def write_csv(path, fields, rows):
    with path.open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');writer.writeheader();writer.writerows(rows)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=ROOT/'frontend/male_players.csv')
    parser.add_argument('--auction-dir',type=Path,default=ROOT/'backend/data/default-pool')
    parser.add_argument('--output-dir',type=Path,default=ROOT/'backend/data/manager-mode')
    args=parser.parse_args(); auction_ids=set(); files=[]
    for name in AUCTION_FILES:
        path=args.auction_dir/name
        if not path.exists():
            if name=='default-player-pool.csv':continue
            raise ValueError(f'Missing required auction file: {path}')
        files.append(name)
        with path.open(encoding='utf-8-sig',newline='') as f:
            for row in csv.DictReader(f):
                pid=identity(row)
                if not pid:raise ValueError(f'Auction record lacks a stable person ID: {name}')
                auction_ids.add(pid)
    with args.source.open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
    output,diagnostics,report=generate(rows,auction_ids)
    report['auction_files']=files;report['unique_auction_players']=len(auction_ids)
    args.output_dir.mkdir(parents=True,exist_ok=True)
    write_csv(args.output_dir/'external-players.csv',FIELDS,output)
    write_csv(args.output_dir/'external-player-generation-report.csv',['player_id','name','overall','reason','detail'],diagnostics)
    (args.output_dir/'external-player-generation-summary.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
