import { useState, useEffect } from 'react';
import { getServerUrl, setServerUrl } from '../lib/api';

export default function Settings() {
  const [serverUrl, setServerUrlState] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setServerUrlState(getServerUrl());
  }, []);

  const handleSave = () => {
    setServerUrl(serverUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="card">
      <h2 className="text-xl font-semibold mb-4">Server Configuration</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Server URL
          </label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrlState(e.target.value)}
            placeholder="https://192.168.77.182:8443"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <p className="mt-2 text-sm text-gray-500">
            Your Next.js server: <strong>https://192.168.77.182:8443</strong>
            <br />
            (Redirects to localhost:3001 on the server)
          </p>
        </div>

        <button
          onClick={handleSave}
          className="btn-primary"
        >
          Save Configuration
        </button>

        {saved && (
          <div className="p-3 bg-green-100 text-green-800 rounded-lg">
            ✓ Server URL saved successfully
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-2">Connection Info</h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Current Server:</strong> {getServerUrl()}</p>
          <p><strong>WebSocket:</strong> 127.0.0.1:8765 (Local Tauri backend)</p>
          <p><strong>Database:</strong> Via server API</p>
        </div>
      </div>
    </div>
  );
}
