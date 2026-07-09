import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  AlertCircle, AlertOctagon, AlertTriangle,
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp,
  BarChart3, Bell, BellOff, Briefcase,
  Calendar as CalendarIcon, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  CircleDot, Clock, Coins, CreditCard,
  DollarSign, Download, Edit,
  FileText, Filter, Flame, Folder,
  Home, Info, Landmark, Lightbulb, LineChart, ListChecks,
  LucideAngularModule, MessageCircle, MessageSquare, Minus, Moon, MoreVertical,
  Pencil, PieChart, PiggyBank, Plus,
  Receipt, RefreshCw, Repeat, RotateCcw,
  Search, Send, Settings, ShieldAlert, ShoppingBag, Smartphone,
  Sparkles, Sun, Target, Trash2,
  TrendingDown, TrendingUp, Wallet, X, Zap,
  Equal,
  Menu
} from 'lucide-angular';

export type IconName =
  | 'home' | 'message' | 'expense' | 'income' | 'card' | 'loan' | 'service'
  | 'subscription' | 'budget' | 'goal' | 'calendar' | 'planner' | 'settings'
  | 'plus' | 'minus' | 'edit' | 'trash' | 'search' | 'send' | 'check' | 'x'
  | 'arrow-left' | 'arrow-right' | 'arrow-up' | 'arrow-down' | 'chevron-down'
  | 'chevron-up' | 'chevron-left' | 'chevron-right' | 'more'
  | 'bell' | 'bell-off' | 'moon' | 'sun' | 'briefcase' | 'landmark' | 'lightbulb'
  | 'smartphone' | 'repeat' | 'target' | 'trending-up' | 'trending-down'
  | 'piggy-bank' | 'coins' | 'dollar-sign' | 'shield-alert' | 'alert-circle'
  | 'alert-triangle' | 'alert-octagon' | 'info' | 'check-circle' | 'sparkles'
  | 'flame' | 'zap' | 'wallet' | 'pie-chart' | 'bar-chart' | 'line-chart'
  | 'list-checks' | 'receipt' | 'file-text' | 'clock' | 'circle-dot'
  | 'refresh' | 'undo' | 'download' | 'shopping-bag' | 'filter'
  | 'pencil' | 'folder' | 'message-square' | 'calendar-days' | 'menu';

const ICONS: Record<IconName, any> = {
  home: Home,
  message: MessageCircle,
  expense: Wallet,
  income: Briefcase,
  card: CreditCard,
  loan: Landmark,
  service: Lightbulb,
  subscription: Repeat,
  budget: BarChart3,
  goal: Target,
  calendar: CalendarIcon,
  planner: ListChecks,
  settings: Settings,
  plus: Plus,
  minus: Minus,
  edit: Edit,
  trash: Trash2,
  search: Search,
  send: Send,
  check: Check,
  x: X,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  more: MoreVertical,
  bell: Bell,
  'bell-off': BellOff,
  moon: Moon,
  sun: Sun,
  briefcase: Briefcase,
  landmark: Landmark,
  lightbulb: Lightbulb,
  smartphone: Smartphone,
  repeat: Repeat,
  target: Target,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'piggy-bank': PiggyBank,
  coins: Coins,
  'dollar-sign': DollarSign,
  'shield-alert': ShieldAlert,
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  'alert-octagon': AlertOctagon,
  info: Info,
  'check-circle': CheckCircle2,
  sparkles: Sparkles,
  flame: Flame,
  zap: Zap,
  wallet: Wallet,
  'pie-chart': PieChart,
  'bar-chart': BarChart3,
  'line-chart': LineChart,
  'list-checks': ListChecks,
  receipt: Receipt,
  'file-text': FileText,
  clock: Clock,
  'circle-dot': CircleDot,
  refresh: RefreshCw,
  undo: RotateCcw,
  download: Download,
  'shopping-bag': ShoppingBag,
  filter: Filter,
  pencil: Pencil,
  folder: Folder,
  'message-square': MessageSquare,
  'calendar-days': CalendarDays,
  'menu': Menu
};

/**
 * Wrapper ligero sobre Lucide.
 * Uso: <app-icon name="home" [size]="20"></app-icon>
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `<lucide-angular [img]="icon" [size]="size" [strokeWidth]="strokeWidth" [color]="color"></lucide-angular>`,
  styles: [`
    :host { display: inline-flex; align-items: center; line-height: 0; }
  `]
})
export class IconComponent {
  @Input() name: IconName = 'home';
  @Input() size = 18;
  @Input() strokeWidth = 1.75;
  @Input() color: string | undefined;

  get icon(): any { return ICONS[this.name] ?? Home; }
}
