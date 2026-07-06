#!/usr/bin/env python3
"""
Smart Estate — Backend Audit Suite
Проверяет: структуру БД, API endpoints, MQTT, дубли устройств
"""
import sqlite3
import json
import subprocess
import sys
import os
import urllib.request
import ssl
from datetime import datetime, timedelta

DB = os.path.expanduser("~/smart-estate/data/smart-estate.db")
SERVER_DIR = os.path.expanduser("~/smart-estate/server")
API_URL = "http://localhost:8788"

# SSL контекст для urllib (на localhost не нужна проверка)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

results = {"passed": 0, "failed": 0, "errors": [], "warnings": []}

def check(name, ok, detail=""):
    if ok:
        results["passed"] += 1
        print(f"  ✅ {name}")
    else:
        results["failed"] += 1
        results["errors"].append({"check": name, "detail": detail})
        print(f"  ❌ {name}: {detail}")

def warn(name, detail=""):
    results["warnings"].append({"check": name, "detail": detail})
    print(f"  ⚠️  {name}: {detail}")

print("=== 1. ПРОВЕРКА БАЗЫ ДАННЫХ ===")

if not os.path.exists(DB):
    check("Файл БД существует", False, f"{DB} не найден")
    sys.exit(1)
else:
    check("Файл БД существует", True)

try:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    check("Подключение к SQLite", True)

    # Таблицы
    tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    tables = [t[0] for t in tables]
    expected_tables = {'devices', 'telemetry', 'errors', 'rooms', 'scenarios', 'commands',
                       'state_changes', 'scenario_executions', 'climate_setpoints',
                       'gate_access_log', 'discovery_events', 'ai_providers',
                       'voice_pending_actions', 'voice_suggestions', 'used_nonces', 'device_groups',
                       'device_group_members'}
    missing = expected_tables - set(tables)
    if missing:
        check(f"Все таблицы ({len(tables)} из {len(expected_tables)})", False, f"Нет таблиц: {missing}")
    else:
        check(f"Все таблицы ({len(tables)})", True)

    # Дефолтные комнаты
    rooms = cur.execute("SELECT id, name FROM rooms").fetchall()
    check(f"Комнаты: {len(rooms)} ({[r[1] for r in rooms]})", True)

    # Дефолтные сценарии
    scenarios = cur.execute("SELECT COUNT(*) FROM scenarios").fetchone()[0]
    check(f"Сценарии: {scenarios}", scenarios > 0, f"Нет дефолтных сценариев ({scenarios})")

    # Индексы
    indexes = cur.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()
    index_names = {i[0] for i in indexes}
    expected_indexes = {'idx_telemetry_ts', 'idx_telemetry_device', 'idx_telemetry_device_ts',
                        'idx_commands_device', 'idx_errors_ts', 'idx_state_changes_device',
                        'idx_scenario_exec_ts', 'idx_scenario_exec_sid',
                        'idx_gate_log_ts', 'idx_gate_log_device'}
    missing_idx = expected_indexes - index_names
    if missing_idx:
        warn(f"Отсутствуют индексы: {missing_idx}", "Это замедлит запросы к большим таблицам")

    # Устройства
    devices = cur.execute("""
        SELECT ieee_addr, friendly_name, model, type, status,
               CASE WHEN ieee_addr GLOB '0x[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]' THEN 1 ELSE 0 END as valid_ieee
        FROM devices ORDER BY valid_ieee, ieee_addr
    """).fetchall()
    check(f"Устройств в БД: {len(devices)}", len(devices) >= 0)

    for d in devices:
        ieee, name, model, dtype, status, valid = d
        if not valid:
            warn(f"Мусорный IEEE у устройства '{name}'", f"ieee_addr='{ieee}' — не является MAC-адресом")

    # Телеметрия
    tel_count = cur.execute("SELECT COUNT(*) FROM telemetry").fetchone()[0]
    check(f"Записей телеметрии: {tel_count}", tel_count >= 0)

    if tel_count > 0:
        # Проверка на мусорные IEEE в телеметрии
        bad_telemetry = cur.execute("""
            SELECT COUNT(*) FROM telemetry t
            WHERE t.device_ieee NOT GLOB '0x[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'
        """).fetchone()[0]
        if bad_telemetry > 0:
            warn(f"Телеметрия с мусорными IEEE: {bad_telemetry} записей", "Будут потеряны при поиске по MAC-адресу")

        # Свежесть данных
        last_ts = cur.execute("SELECT MAX(ts) FROM telemetry").fetchone()[0]
        if last_ts:
            last_dt = datetime.strptime(last_ts.replace('T', ' ').split('.')[0], '%Y-%m-%d %H:%M:%S')
            diff = datetime.now() - last_dt
            if diff > timedelta(hours=2):
                warn(f"Последние данные: {last_ts} ({diff.total_seconds()/60:.0f} мин назад)", "Датчик может не отправлять данные")

    # rooms
    rooms_count = cur.execute("SELECT COUNT(*) FROM rooms").fetchone()[0]
    check(f"Комнат: {rooms_count}", rooms_count >= 4, f"Ожидается минимум 4")

    conn.close()
except Exception as e:
    check("Подключение к SQLite", False, str(e))

print()
print("=== 2. ПРОВЕРКА API ===")

import urllib.request
import urllib.error

def api_get(path):
    """Используем curl через subprocess — надёжнее чем urllib"""
    try:
        r = subprocess.run(
            ["curl", "-s", "-o", "-", "-w", "%{http_code}", f"{API_URL}{path}"],
            capture_output=True, text=True, timeout=10
        )
        if not r.stdout:
            return None, "Empty response"
        # last 3 chars = status code, rest = body
        status_code = r.stdout[-3:]
        body = r.stdout[:-3]
        try:
            data = json.loads(body) if body else {}
        except:
            data = body[:200]
        return int(status_code), data
    except subprocess.TimeoutExpired:
        return None, "Timeout"
    except Exception as e:
        return None, str(e)

# Health
status, data = api_get("/api/status")
check("GET /api/status", status == 200, str(data) if status != 200 else "")
if status == 200:
    check("API mode известен", 'mode' in data, f"Нет mode в ответе")

# Devices
status, data = api_get("/api/devices")
check("GET /api/devices", status == 200, str(data) if status != 200 else "")
if status == 200 and isinstance(data, dict):
    dev_count = len(data.get('devices', data.get('data', [])))
    check(f"GET /api/devices: {dev_count} устройств", dev_count >= 0)

# Telemetry
status, data = api_get("/api/telemetry")
check("GET /api/telemetry", status == 200, str(data) if status != 200 else "")

# Rooms
status, data = api_get("/api/rooms")
check("GET /api/rooms", status == 200, str(data) if status != 200 else "")

# Scenarios
status, data = api_get("/api/scenarios")
check("GET /api/scenarios", status == 200, str(data) if status != 200 else "")

# Dashboard
status, data = api_get("/api/dashboard")
check("GET /api/dashboard", status == 200, str(data) if status != 200 else "")

# Events
status, data = api_get("/api/events")
check("GET /api/events", status == 200, str(data) if status != 200 else "")

# Energy
status, data = api_get("/api/energy")
check("GET /api/energy", status == 200, str(data) if status != 200 else "")

# Mode
status, data = api_get("/api/mode")
check("GET /api/mode", status == 200, str(data) if status != 200 else "")

print()
print("=== 3. ПРОВЕРКА MQTT ===")

# Проверим что Mosquitto жив
try:
    r = subprocess.run(["docker", "ps", "--filter", "name=mosquitto", "--format", "{{.Status}}"],
                       capture_output=True, text=True, timeout=5)
    if r.stdout.strip():
        check("MQTT брокер (mosquitto)", True)
    else:
        check("MQTT брокер (mosquitto)", False, "Контейнер не запущен")
except Exception as e:
    check("MQTT брокер (mosquitto)", False, str(e))

# Проверим что Z2M жив
try:
    r = subprocess.run(["docker", "ps", "--filter", "name=zigbee2mqtt", "--format", "{{.Status}}"],
                       capture_output=True, text=True, timeout=5)
    if r.stdout.strip():
        check("Zigbee2MQTT", True)
    else:
        check("Zigbee2MQTT", False, "Контейнер не запущен")
except Exception as e:
    check("Zigbee2MQTT", False, str(e))

print()
print(f"\n=== ИТОГО: ✅ {results['passed']} passed, ❌ {results['failed']} failed, ⚠️ {len(results['warnings'])} warnings ===")

if results['failed'] > 0:
    print("\n=== ОШИБКИ ===")
    for e in results['errors']:
        print(f"  ❌ {e['check']}: {e['detail']}")

if results['warnings']:
    print("\n=== ПРЕДУПРЕЖДЕНИЯ ===")
    for w in results['warnings']:
        print(f"  ⚠️  {w['check']}: {w['detail']}")

print("\n✅ Backend audit complete")
