"""A5: terrain horizon masks -> horizon/<id>.json (contract §2.2).

Not implemented yet (Phase 1). 720 rays (0.5 deg), observer heights 2 m and 10 m, range 150 km polar / 100 km other, curvature d^2/2R. Polar DEMs: pyproj with the label CRS or common.MOON_SOUTH_POLAR_STEREO, never Earth EPSG; true ground distance (divide planar distance by k = 2/(1+sin|lat|)).
"""
