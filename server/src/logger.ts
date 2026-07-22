import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'debug.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Rotate log on start — keep last 3 copies
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
if (fs.existsSync(LOG_FILE)) {
  const stat = fs.statSync(LOG_FILE);
  if (stat.size > MAX_LOG_SIZE) {
    const rotated = LOG_FILE + '.1';
    if (fs.existsSync(rotated)) {
      const rotated2 = LOG_FILE + '.2';
      if (fs.existsSync(rotated2)) fs.unlinkSync(rotated2);
      fs.renameSync(rotated, rotated2);
    }
    fs.renameSync(LOG_FILE, rotated);
  }
}

const stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
type Level = keyof typeof LEVELS;

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function write(level: Level, tag: string, ...args: any[]) {
  const msg = args.map(a =>
    typeof a === 'object' ? (a instanceof Error ? a.message : JSON.stringify(a, null, 0)) : String(a)
  ).join(' ');

  const line = `[${timestamp()}] [${level}] [${tag}] ${msg}`;

  // Write to file
  stream.write(line + '\n');

  // Also write to stdout (with colours)
  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

interface LogWriter {
  (tag: string, ...args: any[]): void;
  log: (tag: string, ...args: any[]) => void;
  info: (tag: string, ...args: any[]) => void;
  warn: (tag: string, ...args: any[]) => void;
  error: (tag: string, ...args: any[]) => void;
  debug: (tag: string, ...args: any[]) => void;
}

const logger: LogWriter = ((tag: string, ...args: any[]) => write('INFO', tag, ...args)) as LogWriter;
logger.log = (tag: string, ...args: any[]) => write('INFO', tag, ...args);
logger.info = (tag: string, ...args: any[]) => write('INFO', tag, ...args);
logger.warn = (tag: string, ...args: any[]) => write('WARN', tag, ...args);
logger.error = (tag: string, ...args: any[]) => write('ERROR', tag, ...args);
logger.debug = (tag: string, ...args: any[]) => write('DEBUG', tag, ...args);

// Graceful shutdown
process.on('exit', () => { stream.end(); });
process.on('SIGINT', () => { stream.end(); process.exit(); });
process.on('SIGTERM', () => { stream.end(); process.exit(); });

export default logger;

export function flushLogs(): void {
  // For testing — force flush
}
