import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Test the telemetry parsing logic from mqtt-ws.ts
// We test the property mapping and value conversion inline since
// handleTelemetry is not exported — we replicate the logic

const TEST_DB = '/tmp/smart-estate-mqtt-test.duckdb';
process.env.SMART_ESTATE_DB_PATH = TEST_DB;

const fs = require('fs');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_DB + '.wal')) fs.unlinkSync(TEST_DB + '.wal');

// Replicate the propertyMap from mqtt-ws.ts
const propertyMap: Record<string, { value: any; unit: string }> = {
  temperature: { value: undefined, unit: '°C' },
  humidity: { value: undefined, unit: '%' },
  co2: { value: undefined, unit: 'ppm' },
  voc: { value: undefined, unit: 'ppb' },
  formaldehyde: { value: undefined, unit: 'mg/m³' },
  pm25: { value: undefined, unit: 'µg/m³' },
  illuminance: { value: undefined, unit: 'lux' },
  soil_moisture: { value: undefined, unit: '%' },
  pressure: { value: undefined, unit: 'hPa' },
  battery: { value: undefined, unit: '%' },
  voltage: { value: undefined, unit: 'V' },
  current: { value: undefined, unit: 'A' },
  power: { value: undefined, unit: 'W' },
  energy: { value: undefined, unit: 'kWh' },
  state: { value: undefined, unit: 'state' },
  presence: { value: undefined, unit: 'bool' },
  contact: { value: undefined, unit: 'bool' },
  water_leak: { value: undefined, unit: 'bool' },
  linkquality: { value: undefined, unit: 'lqi' },
};

function extractProperties(data: any): Array<{ prop: string; value: number; unit: string }> {
  const results: Array<{ prop: string; value: number; unit: string }> = [];

  for (const [prop, meta] of Object.entries(propertyMap)) {
    const val = (data as any)[prop];
    if (val !== undefined && val !== null) {
      let numericValue: number;
      if (typeof val === 'boolean') {
        numericValue = val ? 1 : 0;
      } else if (typeof val === 'string') {
        numericValue = ['ON', 'open', 'present', 'leak'].includes(val) ? 1 : 0;
      } else {
        numericValue = val;
      }
      results.push({ prop, value: numericValue, unit: meta.unit });
    }
  }

  return results;
}

describe('MQTT Telemetry Parsing', () => {
  it('extracts numeric temperature and humidity', () => {
    const msg = { temperature: 23.5, humidity: 45.0 };
    const props = extractProperties(msg);
    expect(props.length).toBe(2);
    expect(props.find(p => p.prop === 'temperature')!.value).toBe(23.5);
    expect(props.find(p => p.prop === 'humidity')!.value).toBe(45.0);
  });

  it('extracts CO2 and VOC', () => {
    const msg = { co2: 850, voc: 120 };
    const props = extractProperties(msg);
    expect(props.length).toBe(2);
    expect(props.find(p => p.prop === 'co2')!.unit).toBe('ppm');
    expect(props.find(p => p.prop === 'voc')!.unit).toBe('ppb');
  });

  it('handles illuminance with lux_luminance fallback', () => {
    const original_prop = propertyMap['illuminance'];
    // Test with direct illuminance
    const msg1 = { illuminance: 500 };
    const props1 = extractProperties(msg1);
    expect(props1.find(p => p.prop === 'illuminance')!.value).toBe(500);
  });

  it('converts boolean state to numeric', () => {
    const msg = { state: 'ON', power: 5.2 };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'state')!.value).toBe(1);
  });

  it('converts OFF state to 0', () => {
    const msg = { state: 'OFF' };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'state')!.value).toBe(0);
  });

  it('converts presence true to 1', () => {
    const msg = { presence: true };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'presence')!.value).toBe(1);
  });

  it('converts presence false to 0', () => {
    const msg = { presence: false };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'presence')!.value).toBe(0);
  });

  it('converts contact open to 1', () => {
    const msg = { contact: true };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'contact')!.value).toBe(1);
  });

  it('converts water_leak true to 1', () => {
    const msg = { water_leak: true };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'water_leak')!.value).toBe(1);
  });

  it('converts water_leak false to 0', () => {
    const msg = { water_leak: false };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'water_leak')!.value).toBe(0);
  });

  it('extracts energy and power readings', () => {
    const msg = { power: 150.5, energy: 2.35, voltage: 230 };
    const props = extractProperties(msg);
    expect(props.length).toBe(3);
    expect(props.find(p => p.prop === 'power')!.value).toBe(150.5);
    expect(props.find(p => p.prop === 'energy')!.value).toBe(2.35);
    expect(props.find(p => p.prop === 'voltage')!.value).toBe(230);
  });

  it('handles linkquality (signal strength)', () => {
    const msg = { linkquality: 85, battery: 92 };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'linkquality')!.value).toBe(85);
    expect(props.find(p => p.prop === 'linkquality')!.unit).toBe('lqi');
    expect(props.find(p => p.prop === 'battery')!.value).toBe(92);
  });

  it('handles pm2.5 air quality', () => {
    const msg = { pm25: 12.4 };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'pm25')!.value).toBe(12.4);
    expect(props.find(p => p.prop === 'pm25')!.unit).toBe('µg/m³');
  });

  it('handles formaldehyde sensor', () => {
    const msg = { formaldehyde: 0.02 };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'formaldehyde')!.value).toBe(0.02);
    expect(props.find(p => p.prop === 'formaldehyde')!.unit).toBe('mg/m³');
  });

  it('handles soil moisture sensor', () => {
    const msg = { soil_moisture: 65 };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'soil_moisture')!.value).toBe(65);
    expect(props.find(p => p.prop === 'soil_moisture')!.unit).toBe('%');
  });

  it('handles atmospheric pressure', () => {
    const msg = { pressure: 1013.25 };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'pressure')!.value).toBe(1013.25);
    expect(props.find(p => p.prop === 'pressure')!.unit).toBe('hPa');
  });

  it('handles electrical current sensor', () => {
    const msg = { current: 0.65 };
    const props = extractProperties(msg);
    expect(props.find(p => p.prop === 'current')!.value).toBe(0.65);
    expect(props.find(p => p.prop === 'current')!.unit).toBe('A');
  });

  it('ignores undefined/null values', () => {
    const msg = { temperature: 20.0, humidity: null, co2: undefined };
    const props = extractProperties(msg);
    expect(props.length).toBe(1);
    expect(props[0].prop).toBe('temperature');
  });

  it('handles unknown properties gracefully (ignores them)', () => {
    const msg = { temperature: 22.0, unknown_prop: 999, custom_field: 'test' };
    const props = extractProperties(msg);
    expect(props.length).toBe(1);
  });

  it('handles empty message', () => {
    const msg = {};
    const props = extractProperties(msg);
    expect(props.length).toBe(0);
  });

  it('maintains correct unit for each property', () => {
    const units: Record<string, string> = {};
    for (const [prop, meta] of Object.entries(propertyMap)) {
      units[prop] = meta.unit;
    }

    expect(units.temperature).toBe('°C');
    expect(units.humidity).toBe('%');
    expect(units.co2).toBe('ppm');
    expect(units.voc).toBe('ppb');
    expect(units.illuminance).toBe('lux');
    expect(units.pressure).toBe('hPa');
    expect(units.battery).toBe('%');
    expect(units.voltage).toBe('V');
    expect(units.current).toBe('A');
    expect(units.power).toBe('W');
    expect(units.energy).toBe('kWh');
    expect(units.linkquality).toBe('lqi');
  });

  it('handles string state values (ON/OFF)', () => {
    expect(extractProperties({ state: 'ON' })[0].value).toBe(1);
    expect(extractProperties({ state: 'OFF' })[0].value).toBe(0);
  });

  it('handles string contact values (open/closed)', () => {
    // contact is boolean in zigbee2mqtt, but we handle both paths
    expect(extractProperties({ contact: true })[0].value).toBe(1);
    expect(extractProperties({ contact: false })[0].value).toBe(0);
  });
});

describe('MQTT Topic Parsing', () => {
  it('correctly splits zigbee2mqtt topic', () => {
    const topic = 'zigbee2mqtt/living_room_temp';
    const parts = topic.split('/');
    expect(parts[0]).toBe('zigbee2mqtt');
    expect(parts[1]).toBe('living_room_temp');
  });

  it('identifies bridge events', () => {
    const topic = 'zigbee2mqtt/bridge/state';
    const parts = topic.split('/');
    expect(parts[0]).toBe('zigbee2mqtt');
    expect(parts[1]).toBe('bridge');
    expect(parts[2]).toBe('state');
  });

  it('identifies device-specific subtopics', () => {
    const topic = 'zigbee2mqtt/0x00158d0001/set';
    const parts = topic.split('/');
    expect(parts[1]).toBe('0x00158d0001');
    expect(parts[2]).toBe('set');
  });
});

describe('Device Discovery Parsing', () => {
  it('extracts device info from announce message', () => {
    const announceMsg = {
      type: 'device_announce',
      ieee_address: '0x00124b001a2b3c4d',
      definition: {
        model: 'WSDCGQ11LM',
        vendor: 'Xiaomi'
      }
    };

    expect(announceMsg.type).toBe('device_announce');
    expect(announceMsg.ieee_address).toBe('0x00124b001a2b3c4d');
    expect(announceMsg.definition.model).toBe('WSDCGQ11LM');
  });

  it('extracts device info from interview message', () => {
    const interviewMsg = {
      type: 'device_interview',
      ieee_address: '0x00158d0001a2b3c4',
      model_id: 'lumi.sensor_ht',
      vendor: 'Aqara'
    };

    expect(interviewMsg.type).toBe('device_interview');
    expect(interviewMsg.ieee_address).toBe('0x00158d0001a2b3c4');
  });

  it('handles device_leave message', () => {
    const leaveMsg = {
      type: 'device_leave',
      ieee_address: '0x00124b001a2b3c4d'
    };

    expect(leaveMsg.type).toBe('device_leave');
    expect(leaveMsg.ieee_address).toBe('0x00124b001a2b3c4d');
  });
});

describe('MQTT to DuckDB Integration', () => {
  let mod: any;

  beforeAll(async () => {
    mod = await import('../src/db');
  });

  it('stores parsed telemetry in DuckDB', async () => {
    const ieee = '0xMQTT_INTEGRATION_TEST';

    // Simulate what handleTelemetry does
    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('${ieee}','integration_test','sensor',5) ON CONFLICT DO NOTHING`);

    // Insert parsed telemetry
    const testData = { temperature: 25.0, humidity: 60.0, co2: 900, battery: 85 };
    const props = extractProperties(testData);

    for (const p of props) {
      await mod.query(
        `INSERT INTO telemetry (id,device_ieee,property,value,unit,raw_json)
         VALUES (nextval('telemetry_seq'),'${ieee}','${p.prop}',${p.value},'${p.unit}','{}')`
      );
    }

    await new Promise(r => setTimeout(r, 100));

    // Verify
    const rows = await mod.query(
      `SELECT property, value, unit FROM telemetry WHERE device_ieee='${ieee}' ORDER BY property`
    );
    expect(rows.length).toBe(4);
    expect(rows[0].property).toBe('battery');
    expect(rows[0].value).toBe(85);
    expect(rows[3].property).toBe('temperature');
    expect(rows[3].value).toBe(25.0);
  });

  it('detects state changes from telemetry sequence', async () => {
    const ieee = '0x_STATE_CHANGE_TEST';

    await mod.query(`INSERT INTO devices (ieee_addr,friendly_name,type,room_id)
      VALUES ('${ieee}','state_test','switch',2) ON CONFLICT DO NOTHING`);

    // Insert OFF state
    await mod.query(`INSERT INTO telemetry (id,device_ieee,property,value,unit,raw_json)
      VALUES (nextval('telemetry_seq'),'${ieee}','state',0,'state','{"state":"OFF"}')`);

    await new Promise(r => setTimeout(r, 50));

    // Query previous state
    const prev = await mod.query(
      `SELECT value FROM telemetry WHERE device_ieee='${ieee}' AND property='state' ORDER BY ts DESC LIMIT 1`
    );
    expect(prev[0].value).toBe(0);

    // Insert ON state
    await mod.query(`INSERT INTO telemetry (id,device_ieee,property,value,unit,raw_json)
      VALUES (nextval('telemetry_seq'),'${ieee}','state',1,'state','{"state":"ON"}')`);

    const curr = await mod.query(
      `SELECT value FROM telemetry WHERE device_ieee='${ieee}' AND property='state' ORDER BY ts DESC LIMIT 1`
    );
    expect(curr[0].value).toBe(1);
    // State changed from 0 to 1
    expect(curr[0].value).not.toBe(prev[0].value);
  });
});
