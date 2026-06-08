// components/ui/Icon.tsx
//
// Système d'icônes line sobres (lucide-react) — remplace progressivement les
// emoji pour un style « sobre Apple/Google ». Toute l'app passe par cette
// abstraction (noms sémantiques) au lieu d'importer lucide partout → un seul
// endroit pour changer de set, de taille ou d'épaisseur de trait.
//
// Les icônes lucide tracent en `stroke="currentColor"` : la couleur est donc
// héritée du parent (className text-*), comme les emoji ne le permettaient pas.
import React from 'react';
import {
  LayoutDashboard, CreditCard, Scale, LineChart, TrendingUp, TrendingDown,
  Palmtree, Home, Baby, Route, Landmark, Wallet, Compass, Target, Wrench,
  Settings, MoreHorizontal, Zap, Eye, EyeOff, Plane,
  Bitcoin, Check, Sparkles, Globe, Thermometer, Wind, Sprout, PartyPopper,
  Dices, Building2, Banknote, Briefcase, BarChart3, Download, Package, Search,
  CircleDot, HeartPulse,
  CalendarDays, GraduationCap, Shield, ClipboardList, Users, BookOpen,
  LifeBuoy, Bot, Cloud, FileText, Percent, Clock,
  Trash2, AlertTriangle, Smartphone, Link, Lock, Unlock,
  Heart, Hammer, Car, Rocket, ShoppingCart, Ambulance,
  X, SendHorizontal, FlaskConical, ChevronLeft, ChevronRight, Trophy,
  Music, Tv, Wifi, Plus, Minus, Pencil, RefreshCw, Cpu, Gem, Factory,
  type LucideIcon,
} from 'lucide-react';

/** Registre nom sémantique → composant lucide. Étendu au fil de la migration. */
const REGISTRY = {
  // Onglets
  dashboard: LayoutDashboard,
  transactions: CreditCard,
  budget: Scale,
  future: LineChart,
  actions: Zap,
  investments: TrendingUp,
  retirement: Palmtree,
  'real-estate': Home,
  child: Baby,
  'life-projects': Route,
  plane: Plane,
  tax: Landmark,
  debt: TrendingDown,
  settings: Settings,
  // Groupes de navigation
  'group-money': Wallet,
  'group-plan': Compass,
  'group-goals': Target,
  'group-tools': Wrench,
  // KPI / sections / modales
  money: Wallet,
  cash: Banknote,
  portfolio: Briefcase,
  chart: BarChart3,
  bank: Building2,
  bitcoin: Bitcoin,
  goal: Target,
  sparkles: Sparkles,
  health: HeartPulse,
  sprout: Sprout,
  globe: Globe,
  thermometer: Thermometer,
  wind: Wind,
  dice: Dices,
  celebrate: PartyPopper,
  package: Package,
  search: Search,
  import: Download,
  check: Check,
  clock: Clock,
  trash: Trash2,
  alert: AlertTriangle,
  smartphone: Smartphone,
  link: Link,
  lock: Lock,
  unlock: Unlock,
  heart: Heart,
  hammer: Hammer,
  car: Car,
  rocket: Rocket,
  cart: ShoppingCart,
  ambulance: Ambulance,
  status: CircleDot,
  // Titres de cartes / sections
  calendar: CalendarDays,
  graduation: GraduationCap,
  shield: Shield,
  building: Building2,
  clipboard: ClipboardList,
  users: Users,
  book: BookOpen,
  compass: Compass,
  lifebuoy: LifeBuoy,
  bot: Bot,
  cloud: Cloud,
  document: FileText,
  rate: Percent,
  // Divers
  more: MoreHorizontal,
  eye: Eye,
  'eye-off': EyeOff,
  close: X,
  send: SendHorizontal,
  flask: FlaskConical,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  trophy: Trophy,
  music: Music,
  tv: Tv,
  wifi: Wifi,
  plus: Plus,
  minus: Minus,
  edit: Pencil,
  refresh: RefreshCw,
  cpu: Cpu,
  gem: Gem,
  factory: Factory,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

interface IconProps {
  name: IconName;
  /** Taille en px (carré). Défaut 18 — lisible à côté d'un libellé text-meta. */
  size?: number;
  className?: string;
  /** Épaisseur du trait. 1.75 = sobre/raffiné (défaut lucide : 2). */
  strokeWidth?: number;
}

/**
 * Icône line décorative. `aria-hidden` par défaut : le sens est porté par le
 * libellé adjacent (ou un aria-label sur le contrôle), jamais par l'icône seule.
 */
export const Icon: React.FC<IconProps> = ({ name, size = 18, className, strokeWidth = 1.75 }) => {
  const Cmp = REGISTRY[name];
  return <Cmp size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
};
