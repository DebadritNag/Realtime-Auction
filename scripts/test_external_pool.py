import importlib.util
import unittest
from pathlib import Path
from test_player_catalog import BASE
spec=importlib.util.spec_from_file_location('external',Path(__file__).with_name('build-external-pool.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def row(pid, **changes):
    return dict(BASE,player_id=str(pid),player_url=f'/player/{pid}/player/240002',**changes)

class ExternalTests(unittest.TestCase):
    def test_boundary_identity_special_and_category(self):
        rows=[row(1,overall='79'),row(2,overall='78'),row(3,overall='82'),row(4,overall='90',is_icon='true'),row(5,overall='90',rarity='TOTY'),row(6,overall='83',player_positions='LB, LWB'),row(7,overall='81',is_hero='true')]
        players,diagnostics,report=module.generate(rows,{'3'})
        self.assertEqual([p['player_id'] for p in players],['6','1'])
        self.assertEqual(players[0]['auction_category'],'DEF')
        self.assertEqual(players[0]['secondary_positions'],'LWB')
        self.assertEqual({d['reason'] for d in diagnostics},{'OVR_BELOW_79','ALREADY_IN_AUCTION','ICON','HERO','SPECIAL_CARD'})
    def test_latest_update_before_rating_filter_and_person_identity(self):
        rows=[row(1,overall='85',fifa_update='1'),row(1,overall='78',fifa_update='2'),row(2,overall='80'),row(2,overall='80')]
        players,diagnostics,report=module.generate(rows,set())
        self.assertEqual([p['player_id'] for p in players],['2'])
        self.assertEqual(report['duplicates_removed'],2)
        self.assertEqual(module.identity({'player_id':'123','item_id':'999'}),'123')
        self.assertEqual(module.identity({'sofifa_id':'123','item_id':'999'}),'123')
    def test_old_edition_unknown_and_invalid_position_are_excluded(self):
        rows=[row(1,fifa_version='23'),row(2,rarity='Unknown'),row(3,player_positions='DEF')]
        players,_,report=module.generate(rows,set())
        self.assertEqual(players,[]);self.assertEqual(report['other_editions_excluded'],1);self.assertEqual(report['quarantined'],2)

if __name__=='__main__':unittest.main()
