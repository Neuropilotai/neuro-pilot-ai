import { useState, useEffect } from 'react';
import { Plus, Users, TrendingUp, Search } from 'lucide-react';
import { api } from '../services/api';
import { formatNumber, getBadgeColor } from '../lib/utils';
import toast from 'react-hot-toast';

export default function Tenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      const data = await api.getTenants();
      setTenants(data.tenants || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load tenants:', error);
      setLoading(false);
      // Use mock data for demo
      setTenants([
        {
          id: 'tenant_001',
          name: 'Acme Corp',
          status: 'active',
          users: 24,
          traffic: 1847,
          created_at: '2024-01-15',
        },
        {
          id: 'tenant_002',
          name: 'TechStart Inc',
          status: 'active',
          users: 12,
          traffic: 892,
          created_at: '2024-02-20',
        },
        {
          id: 'tenant_003',
          name: 'Global Enterprises',
          status: 'inactive',
          users: 45,
          traffic: 3201,
          created_at: '2023-11-10',
        },
      ]);
    }
  };

  const filteredTenants = tenants.filter((tenant) =>
    tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tenant.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUsers = tenants.reduce((sum, t) => sum + (t.users || 0), 0);
  const totalTraffic = tenants.reduce((sum, t) => sum + (t.traffic || 0), 0);
  const activeTenants = tenants.filter((t) => t.status === 'active').length;

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Total Tenants</p>
              <p className="stat-value">{formatNumber(tenants.length)}</p>
            </div>
            <Users className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Active Tenants</p>
              <p className="stat-value">{formatNumber(activeTenants)}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Total Users</p>
              <p className="stat-value">{formatNumber(totalUsers)}</p>
            </div>
            <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Tenants</h2>
          <button className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Add Tenant
          </button>
        </div>

        <div className="mb-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search tenants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tenant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Users
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Traffic (24h)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {filteredTenants.map((tenant) => (
                <tr
                  key={tenant.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {tenant.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {tenant.id}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`badge ${getBadgeColor(tenant.status)}`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {formatNumber(tenant.users)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {formatNumber(tenant.traffic)}
                      </span>
                      <div className="w-16 h-6">
                        {/* Sparkline placeholder */}
                        <svg className="w-full h-full" viewBox="0 0 64 24">
                          <polyline
                            points="0,12 8,8 16,14 24,10 32,16 40,12 48,18 56,14 64,10"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-primary-500"
                          />
                        </svg>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
