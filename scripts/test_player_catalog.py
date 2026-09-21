import unittest
from player_catalog import clean_records, classify

BASE = dict(player_id='10', short_name='Player', overall='84', player_positions='RW, ST',
    club_name='Normal FC', league_name='League', club_team_id='1', league_id='2',
    fifa_version='24.0', fifa_update='2.0', update_as_of='2023-09-22', player_url='/player/10/player/240002')

class CatalogTests(unittest.TestCase):
    def test_old_editions_cannot_fill_missing_fc24_players(self):
        regular, report, _, _ = clean_records([dict(BASE, fifa_version='17.0'), BASE])
        self.assertEqual(regular, [BASE]); self.assertEqual(report['other_editions_removed'], 1)

    def test_special_types_and_structured_flags(self):
        for fields, kind in [({'card_type':'BASE ICON'},'icon'), ({'is_icon':'true'},'icon'),
            ({'club_name':'FUT Heroes'},'hero'), ({'is_hero':'1'},'hero'), ({'rarity':'TOTY'},'special'),
            ({'is_special':'yes'},'special'), ({'is_base':'false'},'special')]:
            with self.subTest(fields=fields): self.assertEqual(classify(dict(BASE, **fields))[0],kind)

    def test_normal_variant_retained_with_original_rating(self):
        rows=[dict(BASE, rarity='Gold'), dict(BASE, rarity='TOTS', overall='99')]
        regular, report, _, _=clean_records(rows)
        self.assertEqual(regular[0]['overall'],'84'); self.assertEqual(report['special_records_removed'],1)

    def test_unknown_classification_and_missing_provenance_quarantined(self):
        for fields in [dict(rarity='Unrecognized Promo Type XYZ'), dict(card_type='9876'),
            dict(player_url=''),dict(club_name=''),dict(league_name=''),dict(is_special='maybe')]:
            with self.subTest(fields=fields):
                regular, _, removed, suspicious=clean_records([dict(BASE, **fields)])
                self.assertEqual(regular,[]);self.assertEqual(len(removed)+len(suspicious),1)

    def test_deduplicate_person_and_latest_update_not_highest_rating(self):
        old=dict(BASE, fifa_update='1.0', overall='90')
        regular, report, _, _=clean_records([old, BASE, BASE.copy()])
        self.assertEqual(regular,[BASE]);self.assertEqual(report['duplicate_player_records_removed'],2)

    def test_ambiguous_same_update_quarantined(self):
        regular, _, _, suspicious=clean_records([BASE,dict(BASE,overall='99')])
        self.assertEqual(regular,[]);self.assertEqual(len(suspicious),2)

if __name__=='__main__': unittest.main()
