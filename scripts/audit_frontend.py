#!/usr/bin/env python3
"""
Smart Estate — Frontend Audit Suite
Проверяет: структуру проекта, конфигурацию сборки, размеры файлов, PWA
"""
import os
import json
import subprocess
import sys

CLIENT_DIR = os.path.expanduser("~/smart-estate/client-app")
FILES_DIR = os.path.join(CLIENT_DIR, "src")

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

print("=== 1. СТРУКТУРА ПРОЕКТА ===")

# package.json
pkg_path = os.path.join(CLIENT_DIR, "package.json")
check("package.json существует", os.path.exists(pkg_path))
if os.path.exists(pkg_path):
    with open(pkg_path) as f:
        pkg = json.load(f)
    check("Есть build скрипт", "build" in (pkg.get("scripts") or {}), str(pkg.get("scripts", {})))
    deps = pkg.get("dependencies", {})
    check("React установлен", "react" in deps)
    check("react-router-dom установлен", "react-router-dom" in deps)
    check("lucide-react установлен", "lucide-react" in deps)

# vite.config
vite_path = os.path.join(CLIENT_DIR, "vite.config.ts")
check("vite.config.ts существует", os.path.exists(vite_path))
with open(vite_path) as f:
    vite_content = f.read()
check("Есть PWA плагин", "vite-plugin-pwa" in vite_content, "Без PWA не будет установки на телефон")
check("Есть Tailwind CSS", "tailwindcss" in vite_content)

# tsconfig
tsconfig_path = os.path.join(CLIENT_DIR, "tsconfig.json")
check("tsconfig.json существует", os.path.exists(tsconfig_path))
if os.path.exists(tsconfig_path):
    with open(tsconfig_path) as f:
        ts = json.load(f)
    strict = ts.get("compilerOptions", {}).get("strict", False)
    if strict:
        check("strict mode включён", True)
    else:
        warn("strict mode выключен", "Может пропускать ошибки типов")

# index.html
index_path = os.path.join(CLIENT_DIR, "index.html")
check("index.html существует", os.path.exists(index_path))
if os.path.exists(index_path):
    with open(index_path) as f:
        index = f.read()
    check("Есть PWA manifest link", 'manifest' in index or 'manifest.webmanifest' in index)
    check("Есть Telegram WebApp скрипт", 'telegram-web-app.js' in index or 'tapps' in index)

print()
print("=== 2. ФАЙЛЫ ПРОЕКТА ===")

all_files = []
for root, dirs, files in os.walk(FILES_DIR):
    for f in files:
        if f.endswith(('.ts', '.tsx', '.css')):
            path = os.path.join(root, f)
            size = os.path.getsize(path)
            all_files.append((path, size))

total_size = sum(s for _, s in all_files)
check(f"Файлов .ts/.tsx: {len(all_files)}", len(all_files) > 0)
check(f"Общий размер: {total_size/1024:.0f} KB", total_size > 0)

# Поиск дублирующихся компонентов
duplicates = []
names_seen = {}
for path, size in all_files:
    name = os.path.basename(path)
    if name in names_seen:
        duplicates.append((name, names_seen[name], path))
    names_seen[name] = path

if duplicates:
    warn("Дублирующиеся файлы", "\n".join([f"  {n}: {p1} / {p2}" for n, p1, p2 in duplicates]))

# Самые большие файлы
print()
print("=== 3. КРУПНЫЕ ФАЙЛЫ (>10KB) ===")
large_files = [(p, s) for p, s in all_files if s > 10000]
large_files.sort(key=lambda x: -x[1])
for path, size in large_files:
    rel = path.replace(FILES_DIR, "src")
    print(f"  {rel:60s} {size/1024:>6.1f} KB")

if len(large_files) > 10:
    warn(f"Много крупных файлов: {len(large_files)} >10KB", "Возможно стоит разбить на модули")

print()
print("=== 4. ПРОВЕРКА ИМПОРТОВ ===")

# Проверка что все импорты ведут на существующие файлы
bad_imports = []
for path, size in all_files:
    with open(path) as f:
        content = f.read()
    for line in content.split('\n'):
        if line.strip().startswith('import ') and ('from' in line):
            # Извлекаем путь
            parts = line.split("'")
            if len(parts) < 2:
                parts = line.split('"')
            if len(parts) >= 2:
                imp_path = parts[1]
                # Пропускаем внешние пакеты и относительные пути
                if imp_path.startswith('.') or imp_path.startswith('/'):
                    # Проверяем что файл существует
                    dir_path = os.path.dirname(path)
                    # Пробуем разные расширения
                    found = False
                    for ext in ['.ts', '.tsx', '', '/index.ts', '/index.tsx']:
                        candidate = os.path.normpath(os.path.join(dir_path, imp_path + ext))
                        if os.path.exists(candidate):
                            found = True
                            break
                    if not found:
                        bad_imports.append((path, line.strip()))

if bad_imports:
    for f, imp in bad_imports[:5]:
        warn(f"Импорт в никуда: {imp}", f"в {f.replace(FILES_DIR, '')}")

print()
print("=== 5. PWA КОНФИГУРАЦИЯ ===")

pwa_manifest = os.path.join(CLIENT_DIR, "public", "manifest.webmanifest")
if os.path.exists(pwa_manifest):
    check("manifest.webmanifest существует", True)
    with open(pwa_manifest) as f:
        manifest = json.load(f)
    check("Есть name", "name" in manifest)
    check("Есть icons", len(manifest.get("icons", [])) > 0, "Нет иконок для PWA")
    check("Есть start_url", "start_url" in manifest)
else:
    warn("Нет manifest.webmanifest", "PWA не будет работать")

sw_path = os.path.join(CLIENT_DIR, "src", "pwa.ts")
if os.path.exists(sw_path):
    check("pwa.ts (service worker) существует", True)
else:
    warn("Нет service worker файла", "Возможно он встроен в vite-plugin-pwa")

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

print("\n✅ Frontend audit complete")
