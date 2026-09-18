import type { ClusterCanProfile } from '@/lib/clusterCan';

/** A generic "virtual BSI" demo profile — not tied to any real vehicle, just
 *  a broad catalog of the signals a dashboard can plausibly display, so the
 *  bench has something to press before any real vehicle profile exists (see
 *  docs/DASHBOARD-BENCH.md §3/§6/§8). Telltales cover the common ISO 2575
 *  dashboard symbol set across brands/fuel types — a real car only has a
 *  subset of these, which is exactly why `ClusterBenchDashboard` lets a tech
 *  hide the ones that don't apply to the vehicle/test at hand rather than
 *  showing all of them unconditionally. Swap for a real `ClusterCanProfile`
 *  (built from a DBC or a bus capture) once a specific cluster is on the
 *  bench. */
export const DEMO_CLUSTER_PROFILE: ClusterCanProfile = {
  id: 'demo',
  label: 'Demo virtual BSI',
  busSpeedKbps: 500,
  frames: [
    // ---- Gauges ----
    {
      id: 0x520,
      cycleMs: 100,
      signals: [
        { name: 'fuel_pct', startBit: 0, lengthBits: 8, scale: 100 / 255, offset: 0 },
        { name: 'coolant_temp_c', startBit: 8, lengthBits: 8, scale: 1, offset: -40 },
        { name: 'rpm', startBit: 16, lengthBits: 16, scale: 0.25, offset: 0 },
        { name: 'speed_kmh', startBit: 32, lengthBits: 16, scale: 0.01, offset: 0 },
      ],
    },
    {
      id: 0x527,
      cycleMs: 100,
      signals: [
        { name: 'oil_temp_c', startBit: 0, lengthBits: 8, scale: 1, offset: -40 },
        { name: 'battery_voltage', startBit: 8, lengthBits: 8, scale: 0.1, offset: 0 },
        { name: 'boost_pressure_bar', startBit: 16, lengthBits: 8, scale: 0.02, offset: -1 },
        { name: 'oil_pressure_bar', startBit: 24, lengthBits: 8, scale: 0.04, offset: 0 },
      ],
    },
    // ---- Telltales ----
    {
      id: 0x521,
      cycleMs: 200,
      signals: [
        { name: 'handbrake', startBit: 0, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'seatbelt', startBit: 1, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'oil_pressure', startBit: 2, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'check_engine', startBit: 3, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'battery', startBit: 4, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'abs_fault', startBit: 5, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'door_open', startBit: 6, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'fuel_low', startBit: 7, lengthBits: 1, scale: 1, offset: 0 },
      ],
    },
    {
      id: 0x522,
      cycleMs: 200,
      signals: [
        { name: 'airbag', startBit: 0, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'esp_fault', startBit: 1, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'esp_off', startBit: 2, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'brake_system', startBit: 3, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'epb_fault', startBit: 4, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'tpms', startBit: 5, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'washer_fluid_low', startBit: 6, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'bulb_failure', startBit: 7, lengthBits: 1, scale: 1, offset: 0 },
      ],
    },
    {
      id: 0x523,
      cycleMs: 200,
      signals: [
        { name: 'dpf', startBit: 0, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'adblue_low', startBit: 1, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'glow_plug', startBit: 2, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'immobilizer', startBit: 3, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'service_due', startBit: 4, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'cruise_active', startBit: 5, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'trailer_connected', startBit: 6, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'steering_fault', startBit: 7, lengthBits: 1, scale: 1, offset: 0 },
      ],
    },
    {
      id: 0x524,
      cycleMs: 200,
      signals: [
        { name: 'high_beam', startBit: 0, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'low_beam', startBit: 1, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'front_fog', startBit: 2, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'rear_fog', startBit: 3, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'position_lights', startBit: 4, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'hazard', startBit: 5, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'turn_left', startBit: 6, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'turn_right', startBit: 7, lengthBits: 1, scale: 1, offset: 0 },
      ],
    },
    {
      id: 0x525,
      cycleMs: 200,
      signals: [
        { name: 'door_fl', startBit: 0, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'door_fr', startBit: 1, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'door_rl', startBit: 2, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'door_rr', startBit: 3, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'bonnet_open', startBit: 4, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'boot_open', startBit: 5, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'seatbelt_passenger', startBit: 6, lengthBits: 1, scale: 1, offset: 0 },
        { name: 'coolant_level_low', startBit: 7, lengthBits: 1, scale: 1, offset: 0 },
      ],
    },
  ],
};

export const BUILTIN_CLUSTER_PROFILES: readonly ClusterCanProfile[] = [DEMO_CLUSTER_PROFILE];
