import http from 'http';
import app from './api';
import { connectMQTT, attachWebSocket } from './mqtt-ws';
import { startScheduler, stopScheduler } from './scheduler';
import { DB_PATH } from './db';

const PORT = parseInt(process.env.PORT || '8788');

const server = http.createServer(app);

// WebSocket
attachWebSocket(server);

// MQTT
connectMQTT();

// Time-based scheduler
startScheduler().catch(e => console.error('Scheduler start failed:', e.message));

server.listen(PORT, '127.0.0.1', () => {
  console.log('═'.repeat(55));
  console.log('🏠  УМНАЯ УСАДЬБА — сервер запущен');
  console.log('═'.repeat(55));
  console.log(`   REST API:  http://localhost:${PORT}/api`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   DuckDB:    ${DB_PATH}`);
  console.log(`   MQTT:      ${process.env.MQTT_URL || 'mqtt://localhost:1883'}`);
  console.log(`   Scheduler: ⏰ active`);
  console.log('═'.repeat(55));
  console.log('   Endpoints:');
  console.log('   GET  /api/status          — системный статус');
  console.log('   GET  /api/devices         — все устройства');
  console.log('   GET  /api/devices/:id     — одно устройство + телеметрия');
  console.log('   POST /api/devices/:id/on  — включить реле');
  console.log('   POST /api/devices/:id/off — выключить реле');
  console.log('   GET  /api/telemetry       — телеметрия (device, property, period)');
  console.log('   GET  /api/rooms           — комнаты с агрегацией');
  console.log('   GET  /api/energy          — потребление');
  console.log('   GET  /api/events          — последние события');
  console.log('   GET  /api/audit           — полный лог для AI');
  console.log('   GET  /api/scenarios       — сценарии');
  console.log('═'.repeat(55));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  stopScheduler();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopScheduler();
  server.close();
  process.exit(0);
});

export default server;
