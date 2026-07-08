import { describe, it, expect } from 'vitest';
import { MqttTelemetrySchema, validateMqttPayload } from '../src/schemas';

describe('MqttTelemetrySchema (Zod)', () => {
  // ── Empty / minimal payloads ──

  it('validates an empty object (all fields optional)', () => {
    const result = MqttTelemetrySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it('validates a typical temperature + humidity update', () => {
    const result = MqttTelemetrySchema.safeParse({
      temperature: 23.5,
      humidity: 55.2,
      linkquality: 120,
    });
    expect(result.success).toBe(true);
  });

  it('validates a full device announcement payload', () => {
    const result = MqttTelemetrySchema.safeParse({
      ieee_address: '0x00158d0003c4a123',
      type: 'EndDevice',
      definition: { model: 'WSDCGQ11LM', vendor: 'Xiaomi' },
      friendly_name: '0x00158d0003c4a123',
    });
    expect(result.success).toBe(true);
  });

  // ── Boolean / enumerated state payloads ──

  it('validates ON/OFF state payload', () => {
    const result = MqttTelemetrySchema.safeParse({
      state: 'ON',
      linkquality: 255,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid state value', () => {
    const result = MqttTelemetrySchema.safeParse({ state: 'MAYBE' });
    expect(result.success).toBe(false);
  });

  it('validates presence / contact booleans', () => {
    const result = MqttTelemetrySchema.safeParse({
      presence: true,
      contact: false,
      tamper: false,
    });
    expect(result.success).toBe(true);
  });

  // ── Numeric range validation ──

  it('rejects temperature above max range', () => {
    const result = MqttTelemetrySchema.safeParse({ temperature: 200 });
    expect(result.success).toBe(false);
  });

  it('rejects temperature below min range', () => {
    const result = MqttTelemetrySchema.safeParse({ temperature: -60 });
    expect(result.success).toBe(false);
  });

  it('rejects humidity outside 0-100', () => {
    const result = MqttTelemetrySchema.safeParse({ humidity: 150 });
    expect(result.success).toBe(false);
  });

  it('rejects negative humidity', () => {
    const result = MqttTelemetrySchema.safeParse({ humidity: -5 });
    expect(result.success).toBe(false);
  });

  it('rejects linkquality above 255', () => {
    const result = MqttTelemetrySchema.safeParse({ linkquality: 300 });
    expect(result.success).toBe(false);
  });

  it('accepts extreme but valid temperature', () => {
    const result = MqttTelemetrySchema.safeParse({ temperature: -50 });
    expect(result.success).toBe(true);
  });

  it('accepts boundary values', () => {
    // Co2 max is 10000
    expect(MqttTelemetrySchema.safeParse({ co2: 0 }).success).toBe(true);
    expect(MqttTelemetrySchema.safeParse({ co2: 10000 }).success).toBe(true);
    // Battery max is 100
    expect(MqttTelemetrySchema.safeParse({ battery: 0 }).success).toBe(true);
    expect(MqttTelemetrySchema.safeParse({ battery: 100 }).success).toBe(true);
  });

  // ── Type rejection ──

  it('rejects string value for a numeric field', () => {
    const result = MqttTelemetrySchema.safeParse({ temperature: 'warm' });
    expect(result.success).toBe(false);
  });

  it('rejects number value for a boolean field', () => {
    const result = MqttTelemetrySchema.safeParse({ presence: 1 });
    expect(result.success).toBe(false);
  });

  // ── Extra / passthrough fields ──

  it('passes through unknown fields (Zigbee2MQTT extras)', () => {
    const payload = {
      temperature: 22.1,
      linkquality: 150,
      '_some_zigbee_extra': 'test',
    };
    const result = MqttTelemetrySchema.safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.data?._some_zigbee_extra).toBe('test');
  });
});

describe('validateMqttPayload', () => {
  it('parses a valid JSON string', () => {
    const result = validateMqttPayload('{"temperature":23.5,"humidity":55}');
    expect(result).not.toBeNull();
    expect(result!.temperature).toBe(23.5);
    expect(result!.humidity).toBe(55);
  });

  it('returns null for invalid JSON', () => {
    expect(validateMqttPayload('not-json')).toBeNull();
    expect(validateMqttPayload('{broken')).toBeNull();
  });

  it('returns null for JSON with invalid values', () => {
    expect(validateMqttPayload('{"state":"MAYBE"}')).toBeNull();
    expect(validateMqttPayload('{"humidity":-1}')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateMqttPayload('')).toBeNull();
  });

  it('returns data for minimal valid payload', () => {
    const result = validateMqttPayload('{}');
    expect(result).not.toBeNull();
    expect(result).toEqual({});
  });

  it('passes through extra unknown keys from the JSON string', () => {
    const result = validateMqttPayload('{"temperature":22,"extra":"foo"}');
    expect(result).not.toBeNull();
    expect(result!.extra).toBe('foo');
  });
});
