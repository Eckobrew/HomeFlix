'use client';

import React, { useState, useEffect } from 'react';
import { useProfile } from '@/context/ProfileContext';
import {
  Server,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  Download,
} from 'lucide-react';

interface InitialSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
  initialStep?: 1 | 2;
}

export const InitialSetupModal: React.FC<InitialSetupModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  initialStep = 1,
}) => {
  const {
    profiles,
    needsSetup,
    importProfiles,
    fetchAvailableJellyfinUsers,
  } = useProfile();

  const [step, setStep] = useState<1 | 2>(initialStep);

  // Server credentials form state
  const [jellyfinUrl, setJellyfinUrl] = useState('');
  const [jellyfinApiKey, setJellyfinApiKey] = useState('');
  const [showJellyfinKey, setShowJellyfinKey] = useState(false);
  const [seerrUrl, setSeerrUrl] = useState('');
  const [seerrApiKey, setSeerrApiKey] = useState('');
  const [showSeerrKey, setShowSeerrKey] = useState(false);

  // Test status states
  const [isTestingJellyfin, setIsTestingJellyfin] = useState(false);
  const [jellyfinTestStatus, setJellyfinTestStatus] = useState<{
    success?: boolean;
    serverName?: string;
    version?: string;
    error?: string;
  } | null>(null);

  const [isTestingSeerr, setIsTestingSeerr] = useState(false);
  const [seerrTestStatus, setSeerrTestStatus] = useState<{
    success?: boolean;
    version?: string;
    error?: string;
  } | null>(null);

  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configError, setConfigError] = useState('');

  // Step 2 profile selection state
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

  // Load existing server config on open
  useEffect(() => {
    if (isOpen) {
      fetch('/api/config')
        .then((res) => res.json())
        .then((cfg) => {
          if (cfg.jellyfinUrl) setJellyfinUrl(cfg.jellyfinUrl);
          if (cfg.seerrUrl) setSeerrUrl(cfg.seerrUrl);
          if (cfg.hasJellyfinKey) {
            setJellyfinTestStatus({ success: true, serverName: 'Configured' });
          }
          if (cfg.hasSeerrKey) {
            setSeerrTestStatus({ success: true });
          }

          // If Jellyfin is already configured and setup is needed for profiles, jump to step 2
          if (cfg.isJellyfinConfigured && needsSetup) {
            setStep(2);
          } else {
            setStep(initialStep);
          }
        })
        .catch(console.error);
    }
  }, [isOpen, needsSetup, initialStep]);

  // Load available Jellyfin users when reaching step 2
  useEffect(() => {
    if (isOpen && step === 2) {
      setIsLoadingUsers(true);
      setImportError('');
      fetchAvailableJellyfinUsers()
        .then((users) => {
          setAvailableUsers(users);
          if (users.length > 0) {
            // Default select all users
            setSelectedUserIds(users.map((u) => u.id));
          }
        })
        .finally(() => setIsLoadingUsers(false));
    }
  }, [isOpen, step, fetchAvailableJellyfinUsers]);

  if (!isOpen) return null;

  // Test Jellyfin server connection
  const handleTestJellyfin = async () => {
    if (!jellyfinUrl.trim()) return;
    setIsTestingJellyfin(true);
    setJellyfinTestStatus(null);
    try {
      const res = await fetch('/api/config?action=test-jellyfin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: jellyfinUrl.trim(), apiKey: jellyfinApiKey.trim() }),
      });
      const data = await res.json();
      setJellyfinTestStatus(data);
    } catch {
      setJellyfinTestStatus({ success: false, error: 'Connection failed' });
    } finally {
      setIsTestingJellyfin(false);
    }
  };

  // Test Seerr server connection
  const handleTestSeerr = async () => {
    if (!seerrUrl.trim()) return;
    setIsTestingSeerr(true);
    setSeerrTestStatus(null);
    try {
      const res = await fetch('/api/config?action=test-seerr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: seerrUrl.trim(), apiKey: seerrApiKey.trim() }),
      });
      const data = await res.json();
      setSeerrTestStatus(data);
    } catch {
      setSeerrTestStatus({ success: false, error: 'Connection failed' });
    } finally {
      setIsTestingSeerr(false);
    }
  };

  // Save server configuration and move to Step 2 (Profiles)
  const handleSaveServers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jellyfinUrl.trim()) {
      setConfigError('Jellyfin URL is required');
      return;
    }

    try {
      setIsSavingConfig(true);
      setConfigError('');

      const res = await fetch('/api/config?action=save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jellyfinUrl: jellyfinUrl.trim(),
          jellyfinApiKey: jellyfinApiKey.trim(),
          seerrUrl: seerrUrl.trim(),
          seerrApiKey: seerrApiKey.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save configuration');
      }

      // Move to step 2 (Profile setup)
      setStep(2);
    } catch (err: any) {
      setConfigError(err.message || 'Error saving server configuration');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleFinishProfileImport = async () => {
    if (selectedUserIds.length === 0) {
      setImportError('Please select at least one profile to import.');
      return;
    }

    try {
      setIsImporting(true);
      setImportError('');
      const success = await importProfiles(selectedUserIds);
      if (success) {
        onComplete?.();
        onClose();
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      } else {
        setImportError('Failed to import selected profiles.');
      }
    } catch {
      setImportError('Error finalizing setup.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
      {/* Dismiss button (only enabled if not fresh first run) */}
      {!needsSetup && profiles.length > 0 && (
        <button
          onClick={onClose}
          className="absolute top-5 right-5 sm:top-8 sm:right-8 text-neutral-400 hover:text-white p-2 rounded-full hover:bg-neutral-800 transition-colors z-10"
          title="Close setup"
        >
          <X size={26} />
        </button>
      )}

      <div className="w-full max-w-2xl bg-[#191919] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-8 animate-in zoom-in-95 duration-150">
        {/* Wizard Header */}
        <div className="bg-gradient-to-r from-red-950/60 via-neutral-900 to-black px-6 sm:px-8 py-6 border-b border-neutral-800">
          <div className="flex items-center space-x-3">
            <span className="text-xl sm:text-2xl font-black text-red-600 tracking-wider">
              HOMEFLIX
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-900/60 text-red-300 border border-red-700/60">
              Setup Wizard
            </span>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">
                {step === 1 ? 'Connect Media Servers' : 'Set Up Profiles'}
              </h1>
              <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
                {step === 1
                  ? 'Connect HomeFlix to your Jellyfin library and optional Overseerr gateway.'
                  : 'Select which Jellyfin user account(s) you would like to import into HomeFlix.'}
              </p>
            </div>

            {/* Stepper Pill */}
            <div className="flex items-center space-x-1.5 bg-neutral-950 px-3 py-1 rounded-full border border-neutral-800 text-xs font-semibold text-neutral-400">
              <span className={step === 1 ? 'text-red-500 font-bold' : 'text-neutral-500'}>
                1. Servers
              </span>
              <span>&rarr;</span>
              <span className={step === 2 ? 'text-red-500 font-bold' : 'text-neutral-500'}>
                2. Profiles
              </span>
            </div>
          </div>
        </div>

        {/* STEP 1: SERVERS CONFIGURATION */}
        {step === 1 && (
          <form onSubmit={handleSaveServers} className="p-6 sm:p-8 space-y-6">
            {/* Jellyfin Configuration Card */}
            <div className="bg-neutral-950/70 border border-neutral-800/90 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-500 flex items-center justify-center font-bold">
                    <Server size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Jellyfin Media Server <span className="text-red-500">*</span>
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Your self-hosted library for movies, series, and live streaming.
                    </p>
                  </div>
                </div>

                {jellyfinTestStatus && (
                  <div
                    className={`flex items-center space-x-1 text-xs px-2.5 py-1 rounded-full border ${
                      jellyfinTestStatus.success
                        ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                        : 'bg-red-950/60 border-red-800/80 text-red-300'
                    }`}
                  >
                    {jellyfinTestStatus.success ? (
                      <>
                        <CheckCircle2 size={13} className="text-emerald-400" />
                        <span>
                          {jellyfinTestStatus.serverName
                            ? `${jellyfinTestStatus.serverName}`
                            : 'Connected'}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={13} className="text-red-400" />
                        <span>Failed</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Jellyfin Server URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://jellyfin.example.com or http://192.168.1.50:8096"
                    value={jellyfinUrl}
                    onChange={(e) => setJellyfinUrl(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg bg-neutral-900 border border-neutral-700/80 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 placeholder-neutral-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Jellyfin API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showJellyfinKey ? 'text' : 'password'}
                      placeholder="e.g. 32ba2525fe8c4b61a9cdc22057bd..."
                      value={jellyfinApiKey}
                      onChange={(e) => setJellyfinApiKey(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-lg bg-neutral-900 border border-neutral-700/80 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 placeholder-neutral-500 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowJellyfinKey(!showJellyfinKey)}
                      className="absolute right-3 top-3 text-neutral-400 hover:text-white"
                      tabIndex={-1}
                    >
                      {showJellyfinKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Generated in Jellyfin Dashboard &rarr; Advanced &rarr; API Keys &rarr; Add API Key.
                  </p>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleTestJellyfin}
                    disabled={isTestingJellyfin || !jellyfinUrl.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    {isTestingJellyfin ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      <span>Test Jellyfin Connection</span>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Overseerr / Jellyseerr Configuration Card (Optional) */}
            <div className="bg-neutral-950/70 border border-neutral-800/90 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Overseerr / Jellyseerr <span className="text-neutral-500 text-xs font-normal">(Optional)</span>
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Enables streaming discovery, trending media, and 1-click requests.
                    </p>
                  </div>
                </div>

                {seerrTestStatus && (
                  <div
                    className={`flex items-center space-x-1 text-xs px-2.5 py-1 rounded-full border ${
                      seerrTestStatus.success
                        ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                        : 'bg-red-950/60 border-red-800/80 text-red-300'
                    }`}
                  >
                    {seerrTestStatus.success ? (
                      <>
                        <CheckCircle2 size={13} className="text-emerald-400" />
                        <span>Connected</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={13} className="text-red-400" />
                        <span>Failed</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Seerr URL
                  </label>
                  <input
                    type="url"
                    placeholder="http://192.168.1.50:5055 or https://requests.example.com"
                    value={seerrUrl}
                    onChange={(e) => setSeerrUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-neutral-900 border border-neutral-700/80 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 placeholder-neutral-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Seerr API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showSeerrKey ? 'text' : 'password'}
                      placeholder="e.g. MTIzNDU2Nzg..."
                      value={seerrApiKey}
                      onChange={(e) => setSeerrApiKey(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-lg bg-neutral-900 border border-neutral-700/80 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 placeholder-neutral-500 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSeerrKey(!showSeerrKey)}
                      className="absolute right-3 top-3 text-neutral-400 hover:text-white"
                      tabIndex={-1}
                    >
                      {showSeerrKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleTestSeerr}
                    disabled={isTestingSeerr || !seerrUrl.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    {isTestingSeerr ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      <span>Test Seerr Connection</span>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {configError && <p className="text-xs text-red-500 font-medium">{configError}</p>}

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2">
              {!needsSetup && profiles.length > 0 ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-lg border border-neutral-700 hover:border-neutral-500 text-neutral-300 text-xs sm:text-sm font-semibold transition"
                >
                  Cancel
                </button>
              ) : (
                <div />
              )}

              <button
                type="submit"
                disabled={isSavingConfig || !jellyfinUrl.trim()}
                className="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold shadow-lg transition flex items-center space-x-2 disabled:opacity-50"
              >
                {isSavingConfig ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving Servers...</span>
                  </>
                ) : (
                  <>
                    <span>Next: Set Up Profiles</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: PROFILE IMPORT & SELECTION */}
        {step === 2 && (
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="text-xs text-neutral-400 hover:text-white flex items-center space-x-1 p-1"
              >
                <ArrowLeft size={14} />
                <span>Back to Server Settings</span>
              </button>

              <span className="text-xs text-neutral-400">
                Connected to Jellyfin: <strong className="text-white">{jellyfinUrl}</strong>
              </span>
            </div>

            {isLoadingUsers ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <Loader2 size={36} className="animate-spin text-red-600" />
                <p className="text-xs text-neutral-400 font-medium">
                  Loading user profiles from Jellyfin server...
                </p>
              </div>
            ) : availableUsers.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 max-h-[340px] overflow-y-auto p-1">
                  {availableUsers.map((user) => {
                    const isSelected = selectedUserIds.includes(user.id);

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUserSelection(user.id)}
                        className={`relative flex flex-col items-center p-3.5 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'border-red-500 bg-red-950/20 shadow-lg scale-102 ring-1 ring-red-500/50'
                            : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-600'
                        }`}
                      >
                        <div
                          className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                            isSelected
                              ? 'bg-red-600 border-red-500 text-white'
                              : 'border-neutral-600 bg-black/40'
                          }`}
                        >
                          {isSelected && <Check size={12} className="stroke-[3]" />}
                        </div>

                        <div
                          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center font-bold text-lg sm:text-xl text-white shadow bg-gradient-to-br ${
                            user.avatarColor
                          }`}
                        >
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.name}
                              className="w-full h-full object-cover rounded-xl"
                            />
                          ) : (
                            <span>{user.initials}</span>
                          )}
                        </div>

                        <span className="mt-2 text-xs sm:text-sm font-semibold text-white capitalize truncate max-w-full">
                          {user.name}
                        </span>

                        {user.isAdministrator && (
                          <span className="text-[10px] text-amber-400 font-medium flex items-center space-x-0.5 mt-0.5">
                            <ShieldCheck size={10} />
                            <span>Admin</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                  <span>
                    {selectedUserIds.length} profile
                    {selectedUserIds.length === 1 ? '' : 's'} selected to import
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedUserIds.length === availableUsers.length) {
                        setSelectedUserIds([]);
                      } else {
                        setSelectedUserIds(availableUsers.map((u) => u.id));
                      }
                    }}
                    className="text-red-400 hover:text-red-300 font-medium"
                  >
                    {selectedUserIds.length === availableUsers.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-neutral-950/60 border border-neutral-800 text-center space-y-2">
                <AlertCircle size={32} className="mx-auto text-amber-400" />
                <p className="text-sm font-bold text-white">No Jellyfin users found.</p>
                <p className="text-xs text-neutral-400 max-w-md mx-auto">
                  Could not query users from Jellyfin with the provided credentials. Please check your Jellyfin URL and API key.
                </p>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mt-3 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold"
                >
                  Edit Server Settings
                </button>
              </div>
            )}

            {importError && <p className="text-xs text-red-500 font-medium">{importError}</p>}

            {/* Bottom Actions for Step 2 */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-lg border border-neutral-700 hover:border-neutral-500 text-neutral-300 text-xs sm:text-sm font-semibold transition"
              >
                &larr; Back
              </button>

              <button
                type="button"
                onClick={handleFinishProfileImport}
                disabled={isImporting || selectedUserIds.length === 0}
                className="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-lg transition flex items-center space-x-2"
              >
                {isImporting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Finalizing Setup...</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>
                      Import {selectedUserIds.length > 0 ? `(${selectedUserIds.length}) ` : ''}
                      &amp; Finish Setup
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
