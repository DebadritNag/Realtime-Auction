"""Private Hero seed. Prefer the highest rated unambiguous historical career record.
Never emits this dataset to frontend/public. Reviewed web overrides fill missing names.
"""
import csv, json, unicodedata, re, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'backend/data/secret-heroes'
def norm(s):return re.sub(r'[^a-z0-9 ]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip()
def build():
    names=[r['player_name'] for r in csv.DictReader((OUT/'heroes.csv').open(encoding='utf-8-sig'))]
    matches={n:{} for n in names}
    for row in csv.DictReader((ROOT/'frontend/male_players.csv').open(encoding='utf-8-sig')):
        short,long=norm(row['short_name']),norm(row['long_name'])
        for name in names:
            target=norm(name);tokens=set(target.split());full=set(long.split())
            if target in (short,long) or len(tokens)>1 and tokens<=full:
                bucket=matches[name];pid=row['player_id'];previous=bucket.get(pid)
                if previous is None or (int(row['overall']),float(row['fifa_version']))>(int(previous['overall']),float(previous['fifa_version'])):bucket[pid]=row
    overrides=json.loads((OUT/'web-overrides.json').read_text(encoding='utf-8')) if (OUT/'web-overrides.json').exists() else {}
    players=[];missing=[]
    for name in names:
        rows=list(matches[name].values())
        if len(rows)==1:
            r=rows[0];positions=r['player_positions'].split(',');stats={k:r.get(v,'') for k,v in [('pace','pace'),('shooting','shooting'),('passing','passing'),('dribbling','dribbling'),('defending','defending'),('physical','physic')]}
            if any(not value for value in stats.values()):
                missing.append({'name':name,'reason':'Missing historical card stats','candidate_ids':[r['player_id']]});continue
            players.append(dict(player_id=r['player_id'],name=name,position=positions[0].strip(),secondary_positions=','.join(p.strip() for p in positions[1:]),overall=r['overall'],club=r['club_name'],nationality=r['nationality_name'],**stats,image_url='',provenance='Historical career FIFA '+r['fifa_version'],source_url='local:frontend/male_players.csv'))
        elif name in overrides:
            players.append(dict(overrides[name],name=name))
        else:missing.append({'name':name,'reason':'Ambiguous historical identity' if rows else 'No historical match','candidate_ids':list(matches[name])})
    keys=['player_id','name','position','secondary_positions','overall','club','nationality','pace','shooting','passing','dribbling','defending','physical','image_url','provenance','source_url']
    with (OUT/'hero-player-data.csv').open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=keys);writer.writeheader();writer.writerows(players)
    (OUT/'unresolved.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'names':len(names),'ready':len(players),'missing':missing},ensure_ascii=True))
if __name__=='__main__':build()
