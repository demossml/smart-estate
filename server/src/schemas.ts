import { z } from 'zod';

/**
 * Zod schema for Zigbee2MQTT telemetry payloads.
 * All fields are optional — Zigbee2MQTT payloads vary based on device type and update.
 * Numeric ranges are conservative but intentionally wide to catch obvious data corruption
 * without rejecting real-world sensor readings from extreme environments.
 */
export const MqttTelemetrySchema = z.object({
  // ── Standard Zigbee2MQTT envelope fields ──
  ieee_address: z.string().optional(),
  ieeeAddr: z.string().optional(),
  type: z.string().optional(),

  // ── Device metadata ──
  definition: z
    .object({
      model: z.string().optional(),
      vendor: z.string().optional(),
    })
    .optional(),
  model_id: z.string().optional(),
  friendly_name: z.string().optional(),

  // ── Environmental sensors ──
  temperature: z.number().min(-50).max(150).optional(),
  humidity: z.number().min(0).max(100).optional(),
  co2: z.number().min(0).max(10000).optional(),
  voc: z.number().min(0).max(60000).optional(),
  formaldehyde: z.number().min(0).max(10).optional(),
  pm25: z.number().min(0).max(1000).optional(),
  pm10: z.number().min(0).max(1000).optional(),
  illuminance: z.number().min(0).max(200000).optional(),
  illuminance_lux: z.number().min(0).max(200000).optional(),
  soil_moisture: z.number().min(0).max(100).optional(),
  pressure: z.number().min(300).max(1100).optional(),

  // ── Device state ──
  battery: z.number().min(0).max(100).optional(),
  voltage: z.number().min(0).max(600).optional(),
  current: z.number().min(0).max(100).optional(),
  power: z.number().min(0).max(100000).optional(),
  energy: z.number().min(0).max(1000000).optional(),
  linkquality: z.number().min(0).max(255).optional(),

  // ── Boolean / enumerated states ──
  state: z.union([z.literal('ON'), z.literal('OFF'), z.literal('TOGGLE')]).optional(),
  presence: z.boolean().optional(),
  contact: z.boolean().optional(),
  water_leak: z.boolean().optional(),
  occupancy: z.boolean().optional(),
  tamper: z.boolean().optional(),
  battery_low: z.boolean().optional(),

  // ── mmWave presence sensor fields (ZG-204ZK and similar) ──
  detection_distance: z.number().min(0).max(20).optional(),
  fading_time: z.number().min(0).max(600).optional(),
  motion_detection_sensitivity: z.number().min(1).max(10).optional(),
  static_detection_sensitivity: z.number().min(1).max(10).optional(),
  anti_interference: z.union([z.literal('ON'), z.literal('OFF')]).optional(),
  indicator: z.union([z.literal('ON'), z.literal('OFF')]).optional(),

  // ── Catch-all: allow unknown additional properties in the data ──
  // (Zigbee2MQTT emits many device-specific keys; we don't want to reject
  //  valid payloads just because they carry extra fields we don't enumerate.)
}).passthrough();

/** Inferred TypeScript type for a validated MQTT telemetry payload. */
export type MqttTelemetryPayload = z.infer<typeof MqttTelemetrySchema>;

/**
 * Validate a raw MQTT payload string.
 *
 * Steps:
 *   1. Parse JSON — if that fails, return null (unparseable garbage).
 *   2. Run through Zod schema — if validation fails, return null (malformed data).
 *   3. Return the parsed, validated object.
 *
 * @param payload - Raw MQTT payload as a string.
 * @returns The validated payload on success, or `null` on parse/validation failure.
 */
export function validateMqttPayload(payload: string): MqttTelemetryPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  const result = MqttTelemetrySchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }

  return result.data;
}
