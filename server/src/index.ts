import http from 'http';
import app from './api';
import { connectMQTT, attachWebSocket, disconnectMQTT } from './mqtt-ws';
import { startScheduler, stopScheduler } from './scheduler';
import { stmt, DB_PATH, logErrorWithLog } from './db';
import logger from './logger';

const PORT = parseInt(process.env.PORT || '8788');

const server = http.createServer(app);

// WebSocket
attachWebSocket(server);

// MQTT — skip in demo mode
if (process.env.SMART_ESTATE_MODE !== 'demo') {
  connectMQTT();
} else {
  logger.log("[INDEX] ", '🎭 DEMO MODE: MQTT skipped (not needed)');
}

// Time-based scheduler
startScheduler().catch(e => logger.error("[INDEX] ", 'Scheduler start failed:', e.message));

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
  logger.log("[INDEX] ", '═'.repeat(55));
  logger.log("[INDEX] ", '🏠  УМНАЯ УСАДЬБА — сервер запущен');
  logger.log("[INDEX] ", '═'.repeat(55));
  logger.log("[INDEX] ", `   REST API:  http://localhost:${PORT}/api`);
  logger.log("[INDEX] ", `   WebSocket: ws://localhost:${PORT}/ws`);
  logger.log("[INDEX] ", `   📱 Телефон: http://${localIP}:${PORT}/start`);
  logger.log("[INDEX] ", `   SQLite:    ${DB_PATH}`);
  logger.log("[INDEX] ", `   MQTT:      ${process.env.MQTT_URL || 'mqtt://localhost:1883'}`);
  logger.log("[INDEX] ", `   Scheduler: ⏰ active`);
  logger.log("[INDEX] ", '═'.repeat(55));
  logger.log("[INDEX] ", '   Endpoints:');
  logger.log("[INDEX] ", '   GET  /api/status          — системный статус');
  logger.log("[INDEX] ", '   GET  /api/devices         — все устройства');
  logger.log("[INDEX] ", '   GET  /api/devices/:id     — одно устройство + телеметрия');
  logger.log("[INDEX] ", '   POST /api/devices/:id/on  — включить реле');
  logger.log("[INDEX] ", '   POST /api/devices/:id/off — выключить реле');
  logger.log("[INDEX] ", '   GET  /api/telemetry       — телеметрия (device, property, period)');
  logger.log("[INDEX] ", '   GET  /api/rooms           — комнаты с агрегацией');
  logger.log("[INDEX] ", '   GET  /api/energy          — потребление');
  logger.log("[INDEX] ", '   GET  /api/events          — последние события');
  logger.log("[INDEX] ", '   GET  /api/audit           — полный лог для AI');
  logger.log("[INDEX] ", '   GET  /api/scenarios       — сценарии');
  logger.log("[INDEX] ", '   GET  /api/mode            — режим (live/demo)');
  logger.log("[INDEX] ", '   POST /api/mode            — переключить режим');
  logger.log("[INDEX] ", '═'.repeat(55));

  // Auto-start demo if env var is set (delayed to avoid DB race)
  if (process.env.SMART_ESTATE_MODE === 'demo') {
    setTimeout(() => {
      import('./demo').then(d => d.startDemo()).catch(e =>
        logger.error("[INDEX] ", 'Demo start error:', e.message));
    }, 2000);
  }
});

// Cleanup expired nonces every hour
setInterval(() => {
  try {
    const info = stmt.cleanupExpiredNonces.run();
    if (info.changes > 0) logger.log("[INDEX] ", `🧹 Очищено просроченных nonce: ${info.changes}`);
  } catch (e: any) {
    logger.error("[INDEX] ", 'Nonce cleanup error:', e.message);
  }
}, 60 * 60 * 1000);

// ── Graceful shutdown ─────────────────────────────────────
//
// НАХОДКА (Модуль 6): раньше server.close() вызывался без ожидания коллбэка,
// а process.exit(0) шёл СРАЗУ на следующей строке — close() практически не
// успевал ничего сделать, все текущие HTTP-запросы и WebSocket-соединения
// обрывались резко, а не завершались штатно. Теперь ждём реального закрытия
// (с таймаутом на случай зависших keep-alive соединений) и явно отключаем
// MQTT перед выходом.

let shuttingDown = false;

function gracefulShutdown(signal: string): void {
  if (shuttingDown) return; // повторный сигнал во время шатдауна — игнорируем
  shuttingDown = true;

  logger.log("[INDEX] ", `\n🛑 ${signal}: завершение работы...`);

  stopScheduler();
  disconnectMQTT();

  // Даём server.close() реальный шанс закрыть соединения, но не ждём вечно —
  // если за 5 секунд не закрылось (например, зависшие SSE/WS соединения),
  // выходим принудительно, а не висим бесконечно.
  const forceExitTimer = setTimeout(() => {
    logger.log("[INDEX] ", '⏱️ Таймаут graceful shutdown — принудительный выход');
    process.exit(0);
  }, 5000);
  forceExitTimer.unref(); // не держим процесс живым только из-за этого таймера

  server.close((err) => {
    if (err) {
      logger.error("[INDEX] ", 'Ошибка при закрытии сервера:', err.message);
    } else {
      logger.log("[INDEX] ", '✅ Сервер закрыт штатно');
    }
    clearTimeout(forceExitTimer);
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default server;
