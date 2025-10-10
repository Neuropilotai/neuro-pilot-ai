import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';
import toast from 'react-hot-toast';
import PDFManager from '../components/OwnerConsole/PDFManager';
import LocationManager from '../components/OwnerConsole/LocationManager';
import AIAgentControl from '../components/OwnerConsole/AIAgentControl';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8083';

export default function OwnerConsole() {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState('pdfs');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSnapshot();
  }, []);

  const loadSnapshot = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/owner/console/snapshot`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSnapshot(response.data);
    } catch (error) {
      toast.error('Failed to load system snapshot');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'pdfs', name: 'PDF Management', icon: '📄' },
    { id: 'locations', name: 'Locations', icon: '📍' },
    { id: 'ai', name: 'AI Agents', icon: '🤖' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg shadow-lg p-6 text-white">
        <h1 className="text-3xl font-bold mb-2">Owner Mission Control</h1>
        <p className="text-blue-100">Full system control and monitoring</p>
      </div>

      {/* System Overview Cards */}
      {!loading && snapshot && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow">
            <div className="text-sm text-slate-600 dark:text-slate-400">Total PDFs</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {snapshot.stats?.totalPDFs || 0}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow">
            <div className="text-sm text-slate-600 dark:text-slate-400">Active Locations</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {snapshot.stats?.totalLocations || 0}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow">
            <div className="text-sm text-slate-600 dark:text-slate-400">Open Counts</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {snapshot.stats?.openCounts || 0}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow">
            <div className="text-sm text-slate-600 dark:text-slate-400">System Health</div>
            <div className="text-2xl font-bold text-green-600">
              {snapshot.health?.status || 'Healthy'}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300'
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
        {activeTab === 'pdfs' && <PDFManager />}
        {activeTab === 'locations' && <LocationManager />}
        {activeTab === 'ai' && <AIAgentControl />}
      </div>
    </div>
  );
}
