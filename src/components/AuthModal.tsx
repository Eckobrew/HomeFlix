'use client';

import React, { useState, useEffect } from 'react';
import { Lock, User, Eye, EyeOff, AlertCircle, ShieldCheck, Globe, Loader2 } from 'lucide-react';

interface AuthModalProps {
  onSuccess: () => void;
  appName?: string;
}

interface UserOption {
  id: string;
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  initials?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess, appName }) => {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandName = appName || process.env.NEXT_PUBLIC_APP_NAME || 'HomeStream';

  useEffect(() => {
    // Fetch Jellyfin users for quick profile login
    fetch('/api/auth?action=users')
      .then((res) => res.json())
      .then((data) => {
        if (data.users && Array.isArray(data.users) && data.users.length > 0) {
          setUsers(data.users);
          setSelectedUsername(data.users[0].name);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUsername.trim()) {
      setError('Please select or enter a username');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          username: selectedUsername.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Authentication failed. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      onSuccess();
    } catch (err) {
      setError('Connection to server failed. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md px-4 select-none">
      <div className="relative w-full max-w-md bg-[#141414] border border-neutral-800 rounded-xl shadow-2xl p-6 sm:p-8 space-y-6 animate-fade-in">
        {/* Brand Header */}
        <div className="text-center space-y-1">
          <span className="text-3xl font-black tracking-wider text-red-600 uppercase">
            {brandName}
          </span>
          <div className="flex items-center justify-center space-x-1.5 text-xs text-neutral-400 font-medium pt-1">
            <Globe size={13} className="text-amber-400" />
            <span>External Internet Connection</span>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-neutral-900/80 border border-neutral-700/60 rounded-lg p-3 text-xs text-neutral-300 flex items-start space-x-2.5">
          <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            You are connecting outside your local network / Tailscale. Please sign in with your Jellyfin account to continue.
          </p>
        </div>

        {error && (
          <div className="bg-red-950/70 border border-red-500/50 rounded-lg p-3 text-xs text-red-200 flex items-start space-x-2.5">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* User selector chips */}
          {users.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Select Jellyfin User
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto no-scrollbar">
                {users.map((u) => {
                  const isSelected = selectedUsername.toLowerCase() === u.name.toLowerCase();
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUsername(u.name);
                        setError(null);
                      }}
                      className={`flex items-center space-x-2.5 p-2 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-red-600 bg-red-600/10 text-white ring-1 ring-red-600'
                          : 'border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-700'
                      }`}
                    >
                      <div className="w-8 h-8 rounded shrink-0 overflow-hidden bg-neutral-800 flex items-center justify-center text-xs font-bold text-white">
                        {u.avatarUrl ? (
                          <img
                            src={u.avatarUrl}
                            alt={u.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className={u.avatarColor ? `w-full h-full flex items-center justify-center bg-gradient-to-tr ${u.avatarColor}` : 'bg-red-600 w-full h-full flex items-center justify-center'}>
                            {u.initials || u.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium truncate capitalize">{u.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Username Input if not selecting from list */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Username
            </label>
            <div className="relative">
              <input
                type="text"
                value={selectedUsername}
                onChange={(e) => setSelectedUsername(e.target.value)}
                placeholder="Jellyfin Username"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
                required
              />
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Jellyfin Password"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg py-2.5 pl-9 pr-10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
              />
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg text-sm transition-colors flex items-center justify-center space-x-2 shadow-lg hover:shadow-red-600/30 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Verifying with Jellyfin...</span>
              </>
            ) : (
              <span>Sign In to {brandName}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
