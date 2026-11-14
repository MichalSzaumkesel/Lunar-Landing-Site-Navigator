"""A4: fetch Sun (10) and Earth (399) apparent az/el for a Moon site from JPL Horizons -> ephem/<id>.json (contract §2.3).

Not implemented yet (Phase 1). Sequential requests only, >= 1 s apart; quote string params ('...'); cache raw responses in data/raw/horizons/ and never re-fetch; record the exact query in horizons_query; coverage 2026-12-01T00Z..2028-12-31T23Z hourly (18288 samples).
"""
