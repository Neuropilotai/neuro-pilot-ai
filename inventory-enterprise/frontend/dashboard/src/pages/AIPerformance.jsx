import { useState, useEffect } from 'react';
import { Brain, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { websocket } from '../services/websocket';
import { formatNumber, formatPercent } from '../lib/utils';
import toast from 'react-hot-toast';

export default function AIPerformance() {
  const [mapeData, setMapeData] = useState([
    { date: '2025-10-01', mape: 12.3 },
    { date: '2025-10-02', mape: 11.8 },
    { date: '2025-10-03', mape: 13.1 },
    { date: '2025-10-04', mape: 12.5 },
    { date: '2025-10-05', mape: 11.2 },
    { date: '2025-10-06', mape: 10.9 },
    { date: '2025-10-07', mape: 11.5 },
  ]);

  const [rlRewardsData, setRlRewardsData] = useState([
    { date: '2025-10-01', reward: 150 },
    { date: '2025-10-02', reward: 165 },
    { date: '2025-10-03', reward: 172 },
    { date: '2025-10-04', reward: 168 },
    { date: '2025-10-05', reward: 180 },
    { date: '2025-10-06', reward: 195 },
    { date: '2025-10-07', reward: 205 },
  ]);

  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    // Subscribe to AI events
    const unsubscribeForecast = websocket.on('forecast:update', handleForecastUpdate);
    const unsubscribePolicy = websocket.on('policy:update', handlePolicyUpdate);
    const unsubscribeAnomaly = websocket.on('anomaly:alert', handleAnomalyAlert);
    const unsubscribeModel = websocket.on('model:retrained', handleModelRetrained);

    return () => {
      unsubscribeForecast();
      unsubscribePolicy();
      unsubscribeAnomaly();
      unsubscribeModel();
    };
  }, []);

  const handleForecastUpdate = (data) => {
    addActivity(`Forecast updated for ${data.itemCode}`, 'forecast');
  };

  const handlePolicyUpdate = (data) => {
    addActivity(`Policy updated for ${data.itemCode}`, 'policy');
    if (data.reward !== undefined) {
      setRlRewardsData((prev) => [
        ...prev,
        {
          date: new Date().toISOString().split('T')[0],
          reward: data.reward,
        },
      ].slice(-10));
    }
  };

  const handleAnomalyAlert = (data) => {
    addActivity(`Anomaly detected: ${data.itemCode}`, 'anomaly');
  };

  const handleModelRetrained = (data) => {
    addActivity(`Model retrained: ${data.itemCode}`, 'retrain');
    if (data.mape !== undefined) {
      setMapeData((prev) => [
        ...prev,
        {
          date: new Date().toISOString().split('T')[0],
          mape: data.mape,
        },
      ].slice(-10));
    }
  };

  const addActivity = (message, type) => {
    setRecentActivity((prev) => [
      {
        id: Date.now(),
        message,
        type,
        time: new Date().toLocaleTimeString(),
      },
      ...prev,
    ].slice(0, 10));
  };

  const stats = [
    {
      label: 'Avg MAPE (7d)',
      value: formatPercent(11.9, 1),
      target: '< 15%',
      status: 'good',
      icon: Brain,
    },
    {
      label: 'Models Trained',
      value: formatNumber(42),
      target: 'Active',
      status: 'good',
      icon: TrendingUp,
    },
    {
      label: 'Anomalies (24h)',
      value: formatNumber(3),
      target: 'Low',
      status: 'warning',
      icon: AlertTriangle,
    },
    {
      label: 'Retraining Jobs',
      value: formatNumber(8),
      target: 'In Progress',
      status: 'info',
      icon: RefreshCw,
    },
  ];

  const getStatusColor = (status) => {
    const colors = {
      good: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20',
      warning: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20',
      info: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20',
    };
    return colors[status] || colors.info;
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${getStatusColor(stat.status)}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
              <div>
                <p className="stat-label mb-1">{stat.label}</p>
                <p className="stat-value mb-1">{stat.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Target: {stat.target}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MAPE Timeline */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Forecast Accuracy (MAPE) Timeline
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mapeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis
                dataKey="date"
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                tickLine={false}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                tickLine={false}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#fff',
                }}
              />
              <Line
                type="monotone"
                dataKey="mape"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', r: 4 }}
                name="MAPE %"
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              Lower MAPE values indicate better forecast accuracy. Target: &lt; 15%
            </p>
          </div>
        </div>

        {/* RL Rewards */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            RL Policy Rewards
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={rlRewardsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis
                dataKey="date"
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                tickLine={false}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#fff',
                }}
              />
              <Line
                type="monotone"
                dataKey="reward"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 4 }}
                name="Reward"
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-800 dark:text-green-200">
              Higher rewards indicate better policy optimization (stockout reduction, waste minimization)
            </p>
          </div>
        </div>
      </div>

      {/* Real-Time Activity */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
          Real-Time AI Activity
        </h3>
        <div className="space-y-2">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {activity.message}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {activity.time}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Waiting for AI events...</p>
              <p className="text-xs mt-1">Connect WebSocket to see real-time updates</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
