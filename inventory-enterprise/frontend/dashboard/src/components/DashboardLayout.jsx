import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Shield,
  Brain,
  Lock,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Activity,
  Sparkles,
  HeartPulse,
  FileText,
  ClipboardCheck,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { websocket } from '../services/websocket';
import { cn } from '../lib/utils';
import LegalFooter from './LegalFooter';

const navigation = [
  { name: 'Overview', href: '/dashboard/overview', icon: LayoutDashboard },
  { name: 'Inventory Count', href: '/dashboard/inventory-count', icon: ClipboardCheck },
  { name: 'Tenants', href: '/dashboard/tenants', icon: Users },
  { name: 'Roles', href: '/dashboard/roles', icon: Shield },
  { name: 'AI Performance', href: '/dashboard/ai', icon: Brain },
  { name: 'Security', href: '/dashboard/security', icon: Lock },
  { name: 'AI Learning', href: '/dashboard/ai-learning', icon: Sparkles },
  { name: 'System Health', href: '/dashboard/health', icon: HeartPulse },
  { name: 'Governance', href: '/dashboard/governance', icon: FileText },
];

export default function DashboardLayout() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isConnected = websocket.isConnected();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center shadow-glow-sm">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold gradient-text">
                Inventory
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;

              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center space-x-3 px-3 py-2.5 rounded-lg font-medium transition-all duration-200',
                    isActive
                      ? 'bg-gradient-primary text-white shadow-glow-sm'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* User info & logout */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
            {/* WebSocket status */}
            <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <Activity
                className={cn(
                  'w-4 h-4',
                  isConnected
                    ? 'text-green-500 animate-pulse'
                    : 'text-gray-400'
                )}
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {isConnected ? 'Real-time Connected' : 'Disconnected'}
              </span>
            </div>

            {/* User info */}
            <div className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white font-medium text-sm">
                  {user?.email?.[0].toUpperCase()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user?.email}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user?.role || 'User'}
                </p>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center space-x-3 w-full px-3 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 backdrop-blur-sm bg-white/80 dark:bg-gray-900/80">
          <div className="flex items-center justify-between h-full px-6">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Menu className="w-6 h-6 text-gray-700 dark:text-gray-300" />
            </button>

            <div className="flex-1 lg:flex-none">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                {navigation.find((item) => item.href === location.pathname)?.name || 'Dashboard'}
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? (
                  <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                ) : (
                  <Sun className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 min-h-[calc(100vh-4rem-80px)]">
          <Outlet />
        </main>

        {/* Legal Footer */}
        <LegalFooter variant="default" />
      </div>
    </div>
  );
}
