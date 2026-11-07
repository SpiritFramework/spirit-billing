import {
  Box,
  Bug,
  Car,
  CircleDollarSign,
  Cpu,
  CreditCard,
  Crosshair,
  Fish,
  Gamepad2,
  Globe,
  Hammer,
  Headphones,
  Hexagon,
  LifeBuoy,
  MessageCircle,
  Mountain,
  Plane,
  type LucideIcon,
  Radio,
  Receipt,
  Rocket,
  Server,
  Settings2,
  Shield,
  Swords,
  UserRound,
  Wallet,
  Wrench,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

const ICONS: Record<string, LucideIcon> = {
  gamepad: Gamepad2,
  server: Server,
  cpu: Cpu,
  globe: Globe,
  box: Box,
  zap: Zap,
  shield: Shield,
  rocket: Rocket,
  sword: Swords,
  pickaxe: Hammer,
  car: Car,
  plane: Plane,
  fish: Fish,
  mountain: Mountain,
  music: Headphones,
  radio: Radio,
  target: Crosshair,
  hexagon: Hexagon,
  'life-buoy': LifeBuoy,
  message: MessageCircle,
  billing: CircleDollarSign,
  'credit-card': CreditCard,
  wallet: Wallet,
  receipt: Receipt,
  bug: Bug,
  wrench: Wrench,
  settings: Settings2,
  user: UserRound,
};

export function CategoryIcon({ name, size = 22 }: { name?: string | null; size?: number }) {
  const Icon = ICONS[name || 'gamepad'] ?? Gamepad2;
  return <Icon size={size} />;
}

export function CategoryMark({
  icon,
  logoUrl,
  color = '#6366f1',
  size = 48,
  className = '',
}: {
  icon?: string | null;
  logoUrl?: string | null;
  color?: string;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const logo = logoUrl?.trim();
  const showLogo = Boolean(logo && /^https?:\/\//i.test(logo) && !broken);

  if (showLogo) {
    return (
      <img
        src={logo!}
        alt=""
        className={`cat-mark cat-mark--logo ${className}`.trim()}
        style={{ width: size, height: size, ['--cat-color' as string]: color }}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div
      className={`cat-mark cat-mark--icon ${className}`.trim()}
      style={{ width: size, height: size, ['--cat-color' as string]: color }}
    >
      <CategoryIcon name={icon} size={Math.round(size * 0.45)} />
    </div>
  );
}

export const CATEGORY_COLOR_OPTIONS = [
  '#6366f1',
  '#22d3ee',
  '#22c55e',
  '#f59e0b',
  '#f43f5e',
  '#a855f7',
  '#3b82f6',
  '#14b8a6',
];

export const CATEGORY_ICON_OPTIONS = Object.keys(ICONS);
