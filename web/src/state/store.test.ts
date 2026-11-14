import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore, generateScenarioId, assignScenarioIds } from './store';
import { scenarioCursorUtc, scenarioCursorMs, scenarioWindowMs } from './selectors';
import { decodeState } from './urlState';
import type { Scenario } from './types';

describe('store - scenario ID generation and hash round trip (L3 #1)', () => {
  beforeEach(() => {
    // Reset store to default state
    useAppStore.setState({
      scenarios: [
        {
          id: 'sc1',
          siteId: 'southpole_landed',
          startUtc: '2027-08-30T00:00:00Z',
          durationH: 720,
          slipDays: 0,
        },
      ],
      activeScenarioId: 'sc1',
      cursorH: 0,
      mode: 'advanced',
      observerHeightM: 2,
    });
  });

  it('generates unique deterministic IDs that do not collide with existing scenarios', () => {
    const existing: Scenario[] = [
      { id: 'sc1', siteId: 'a', startUtc: '', durationH: 10, slipDays: 0 },
      { id: 'sc2', siteId: 'b', startUtc: '', durationH: 10, slipDays: 0 },
    ];
    expect(generateScenarioId(existing)).toBe('sc3');

    // Gap filled
    const withGap: Scenario[] = [
      { id: 'sc1', siteId: 'a', startUtc: '', durationH: 10, slipDays: 0 },
      { id: 'sc3', siteId: 'c', startUtc: '', durationH: 10, slipDays: 0 },
    ];
    expect(generateScenarioId(withGap)).toBe('sc2');
  });

  it('assignScenarioIds assigns non-colliding unique IDs across multiple items', () => {
    const scenarios = assignScenarioIds([
      { siteId: 'a' },
      { siteId: 'b' },
      { siteId: 'c' },
    ]);
    expect(scenarios.map((s) => s.id)).toEqual(['sc1', 'sc2', 'sc3']);
  });

  it('round trip: decode hash, add scenario, then remove without ID collision', () => {
    // Simulate decoding a state from hash with two scenarios
    const hash = 's=southpole_landed~2027-08-30~720~0;shackleton~2027-09-15~336~0';
    const decoded = decodeState(hash);
    expect(decoded.scenarios).toBeDefined();

    // Assign IDs as done by useUrlSync / presets
    const loadedScenarios = assignScenarioIds(decoded.scenarios!);
    expect(loadedScenarios.map((s) => s.id)).toEqual(['sc1', 'sc2']);

    useAppStore.setState({
      scenarios: loadedScenarios,
      activeScenarioId: loadedScenarios[0].id,
    });

    // User adds a third scenario
    const newId = useAppStore.getState().addScenario({ siteId: 'apollo_11' });
    expect(newId).toBe('sc3');
    expect(useAppStore.getState().scenarios.map((s) => s.id)).toEqual(['sc1', 'sc2', 'sc3']);

    // Remove the middle scenario (sc2)
    useAppStore.getState().removeScenario('sc2');
    const remaining = useAppStore.getState().scenarios;
    expect(remaining.map((s) => s.id)).toEqual(['sc1', 'sc3']);

    // Adding another scenario reuses the lowest available gap (sc2) without collision
    const addedAfterRemove = useAppStore.getState().addScenario({ siteId: 'artemis_region_1' });
    expect(addedAfterRemove).toBe('sc2');
    const allIds = useAppStore.getState().scenarios.map((s) => s.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('store - setCursorH and selector resilience (L3 #2)', () => {
  beforeEach(() => {
    useAppStore.setState({ cursorH: 10 });
  });

  it('rejects non-finite cursor values (NaN, Infinity, -Infinity) keeping valid state', () => {
    useAppStore.getState().setCursorH(NaN);
    expect(Number.isFinite(useAppStore.getState().cursorH)).toBe(true);
    expect(useAppStore.getState().cursorH).toBe(10); // retains current valid value

    useAppStore.getState().setCursorH(Infinity);
    expect(Number.isFinite(useAppStore.getState().cursorH)).toBe(true);
    expect(useAppStore.getState().cursorH).toBe(10);

    useAppStore.getState().setCursorH(-Infinity);
    expect(Number.isFinite(useAppStore.getState().cursorH)).toBe(true);
    expect(useAppStore.getState().cursorH).toBe(10);

    // Valid negative number is clamped to 0
    useAppStore.getState().setCursorH(-5);
    expect(useAppStore.getState().cursorH).toBe(0);

    // Valid positive number is set
    useAppStore.getState().setCursorH(25.5);
    expect(useAppStore.getState().cursorH).toBe(25.5);
  });

  it('scenarioCursorUtc, scenarioCursorMs, and scenarioWindowMs never throw RangeError on bad input', () => {
    const corruptScenario = {
      id: 'sc1',
      siteId: 'test',
      startUtc: 'invalid-date',
      durationH: NaN,
      slipDays: NaN,
    } as unknown as Scenario;

    expect(() => scenarioWindowMs(corruptScenario)).not.toThrow();
    const window = scenarioWindowMs(corruptScenario);
    expect(Number.isFinite(window.startMs)).toBe(true);
    expect(Number.isFinite(window.endMs)).toBe(true);

    expect(() => scenarioCursorMs(corruptScenario, NaN)).not.toThrow();
    const cursorMs = scenarioCursorMs(corruptScenario, NaN);
    expect(Number.isFinite(cursorMs)).toBe(true);

    expect(() => scenarioCursorUtc(corruptScenario, NaN)).not.toThrow();
    const utc = scenarioCursorUtc(corruptScenario, NaN);
    expect(typeof utc).toBe('string');
  });
});

describe('store - Simple mode slip reset (L3 #3)', () => {
  it('resets non-zero slipDays to 0 when entering Simple mode', () => {
    useAppStore.setState({
      mode: 'advanced',
      scenarios: [
        {
          id: 'sc1',
          siteId: 'southpole_landed',
          startUtc: '2027-08-30T00:00:00Z',
          durationH: 720,
          slipDays: 14,
        },
        {
          id: 'sc2',
          siteId: 'shackleton',
          startUtc: '2027-08-30T00:00:00Z',
          durationH: 720,
          slipDays: -7,
        },
      ],
    });

    useAppStore.getState().setMode('simple');
    const scenarios = useAppStore.getState().scenarios;
    expect(scenarios[0].slipDays).toBe(0);
    expect(scenarios[1].slipDays).toBe(0);
    expect(useAppStore.getState().mode).toBe('simple');
  });
});

describe('store - loop wrap glitch and observer height sync (L3 #5, L3 #11, L4 #3)', () => {
  it('tick smoothly wraps to 0 when cursorH >= loopH without arbitrary midpoint jump', () => {
    // Scenario duration is 100 hours, but cursor was scrubbed to 150 hours
    useAppStore.setState({
      scenarios: [
        {
          id: 'sc1',
          siteId: 'test',
          startUtc: '2027-01-01T00:00:00Z',
          durationH: 100,
          slipDays: 0,
        },
      ],
      cursorH: 150,
      playing: true,
      speedHPerSec: 1,
    });

    // Advance by 1 second (1 hour)
    useAppStore.getState().tick(1);
    // Cursor was >= loopH (150 >= 100), so next should reset to 0 (or small tick from 0), not jump to 51
    expect(useAppStore.getState().cursorH).toBe(0);
  });

  it('setObserverHeight synchronizes both state.observerHeightM and state.missionRules.observerHeightM', () => {
    useAppStore.setState({
      observerHeightM: 2,
      missionRules: {
        missionDurationH: 240,
        minPctSunlit: 70,
        maxLongestDarkH: 48,
        earthAtLandingRequired: true,
        minPctEarth: 50,
        observerHeightM: 2,
      },
    });

    useAppStore.getState().setObserverHeight(10);
    expect(useAppStore.getState().observerHeightM).toBe(10);
    expect(useAppStore.getState().missionRules.observerHeightM).toBe(10);
  });
});

describe('urlState - speed validation (L3 #6)', () => {
  it('accepts preset speeds and rejects arbitrary floats or huge numbers', () => {
    expect(decodeState('v=6').speedHPerSec).toBe(6);
    expect(decodeState('v=168').speedHPerSec).toBe(168);

    // Unsupported speeds are rejected
    expect(decodeState('v=999999').speedHPerSec).toBeUndefined();
    expect(decodeState('v=0.5').speedHPerSec).toBeUndefined();
    expect(decodeState('v=-12').speedHPerSec).toBeUndefined();
  });
});
