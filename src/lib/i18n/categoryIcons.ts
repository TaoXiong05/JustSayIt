import {
  Briefcase,
  Car,
  CreditCard,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Package,
  Plane,
  Shirt,
  ShoppingBag,
  TrendingUp,
  Undo2,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { CategoryKey } from '@/lib/ai/schema';

/**
 * 分类 → lucide 图标（Global Constraint 9：方案触及到的组件一律用
 * lucide-react，不再用 emoji）。与 CATEGORY_LABELS 同结构，
 * `Record<CategoryKey, ...>` 的穷尽性检查保证新增分类时这里必须补图标。
 */
export const CATEGORY_ICONS: Record<CategoryKey, LucideIcon> = {
  FOOD: UtensilsCrossed,
  TRANSPORT: Car,
  SHOPPING: ShoppingBag,
  HOUSING: Home,
  DAILY: Shirt,
  ENTERTAINMENT: Film,
  MEDICAL: HeartPulse,
  EDUCATION: GraduationCap,
  SOCIAL: Users,
  SUBSCRIPTION: CreditCard,
  TRAVEL: Plane,
  SALARY: Wallet,
  SIDE_INCOME: Briefcase,
  INVESTMENT: TrendingUp,
  REFUND: Undo2,
  GIFT: Gift,
  OTHER: Package,
};