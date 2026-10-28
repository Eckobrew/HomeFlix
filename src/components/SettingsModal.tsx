'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  Globe,
  CheckCircle,
  AlertCircle,
  Loader2,
  HardDrive,
  Copy,
  Check,
  RefreshCw,
  Info,
} from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  onRefreshData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  onRefreshData,
}) => {
  const [jellyfinUrl, setJellyfinUrl] = useState('');
  const [jellyfinApiKey, setJellyfinApiKey] = useState('');
  const [jellyfinUserId, setJellyfinUserId] = useState('');
  const [seerrUrl, setSeerrUrl] = useState('');
  const [seerrApiKey, setSeerrApiKey] = useState('');

  const [testingJellyfin, setTestingJellyfin] = useState(false);
  const [jellyfinTestResult, setJellyfinTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [testingSeerr, setTestingSeerr] = useState(false);
  const [seerrTestResult, setSeerrTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [copiedScript, setCopiedScript] = useState(false);
  const [activeTab, setActiveTab] = useState<'servers' | 'proxmox'>('servers');

  useEffect(() => {
    // Load existing config from API or localStorage
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          if (data.jellyfinUrl) setJellyfinUrl(data.jellyfinUrl);
          if (data.jellyfinUserId) setJellyfinUserId(data.jellyfinUserId);
          if (data.seerrUrl) setSeerrUrl(data.seerrUrl);
        }
      } catch (e) {
        console.error('Failed to load server config:', e);
      }
    };
    loadConfig();
  }, []);

  const handleTestJellyfin = async () => {
    setTestingJellyfin(true);
    setJellyfinTestResult(null);
    try {
      const res = await fetch('/api/config?action=test-jellyfin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: jellyfinUrl,
          apiKey: jellyfinApiKey,
          userId: jellyfinUserId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setJellyfinTestResult({
          success: true,
          message: `Connected successfully to ${data.serverName || 'Jellyfin'} (v${data.version || 'latest'})!`,
        });
      } else {
        setJellyfinTestResult({
          success: false,
          message: data.error || 'Connection failed. Verify URL and API Key.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setJellyfinTestResult({ success: false, message: msg });
    } finally {
      setTestingJellyfin(false);
    }
  };

  const handleTestSeerr = async () => {
    setTestingSeerr(true);
    setSeerrTestResult(null);
    try {
      const res = await fetch('/api/config?action=test-seerr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: seerrUrl,
          apiKey: seerrApiKey,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSeerrTestResult({
          success: true,
          message: `Connected to Seerr successfully (v${data.version || 'latest'})!`,
        });
      } else {
        setSeerrTestResult({
          success: false,
          message: data.error || 'Connection failed. Verify Seerr URL and API Key.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSeerrTestResult({ success: false, message: msg });
    } finally {
      setTestingSeerr(false);
    }
  };

  const copyProxmoxCommand = () => {
    const cmd = `bash -c "$(curl -fsSL https://raw.githubusercontent.com/Eckobrew/HomeFlix/main/scripts/install-proxmox-lxc.sh)"`;
    navigator.clipboard.writeText(cmd);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none text-white"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#181818] rounded-xl overflow-hidden shadow-2xl border border-neutral-700 p-6 md:p-8 space-y-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center font-black text-white text-lg">
              HF
            </div>
            <div>
              <h2 className="text-xl font-black text-white">HomeFlix Settings</h2>
              <p className="text-xs text-neutral-400">
                Connect your Jellyfin media server and Seerr request gateway
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 border-b border-neutral-800 pb-3">
          <button
            onClick={() => setActiveTab('servers')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'servers'
                ? 'bg-red-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            Server Connections
          </button>
          <button
            onClick={() => setActiveTab('proxmox')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'proxmox'
                ? 'bg-red-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            Proxmox LXC Deployment
          </button>
        </div>

        {activeTab === 'servers' ? (
          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
            {/* Jellyfin Configuration */}
            <div className="space-y-3 bg-neutral-900/80 p-4 rounded-lg border border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm font-bold text-white">
                  <Server size={18} className="text-purple-400" />
                  <span>Jellyfin Server</span>
                </div>
                <button
                  type="button"
                  onClick={handleTestJellyfin}
                  disabled={testingJellyfin || !jellyfinUrl}
                  className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {testingJellyfin && <Loader2 size={12} className="animate-spin" />}
                  <span>Test Connection</span>
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-neutral-400 block mb-1">Server URL</label>
                  <input
                    type="text"
                    placeholder="http://192.168.1.50:8096 or https://jellyfin.yourdomain.com"
                    value={jellyfinUrl}
                    onChange={(e) => setJellyfinUrl(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-red-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-neutral-400 block mb-1">API Key (Dashboard &gt; API Keys)</label>
                  <input
                    type="password"
                    placeholder="Enter your Jellyfin API token"
                    value={jellyfinApiKey}
                    onChange={(e) => setJellyfinApiKey(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-red-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-neutral-400 block mb-1">User ID (Optional, auto-detected if empty)</label>
                  <input
                    type="text"
                    placeholder="Leave empty to use primary user"
                    value={jellyfinUserId}
                    onChange={(e) => setJellyfinUserId(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-red-500 font-mono"
                  />
                </div>
              </div>

              {jellyfinTestResult && (
                <div
                  className={`flex items-center space-x-2 p-2.5 rounded text-xs ${
                    jellyfinTestResult.success
                      ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                      : 'bg-red-950/80 border border-red-800 text-red-300'
                  }`}
                >
                  {jellyfinTestResult.success ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  <span>{jellyfinTestResult.message}</span>
                </div>
              )}
            </div>

            {/* Seerr (Jellyseerr / Overseerr) Configuration */}
            <div className="space-y-3 bg-neutral-900/80 p-4 rounded-lg border border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm font-bold text-white">
                  <Globe size={18} className="text-blue-400" />
                  <span>Seerr (Jellyseerr / Overseerr)</span>
                </div>
                <button
                  type="button"
                  onClick={handleTestSeerr}
                  disabled={testingSeerr || !seerrUrl}
                  className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {testingSeerr && <Loader2 size={12} className="animate-spin" />}
                  <span>Test Connection</span>
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-neutral-400 block mb-1">Server URL</label>
                  <input
                    type="text"
                    placeholder="http://192.168.1.50:5055 or https://seerr.yourdomain.com"
                    value={seerrUrl}
                    onChange={(e) => setSeerrUrl(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-red-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-neutral-400 block mb-1">API Key (Settings &gt; General &gt; API Key)</label>
                  <input
                    type="password"
                    placeholder="Enter your Seerr API Key"
                    value={seerrApiKey}
                    onChange={(e) => setSeerrApiKey(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-red-500 font-mono"
                  />
                </div>
              </div>

              {seerrTestResult && (
                <div
                  className={`flex items-center space-x-2 p-2.5 rounded text-xs ${
                    seerrTestResult.success
                      ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                      : 'bg-red-950/80 border border-red-800 text-red-300'
                  }`}
                >
                  {seerrTestResult.success ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  <span>{seerrTestResult.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 text-xs text-neutral-400 bg-neutral-900/50 p-3 rounded border border-neutral-800">
              <Info size={16} className="text-neutral-500 shrink-0" />
              <span>
                Tip: You can also set these permanently as environment variables (<code>JELLYFIN_URL</code>, <code>JELLYFIN_API_KEY</code>, <code>SEERR_URL</code>, <code>SEERR_API_KEY</code>) in your <code>docker-compose.yml</code> file.
              </span>
            </div>
          </div>
        ) : (
          /* Proxmox LXC Guide Tab */
          <div className="space-y-4 max-h-[60vh] overflow-y-auto text-xs pr-1">
            <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 space-y-3">
              <h4 className="font-bold text-white text-sm flex items-center space-x-2">
                <HardDrive size={16} className="text-red-500" />
                <span>One-Line Proxmox VE LXC Deployment</span>
              </h4>
              <p className="text-neutral-400 leading-relaxed">
                Run this command directly in your Proxmox VE Shell to automatically create a Debian 12 LXC container with Docker and spin up HomeFlix on port 3000:
              </p>

              <div className="relative bg-black rounded p-3 font-mono text-[11px] text-emerald-400 border border-neutral-800 flex items-center justify-between">
                <span className="truncate pr-4">
                  bash -c &quot;$(curl -fsSL https://raw.githubusercontent.com/Eckobrew/HomeFlix/main/scripts/install-proxmox-lxc.sh)&quot;
                </span>
                <button
                  onClick={copyProxmoxCommand}
                  className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white shrink-0 transition-colors"
                  title="Copy command"
                >
                  {copiedScript ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 space-y-2">
              <h4 className="font-bold text-white text-sm">Docker Compose Method</h4>
              <p className="text-neutral-400 leading-relaxed">
                Inside an existing LXC or VM, run:
              </p>
              <pre className="bg-black p-3 rounded font-mono text-[11px] text-neutral-300 overflow-x-auto">
{`git clone https://github.com/Eckobrew/HomeFlix.git
cd HomeFlix
cp .env.example .env
# Edit .env with your Jellyfin & Seerr details
docker compose up -d`}
              </pre>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
          <button
            onClick={() => {
              onRefreshData();
              onClose();
            }}
            className="flex items-center space-x-1.5 text-xs text-neutral-400 hover:text-white"
          >
            <RefreshCw size={14} />
            <span>Reload Library</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onRefreshData();
                onClose();
              }}
              className="px-5 py-2 rounded bg-red-600 hover:bg-red-700 font-bold text-xs text-white transition-colors shadow"
            >
              Save &amp; Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
