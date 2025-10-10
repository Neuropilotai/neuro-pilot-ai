import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Users, Clock } from 'lucide-react';
import { api } from '../services/api';
import { formatNumber } from '../lib/utils';

export default function Security() {
  const [rbacDenials, setRbacDenials] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSecurityData();
    const interval = setInterval(loadSecurityData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadSecurityData = async () => {
    try {
      // Load RBAC denials and active sessions
      // Using mock data for demo
      setRbacDenials([
        {
          id: 1,
          user: 'analyst@example.com',
          permission: 'inventory:delete',
          resource: '/api/inventory/items/123',
          timestamp: new Date(Date.now() - 300000).toISOString(),
        },
        {
          id: 2,
          user: 'manager@example.com',
          permission: 'users:admin',
          resource: '/api/users',
          timestamp: new Date(Date.now() - 600000).toISOString(),
        },
        {
          id: 3,
          user: 'auditor@example.com',
          permission: 'inventory:write',
          resource: '/api/inventory/items',
          timestamp: new Date(Date.now() - 900000).toISOString(),
        },
      ]);

      setActiveSessions([
        {
          id: 'session_1',
          user: 'admin@example.com',
          tenant: 'Acme Corp',
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          lastActivity: new Date(Date.now() - 60000).toISOString(),
        },
        {
          id: 'session_2',
          user: 'manager@example.com',
          tenant: 'TechStart Inc',
          ip: '192.168.1.101',
          userAgent: 'Chrome/121',
          lastActivity: new Date(Date.now() - 120000).toISOString(),
        },
        {
          id: 'session_3',
          user: 'analyst@example.com',
          tenant: 'Acme Corp',
          ip: '192.168.1.102',
          userAgent: 'Safari/17.2',
          lastActivity: new Date(Date.now() - 180000).toISOString(),
        },
      ]);

      setLoading(false);
    } catch (error) {
      console.error('Failed to load security data:', error);
      setLoading(false);
    }
  };

  const stats = [
    {
      label: 'RBAC Denials (24h)',
      value: formatNumber(rbacDenials.length),
      icon: Shield,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/20',
    },
    {
      label: 'Active Sessions',
      value: formatNumber(activeSessions.length),
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    },
    {
      label: 'Failed Logins (24h)',
      value: formatNumber(7),
      icon: AlertTriangle,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
    },
    {
      label: 'Avg Session Duration',
      value: '24m',
      icon: Clock,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
              <div>
                <p className="stat-label mb-1">{stat.label}</p>
                <p className="stat-value">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* RBAC Denials */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent RBAC Denials
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Permission Denied
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {rbacDenials.map((denial) => (
                <tr key={denial.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {denial.user}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="badge badge-danger font-mono text-xs">
                      {denial.permission}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 font-mono">
                    {denial.resource}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(denial.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Active Sessions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tenant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  IP Address
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Activity
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {activeSessions.map((session) => (
                <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {session.user}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {session.tenant}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 font-mono">
                    {session.ip}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(session.lastActivity).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Security Health
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <span className="text-sm text-green-800 dark:text-green-200">
                2FA Enforcement
              </span>
              <span className="badge badge-success">Active</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <span className="text-sm text-green-800 dark:text-green-200">
                JWT Token Validation
              </span>
              <span className="badge badge-success">Active</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <span className="text-sm text-green-800 dark:text-green-200">
                Rate Limiting
              </span>
              <span className="badge badge-success">Active</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Compliance Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <span className="text-sm text-blue-800 dark:text-blue-200">
                OWASP Top 10
              </span>
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                100%
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <span className="text-sm text-blue-800 dark:text-blue-200">
                ISO 27001
              </span>
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                100%
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <span className="text-sm text-blue-800 dark:text-blue-200">
                SOC 2 Type II
              </span>
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                100%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
