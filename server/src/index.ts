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

// Detect local network IP for mobile access
function getLocalIP(): string {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const HOST = process.env.SMART_ESTATE_HOST || '0.0.0.0';
const localIP = getLocalIP();

server.listen(PORT, HOST, () => {
  console.log('═'.repeat(55));
  console.log('🏠  УМНАЯ УСАДЬБА — сервер запущен');
  console.log('═'.repeat(55));
  console.log(`   REST API:  http://localhost:${PORT}/api`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   📱 Телефон: http://${localIP}:${PORT}/start`);
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
  console.log('   GET  /api/mode            — режим (live/demo)');
  console.log('   POST /api/mode            — переключить режим');
  console.log('═'.repeat(55));

  // Auto-start demo if env var is set
  if (process.env.SMART_ESTATE_MODE === 'demo') {
    import('./demo').then(d => d.startDemo());
  }
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
