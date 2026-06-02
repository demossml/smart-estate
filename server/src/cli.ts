#!/usr/bin/env node
import { query, DB_PATH } from '../src/db';

const cmd = process.argv[2];
const arg = process.argv[3];

async function main() {
  switch (cmd) {
    case 'devices': {
      const rows = await query(`
        SELECT friendly_name, model, type, status, last_seen
        FROM devices ORDER BY status DESC, last_seen DESC
      `);
      console.log(`🦆 ${DB_PATH}`);
      console.log(`Устройств: ${rows.length}`);
      console.log('─'.repeat(70));
      for (const d of rows) {
        const status = d.status === 'online' ? '🟢' : '🔴';
        const seen = d.last_seen ? new Date(d.last_seen).toLocaleString('ru-RU') : '—';
        console.log(`${status} ${d.friendly_name.padEnd(30)} ${(d.model||'').padEnd(20)} ${seen}`);
      }
      break;
    }

    case 'telemetry': {
      const device = arg;
      let rows;
      if (device) {
        rows = await query(
          `SELECT property, value, unit, ts FROM telemetry
           WHERE device_ieee = ? ORDER BY ts DESC LIMIT 30`, device
        );
      } else {
        rows = await query(
          `SELECT device_ieee, property, value, unit, ts FROM telemetry
           ORDER BY ts DESC LIMIT 30`
        );
      }
      for (const t of rows) {
        const ieee = t.device_ieee ? t.device_ieee.padEnd(20) : '';
        console.log(`${ieee} ${(t.property||'').padEnd(15)} ${String(t.value||'').padEnd(10)} ${(t.unit||'').padEnd(6)} ${new Date(t.ts).toLocaleString('ru-RU')}`);
      }
      break;
    }

    case 'on':
    case 'off': {
      if (!arg) { console.log('Usage: cli on/off <device_ieee>'); break; }
      console.log(`📤 Sending ${cmd.toUpperCase()} to ${arg}...`);
      console.log('   (MQTT команда будет отправлена после подключения Zigbee2MQTT)');
      // Логируем команду
      await query(
        `INSERT INTO commands (id, device_ieee, command, status, source)
         VALUES (nextval('commands_seq'), ?, ?, 'pending', 'cli')`,
        arg, cmd.toUpperCase()
      );
      console.log('   ✅ Команда записана в DuckDB');
      break;
    }

    case 'events': {
      const limit = parseInt(arg) || 20;
      const errors = await query(`SELECT * FROM errors ORDER BY ts DESC LIMIT ?`, limit);
      const commands = await query(`SELECT * FROM commands ORDER BY sent_at DESC LIMIT ?`, limit);
      const stateChanges = await query(`SELECT * FROM state_changes ORDER BY ts DESC LIMIT ?`, limit);

      console.log(`\n📋 Последние ${limit} событий:\n`);

      console.log('── Ошибки ──');
      for (const e of errors) {
        console.log(`  ❌ ${new Date(e.ts).toLocaleString('ru-RU')} [${e.error_type}] ${e.device_ieee||'system'}: ${e.error_msg?.slice(0,80)}`);
      }

      console.log('\n── Команды ──');
      for (const c of commands) {
        const s = c.status === 'success' ? '✅' : c.status === 'error' ? '❌' : '⏳';
        console.log(`  ${s} ${new Date(c.sent_at).toLocaleString('ru-RU')} [${c.source}] ${c.device_ieee}: ${c.command}`);
      }

      console.log('\n── Смены состояний ──');
      for (const sc of stateChanges) {
        console.log(`  🔄 ${new Date(sc.ts).toLocaleString('ru-RU')} ${sc.device_ieee}: ${sc.old_state} → ${sc.new_state} (${sc.reason})`);
      }
      break;
    }

    case 'stats': {
      const totalDevices = await query(`SELECT COUNT(*) as cnt FROM devices`);
      const onlineDevices = await query(`SELECT COUNT(*) as cnt FROM devices WHERE status = 'online'`);
      const totalTelemetry = await query(`SELECT COUNT(*) as cnt FROM telemetry`);
      const todayTelemetry = await query(`SELECT COUNT(*) as cnt FROM telemetry WHERE ts >= CURRENT_DATE`);
      const totalCommands = await query(`SELECT COUNT(*) as cnt FROM commands`);
      const errorCount = await query(`SELECT COUNT(*) as cnt FROM errors`);
      const error24h = await query(`SELECT COUNT(*) as cnt FROM errors WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'`);

      const energy = await query(
        `SELECT SUM(value)::DECIMAL(6,2) as kwh FROM telemetry WHERE property = 'energy' AND ts >= CURRENT_DATE`
      );

      console.log(`🦆 ${DB_PATH}`);
      console.log('─'.repeat(40));
      console.log(`Устройства:       ${onlineDevices[0]?.cnt || 0} онлайн / ${totalDevices[0]?.cnt || 0} всего`);
      console.log(`Телеметрия:       ${todayTelemetry[0]?.cnt || 0} сегодня / ${totalTelemetry[0]?.cnt || 0} всего`);
      console.log(`Команд:           ${totalCommands[0]?.cnt || 0}`);
      console.log(`Ошибок:           ${error24h[0]?.cnt || 0} за 24ч / ${errorCount[0]?.cnt || 0} всего`);
      console.log(`Энергия сегодня:  ${energy[0]?.kwh || '0'} кВт·ч`);
      break;
    }

    case 'audit': {
      const deviceIeee = arg;
      const limit = 50;

      const errors = await query(`SELECT * FROM errors WHERE device_ieee = ? ORDER BY ts DESC LIMIT ?`, deviceIeee, limit);
      const commands = await query(`SELECT * FROM commands WHERE device_ieee = ? ORDER BY sent_at DESC LIMIT ?`, deviceIeee, limit);
      const stateChanges = await query(`SELECT * FROM state_changes WHERE device_ieee = ? ORDER BY ts DESC LIMIT ?`, deviceIeee, limit);

      console.log(`\n🔍 Полный аудит устройства: ${deviceIeee}`);
      console.log('═'.repeat(60));

      console.log(`\n📤 Команды (${commands.length}):`);
      for (const c of commands) {
        const status = c.status === 'success' ? '✅' : c.status === 'error' ? '❌' : '⏳';
        console.log(`  ${status} ${new Date(c.sent_at).toLocaleString('ru-RU')} ${c.command} ${c.payload || ''}`);
        if (c.error_msg) console.log(`     ↳ Ошибка: ${c.error_msg}`);
      }

      console.log(`\n🔄 Смены состояний (${stateChanges.length}):`);
      for (const s of stateChanges) {
        console.log(`  ${new Date(s.ts).toLocaleString('ru-RU')} ${s.old_state} → ${s.new_state} (${s.reason})`);
      }

      console.log(`\n❌ Ошибки (${errors.length}):`);
      for (const e of errors) {
        console.log(`  ${new Date(e.ts).toLocaleString('ru-RU')} [${e.error_type}] ${e.error_msg?.slice(0,100)}`);
        if (e.context) console.log(`     ↳ Контекст: ${e.context}`);
      }

      const errorRate = commands.length > 0 ? ((errors.length / commands.length) * 100).toFixed(1) : '0';
      console.log(`\n📊 Частота ошибок: ${errorRate}%`);
      break;
    }

    case 'scenarios': {
      const scenarios = await query(`SELECT * FROM scenarios ORDER BY id`);
      console.log(`🎭 Сценарии (${scenarios.length}):`);
      console.log('═'.repeat(60));
      for (const s of scenarios) {
        const active = s.active ? '🟢' : '🔴';
        console.log(`${active} #${s.id} ${s.active ? '✓' : '✗'} ${s.name}`);
        console.log(`   ${s.description}`);
        console.log('');
      }
      break;
    }

    case 'scenario-history': {
      if (!arg) { console.log('Usage: cli scenario-history <scenario_id>'); break; }
      const rows = await query(
        `SELECT * FROM scenario_executions WHERE scenario_id = ? ORDER BY ts DESC LIMIT 20`,
        arg
      );
      console.log(`📜 История сценария #${arg} (${rows.length} записей):`);
      for (const r of rows) {
        const ok = r.success ? '✅' : '❌';
        const ts = new Date(r.ts).toLocaleString('ru-RU');
        console.log(`  ${ok} ${ts} — ${r.actions_fired} actions ${r.error_msg ? '('+r.error_msg+')' : ''}`);
      }
      break;
    }

    default:
      console.log(`
🦆 Smart Estate CLI

  npm run cli scenarios               Список сценариев
  npm run cli scenario-history <id>   История исполнений сценария
  npm run cli devices              Список устройств
  npm run cli telemetry [device]   Последние показания
  npm run cli on <device_ieee>     Включить реле
  npm run cli off <device_ieee>    Выключить реле
  npm run cli events [limit]       Последние события
  npm run cli stats                Статистика БД
  npm run cli audit <device_ieee>  Полный аудит устройства
`);
    }
}

main().catch(console.error);
