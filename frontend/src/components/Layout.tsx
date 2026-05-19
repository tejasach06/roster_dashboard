import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, LogOut, ClipboardList, Moon, Sun, Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface SidebarProps {
  onNavClick: () => void;
  user: { name?: string; role?: string; team_id?: number | null } | null;
  isAdmin: boolean;
  isDark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
}

function SidebarContent({ onNavClick, user, isAdmin, isDark, toggleTheme, onLogout }: SidebarProps) {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'accent-bg text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`;

  return (
    <>
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 accent-bg rounded-lg flex items-center justify-center">
            <ClipboardList size={16} className="text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Roster Manager</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavLink to="/" end className={navClass} onClick={onNavClick}>
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>

        {!isAdmin && user?.team_id && (
          <NavLink to={`/team/${user.team_id}/dashboard`} className={navClass} onClick={onNavClick}>
            <Users size={18} /> My Team
          </NavLink>
        )}

        {isAdmin && (
          <NavLink to="/settings" className={navClass} onClick={onNavClick}>
            <Settings size={18} /> Settings
          </NavLink>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-slate-700 space-y-3">
        <div className="flex items-center gap-3 px-1">
          <div className="w-8 h-8 accent-bg rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="overflow-hidden flex-1">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
          </div>
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm transition-colors"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const closeSidebar = () => setSidebarOpen(false);

  const sidebarProps: SidebarProps = {
    onNavClick: closeSidebar,
    user,
    isAdmin,
    isDark,
    toggleTheme,
    onLogout: handleLogout,
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-900">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Desktop sidebar — in normal flow */}
      <aside className="hidden md:flex w-64 bg-slate-900 flex-col shrink-0 border-r border-slate-800">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Mobile sidebar — fixed overlay drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 flex flex-col border-r border-slate-800 transition-transform duration-200 md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-end px-4 py-3 border-b border-slate-800">
          <button onClick={closeSidebar} className="p-1.5 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Main content area */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-7 h-7 accent-bg rounded-lg flex items-center justify-center">
              <ClipboardList size={14} className="text-white" />
            </div>
            <span className="text-white font-bold text-base tracking-tight">Roster Manager</span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-1.5 text-slate-400 hover:text-white transition-colors"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  );
}
