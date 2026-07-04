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
  // Устройства — существующие
  Lightbulb, Radio, Plug, DoorOpen, Thermometer, Lock, Fan, CircleDot,
  // Комнаты
  Armchair, CookingPot, Bed, Bath, TreePine, Car, Monitor, Package2, Waves, Flower2,
  // Общие
  Home, MapPin, RefreshCw, User, CheckCircle2, AlertTriangle,
  // ═══ НОВЫЕ: датчики и устройства ═══
  // Воздух / климат
  Wind, AirVent, CloudFog, ThermometerSnowflake,
  // Влага
  Droplet, Droplets,
  // Движение / присутствие
  PersonStanding, UserRoundCheck,
  // Безопасность
  AlarmSmoke, Flame, Shield,
  // Окружение
  SunMedium, Fence, DoorClosed,
  // Исполнительные
  LockKeyhole, Camera, Bell, Speaker,
  ToggleLeft, Blinds, PanelLeft,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

// ── Типы устройств ──────────────────────────────────────

export const DEVICE_TYPE_ICONS: Record<string, LucideIcon> = {
  // Датчики окон / дверей
  window_sensor: DoorOpen,
  door_sensor: DoorClosed,
  gate_sensor: Fence,

  // Датчики воздуха / климата
  air_monitor: Wind,
  temp_sensor: Thermometer,
  humid_sensor: Droplets,
  co2_sensor: AirVent,
  pm_sensor: CloudFog,
  climate: ThermometerSnowflake,

  // Датчики движения
  motion_sensor: PersonStanding,
  presence_sensor: UserRoundCheck,

  // Датчики безопасности
  leak_sensor: Droplet,
  smoke_sensor: AlarmSmoke,
  gas_sensor: Flame,

  // Датчики окружения
  light_sensor: SunMedium,

  // Исполнительные устройства
  light: Lightbulb,
  plug: Plug,
  switch: ToggleLeft,
  shutter: Blinds,
  curtain: PanelLeft,
  lock: LockKeyhole,
  fan: Fan,
  camera: Camera,
  bell: Bell,
  speaker: Speaker,

  // Резерв для sensor (старый тип — поддержка)
  sensor: Radio,
  // Старые типы (поддержка обратной совместимости)
  gate: DoorOpen,
};

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  window_sensor: 'Окно',
  door_sensor: 'Дверь',
  gate_sensor: 'Ворота',
  air_monitor: 'Монитор воздуха',
  temp_sensor: 'Термометр',
  humid_sensor: 'Гигрометр',
  co2_sensor: 'Датчик CO₂',
  pm_sensor: 'Датчик PM2.5',
  climate: 'Климат',
  motion_sensor: 'Движение',
  presence_sensor: 'Присутствие',
  leak_sensor: 'Протечка',
  smoke_sensor: 'Дым',
  gas_sensor: 'Газ',
  light_sensor: 'Освещённость',
  light: 'Свет',
  plug: 'Розетка',
  switch: 'Выключатель',
  shutter: 'Жалюзи',
  curtain: 'Шторы',
  lock: 'Замок',
  fan: 'Вентиляция',
  camera: 'Камера',
  bell: 'Звонок',
  speaker: 'Колонка',
  sensor: 'Датчик',
  gate: 'Ворота',
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

// ═══ МАССИВ ДЛЯ ЭКРАНА ВЫБОРА ТИПА ДАТЧИКА ═══

export interface DeviceTypeOption {
  type: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

/** Все типы датчиков/устройств для экрана добавления */
export const DEVICE_TYPE_OPTIONS: DeviceTypeOption[] = [
  // ── Окна / Двери ──
  { type: 'window_sensor', icon: DoorOpen, label: 'Окно', description: 'Датчик открытия окна' },
  { type: 'door_sensor', icon: DoorClosed, label: 'Дверь', description: 'Датчик открытия двери' },
  { type: 'gate_sensor', icon: Fence, label: 'Ворота', description: 'Датчик ворот' },

  // ── Воздух / Климат ──
  { type: 'air_monitor', icon: Wind, label: 'Монитор воздуха', description: 'CO₂, VOC, температура, влажность' },
  { type: 'temp_sensor', icon: Thermometer, label: 'Термометр', description: 'Температура' },
  { type: 'humid_sensor', icon: Droplets, label: 'Гигрометр', description: 'Влажность' },
  { type: 'co2_sensor', icon: AirVent, label: 'CO₂', description: 'Углекислый газ' },
  { type: 'pm_sensor', icon: CloudFog, label: 'PM2.5', description: 'Пыль / мелкие частицы' },

  // ── Движение ──
  { type: 'motion_sensor', icon: PersonStanding, label: 'Движение', description: 'PIR-датчик движения' },
  { type: 'presence_sensor', icon: UserRoundCheck, label: 'Присутствие', description: 'mmWave — точное присутствие' },

  // ── Безопасность ──
  { type: 'leak_sensor', icon: Droplet, label: 'Протечка', description: 'Датчик протечки воды' },
  { type: 'smoke_sensor', icon: AlarmSmoke, label: 'Дым', description: 'Датчик дыма / пожара' },
  { type: 'gas_sensor', icon: Flame, label: 'Газ', description: 'Утечка газа' },

  // ── Окружение ──
  { type: 'light_sensor', icon: SunMedium, label: 'Освещённость', description: 'Уровень освещения' },

  // ── Исполнительные ──
  { type: 'light', icon: Lightbulb, label: 'Свет', description: 'Лампа / светильник' },
  { type: 'plug', icon: Plug, label: 'Розетка', description: 'Умная розетка' },
  { type: 'switch', icon: ToggleLeft, label: 'Выключатель', description: 'Выключатель' },
  { type: 'shutter', icon: Blinds, label: 'Жалюзи', description: 'Рольставни / жалюзи' },
  { type: 'curtain', icon: PanelLeft, label: 'Шторы', description: 'Умные шторы' },
  { type: 'lock', icon: LockKeyhole, label: 'Замок', description: 'Умный замок' },
  { type: 'fan', icon: Fan, label: 'Вентиляция', description: 'Вытяжка / бризер' },
  { type: 'camera', icon: Camera, label: 'Камера', description: 'Видеонаблюдение' },
  { type: 'bell', icon: Bell, label: 'Звонок', description: 'Умный звонок' },
  { type: 'speaker', icon: Speaker, label: 'Колонка', description: 'Умная колонка' },
];

// ── Варианты положения для окон ─────────────────────────

export interface PositionOption {
  key: string;
  label: string;
}

export const WINDOW_POSITION_OPTIONS: PositionOption[] = [
  { key: 'left', label: 'Левое' },
  { key: 'right', label: 'Правое' },
  { key: 'center', label: 'Центральное' },
  { key: '1', label: 'Окно №1' },
  { key: '2', label: 'Окно №2' },
  { key: '3', label: 'Окно №3' },
  { key: '4', label: 'Окно №4' },
];
