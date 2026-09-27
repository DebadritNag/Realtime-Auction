"""Build a server-private, name/position-only Hero catalogue. No ratings or stats.
Historical IDs are reviewed identities, not fuzzy matches (Rui Costa has a namesake).
"""
import csv, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'backend/data/secret-heroes'
HISTORICAL = {
 'Joe Cole':'27','Robbie Keane':'330','Ricardo Carvalho':'3622','Landon Donovan':'7743',
 'Tomáš Rosický':'8473','Yaya Touré':'20289','Rafael Márquez':'26709','Dimitar Berbatov':'30110',
 'DaMarcus Beasley':'39386','Tim Cahill':'51412','Antonio Di Natale':'120274','Javier Mascherano':'142754',
 'Mario Gomez':'150418','Clint Dempsey':'155897','Claudio Marchisio':'173210','Ramires':'184943',
 'Vincent Kompany':'139720','Diego Milito':'142708','Diego Forlán':'49072','Wesley Sneijder':'139869','Carlos Tévez':'143001'
}
def build():
 with (OUT/'heroes.csv').open(encoding='utf-8-sig') as f:
  names=[r['player_name'] for r in csv.DictReader(f)]
 records={}
 with (ROOT/'frontend/male_players.csv').open(encoding='utf-8-sig') as f:
  for r in csv.DictReader(f):
   key=r['player_id']
   if key not in HISTORICAL.values():continue
   # Earliest career record avoids late-career role drift; never reads OVR/stats.
   if key not in records or float(r['fifa_version'])<float(records[key]['fifa_version']):records[key]=r
 overrides=json.loads((OUT/'web-overrides.json').read_text(encoding='utf-8-sig'))
 players=[];provenance={}
 for name in names:
  r=records.get(HISTORICAL.get(name))
  if r:
   position=r['player_positions'].split(',')[0].strip()
   provenance[name]={'source':'frontend/male_players.csv','playerId':r['player_id'],'edition':r['fifa_version']}
  else:
   entry=overrides[name];position=entry['position'];provenance[name]={'source':entry['source_url']}
  if position not in {'GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'}:raise ValueError(name)
  players.append({'name':name,'position':position})
 assert len(players)==len(set(names)), 'Duplicate Hero identity'
 with (OUT/'hero-player-data.csv').open('w',encoding='utf-8',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=['name','position']);writer.writeheader();writer.writerows(players)
 (OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2),encoding='utf-8')
 (OUT/'unresolved.json').write_text('[]\n',encoding='utf-8')
 print(json.dumps({'names':len(names),'ready':len(players),'fields':['name','position']}))
if __name__=='__main__':build()
