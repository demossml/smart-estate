/**
 * Единый маппинг иконок Lucide для всего приложения.
 * Все эмодзи заменены на Lucide-иконки.
 *
 * Использование:
 *   import { DEVICE_TYPE_ICONS, ROOM_ICONS, ROOM_ICON_OPTIONS } from '../lib/icon-map';
 *   const Icon = DEVICE_TYPE_ICONS[device.type] || CircleDot;
 *   <Icon size={22} />
 */

import {
  // Устройства
  Lightbulb, Radio, Plug, DoorOpen, Thermometer, Lock, CircleDot,
  // Комнаты
  Armchair, CookingPot, Bed, Bath, TreePine, Car, Monitor, Package2, Waves, Flower2,
  // Общие
  Home, MapPin, RefreshCw, User, CheckCircle2, AlertTriangle,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

// ── Типы устройств ──────────────────────────────────────

export const DEVICE_TYPE_ICONS: Record<string, LucideIcon> = {
  light: Lightbulb,
  sensor: Radio,
  plug: Plug,
  gate: DoorOpen,
  climate: Thermometer,
  lock: Lock,
};

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  light: 'Свет',
  sensor: 'Датчик',
  plug: 'Розетка',
  gate: 'Ворота',
  climate: 'Климат',
  lock: 'Замок',
};

// ── Комнаты (ключ = кириллическое имя из БД) ───────────

export const ROOM_ICONS: Record<string, LucideIcon> = {
  'гостиная': Armchair,
  'кухня': CookingPot,
  'спальня': Bed,
  'ванная': Bath,
  'коридор': DoorOpen,
  'улица': TreePine,
  'гараж': Car,
  'кабинет': Monitor,
  'кладовая': Package2,
  'баня': Waves,
  'сад': Flower2,
  'терраса': TreePine,
  'балкон': Flower2,
  'прихожая': DoorOpen,
  'чердак': Package2,
  'подвал': Package2,
  'техзона': Monitor,
};

/**
 * Для создания новой комнаты — сетка иконок 4×4.
 * key сохраняется в БД, icon — Lucide-компонент, label — человеческое название.
 */
export interface RoomIconOption {
  key: string;
  icon: LucideIcon;
  label: string;
}

export const ROOM_ICON_OPTIONS: RoomIconOption[] = [
  { key: 'armchair', icon: Armchair, label: 'Гостиная' },
  { key: 'cooking-pot', icon: CookingPot, label: 'Кухня' },
  { key: 'bed', icon: Bed, label: 'Спальня' },
  { key: 'bath', icon: Bath, label: 'Ванная' },
  { key: 'door-open', icon: DoorOpen, label: 'Коридор' },
  { key: 'tree-pine', icon: TreePine, label: 'Улица' },
  { key: 'car', icon: Car, label: 'Гараж' },
  { key: 'monitor', icon: Monitor, label: 'Кабинет' },
  { key: 'package', icon: Package2, label: 'Кладовая' },
  { key: 'waves', icon: Waves, label: 'Баня' },
  { key: 'flower', icon: Flower2, label: 'Сад' },
  { key: 'home', icon: Home, label: 'Дом' },
  { key: 'lightbulb', icon: Lightbulb, label: 'Светлая' },
  { key: 'thermometer', icon: Thermometer, label: 'Котельная' },
  { key: 'plug', icon: Plug, label: 'Техзона' },
  { key: 'map-pin', icon: MapPin, label: 'Другое' },
];

/** Получить Lucide-иконку по ключу из БД */
export function getRoomIcon(key: string): LucideIcon {
  const opt = ROOM_ICON_OPTIONS.find(o => o.key === key);
  return opt?.icon || Home;
}

/** Получить имя комнаты-образца по ключу */
export function getRoomLabel(key: string): string {
  const opt = ROOM_ICON_OPTIONS.find(o => o.key === key);
  return opt?.label || key;
}

// ── Реэкспорт часто используемых ────────────────────────

export { Home, User, CheckCircle2, AlertTriangle, MapPin, RefreshCw, CircleDot };
