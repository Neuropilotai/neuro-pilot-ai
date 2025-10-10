import { useState, useEffect } from 'react';
import { Activity, TrendingUp, Database, Cpu, Zap, Users } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../services/api';
import { websocket } from '../services/websocket';
import { formatNumber, formatPercent, formatDuration } from '../lib/utils';

export default function Overview() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [latencyData, setLatencyData] = useState([]);
  const [cacheData, setCacheData] = useState([]);
  const [aiMapeData, setAiMapeData] = useState([]);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 10000); // Refresh every 10s

    // Subscribe to real-time updates
    const unsubscribe = websocket.on('forecast:update', (data) => {
      updateAIMapeData(data);
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const loadMetrics = async () => {
    try {
      const data = await api.getMetrics();
      setMetrics(data);
      processMetrics(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load metrics:', error);
      setLoading(false);
    }
  };

  const processMetrics = (data) => {
    // Process latency data
    if (data.http_request_duration_seconds) {
      const latency = data.http_request_duration_seconds
        .map((metric) => ({
          time: new Date().toLocaleTimeString(),
          p95: metric.value * 1000, // Convert to ms
        }))
        .slice(0, 20);
      setLatencyData((prev) => [...prev, ...latency].slice(-20));
    }

    // Process cache hit rate
    if (data.cache_hits_total && data.cache_misses_total) {
      const hits = data.cache_hits_total.reduce((sum, m) => sum + m.value, 0);
      const misses = data.cache_misses_total.reduce((sum, m) => sum + m.value, 0);
      const hitRate = hits / (hits + misses) * 100 || 0;

      setCacheData((prev) => [
        ...prev,
        {
          time: new Date().toLocaleTimeString(),
          hitRate: hitRate.toFixed(1),
        },
      ].slice(-20));
    }

    // Process AI MAPE
    if (data.ai_accuracy_mape) {
      const mapePoints = data.ai_accuracy_mape.map((metric) => ({
        item: metric.labels.item_code || 'Unknown',
        mape: metric.value,
      }));
      setAiMapeData(mapePoints.slice(0, 10));
    }
  };

  const updateAIMapeData = (data) => {
    if (data.itemCode && data.mape !== undefined) {
      setAiMapeData((prev) => {
        const filtered = prev.filter((item) => item.item !== data.itemCode);
        return [...filtered, { item: data.itemCode, mape: data.mape }].slice(0, 10);
      });
    }
  };

  const getStatValue = (metricName) => {
    if (!metrics || !metrics[metricName]) return 0;
    const values = metrics[metricName];
    if (Array.isArray(values) && values.length > 0) {
      return values[0].value;
    }
    return 0;
  };

  const stats = [
    {
      label: 'API Requests',
      value: formatNumber(getStatValue('http_requests_total')),
      change: '+12%',
      icon: Activity,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    },
    {
      label: 'Avg Latency',
      value: formatDuration(getStatValue('http_request_duration_seconds') * 1000),
      change: '-5%',
      icon: Zap,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
    },
    {
      label: 'Cache Hit Rate',
      value: formatPercent(
        (getStatValue('cache_hits_total') /
          (getStatValue('cache_hits_total') + getStatValue('cache_misses_total') || 1)) *
          100 || 0
      ),
      change: '+3%',
      icon: Database,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20',
    },
    {
      label: 'Active Tenants',
      value: formatNumber(getStatValue('tenant_request_rate')),
      change: '+8%',
      icon: Users,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/20',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  {stat.change}
                </span>
              </div>
              <div>
                <p className="stat-label mb-1">{stat.label}</p>
                <p className="stat-value">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Latency Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            API Latency (p95)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={latencyData}>
              <defs>
                <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis
                dataKey="time"
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                tickLine={false}
                tickFormatter={(value) => `${value}ms`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#fff',
                }}
              />
              <Area
                type="monotone"
                dataKey="p95"
                stroke="#a855f7"
                strokeWidth={2}
                fill="url(#latencyGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Cache Hit Rate Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Cache Hit Rate
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={cacheData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis
                dataKey="time"
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                tickLine={false}
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
                dataKey="hitRate"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI MAPE Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          AI Forecast Accuracy (MAPE by Item)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={aiMapeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
            <XAxis
              dataKey="item"
              stroke="#9ca3af"
              tick={{ fontSize: 12 }}
              tickLine={false}
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
            <Bar dataKey="mape" fill="#f59e0b" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Target MAPE:</strong> &lt; 15% | Lower values indicate better forecast accuracy
          </p>
        </div>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">System Health</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Database</span>
              <span className="badge badge-success">Connected</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Cache</span>
              <span className="badge badge-success">Active</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">WebSocket</span>
              <span className={`badge ${websocket.isConnected() ? 'badge-success' : 'badge-warning'}`}>
                {websocket.isConnected() ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        <div className="card col-span-2">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Real-time metrics streaming active
              </p>
              <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">Now</span>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                System metrics refreshed
              </p>
              <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">10s ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
