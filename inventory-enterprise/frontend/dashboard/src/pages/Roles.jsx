import { useState, useEffect } from 'react';
import { Shield, Check, X } from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';

const PERMISSIONS_MATRIX = {
  'Inventory': ['inventory:read', 'inventory:write', 'inventory:delete'],
  'Orders': ['orders:read', 'orders:write', 'orders:manage'],
  'Users': ['users:read', 'users:manage', 'users:admin'],
  'Roles': ['roles:read', 'roles:write', 'roles:delete'],
  'Reports': ['reports:read', 'reports:export'],
  'AI': ['ai:feedback:manage'],
  'System': ['system:admin', 'system:audit'],
};

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      const data = await api.getRoles();
      setRoles(data.roles || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load roles:', error);
      setLoading(false);
      // Mock data
      setRoles([
        { id: 'role_admin', name: 'Admin', description: 'Full system access', users: 3, system: true },
        { id: 'role_manager', name: 'Manager', description: 'Read and write access', users: 8, system: true },
        { id: 'role_analyst', name: 'Analyst', description: 'Read-only access', users: 15, system: true },
        { id: 'role_auditor', name: 'Auditor', description: 'Audit log access', users: 2, system: true },
      ]);
    }
  };

  const loadRolePermissions = async (roleId) => {
    try {
      const data = await api.getRolePermissions(roleId);
      setRolePermissions(data.permissions || []);
    } catch (error) {
      console.error('Failed to load role permissions:', error);
      // Mock permissions based on role name
      const role = roles.find(r => r.id === roleId);
      if (role?.name === 'Admin') {
        setRolePermissions(Object.values(PERMISSIONS_MATRIX).flat());
      } else if (role?.name === 'Manager') {
        setRolePermissions([
          'inventory:read', 'inventory:write',
          'orders:read', 'orders:write',
          'reports:read',
        ]);
      } else if (role?.name === 'Analyst') {
        setRolePermissions([
          'inventory:read',
          'orders:read',
          'reports:read',
        ]);
      } else {
        setRolePermissions(['reports:read', 'system:audit']);
      }
    }
  };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    loadRolePermissions(role.id);
  };

  const hasPermission = (permission) => {
    return rolePermissions.includes(permission);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Role Management</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage roles and their permissions
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles List */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Roles</h3>
          <div className="space-y-2">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => handleRoleSelect(role)}
                className={`w-full p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                  selectedRole?.id === role.id
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {role.name}
                    </span>
                  </div>
                  {role.system && (
                    <span className="badge text-xs">System</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {role.description}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  {role.users} users
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Permission Matrix */}
        <div className="card lg:col-span-2">
          {selectedRole ? (
            <>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Permissions for {selectedRole.name}
                </h3>
                {!selectedRole.system && (
                  <button className="btn btn-primary text-sm">
                    Save Changes
                  </button>
                )}
              </div>

              <div className="space-y-6">
                {Object.entries(PERMISSIONS_MATRIX).map(([category, permissions]) => (
                  <div key={category}>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      {category}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {permissions.map((permission) => (
                        <div
                          key={permission}
                          className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                        >
                          <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                            {permission}
                          </span>
                          <div
                            className={`flex items-center justify-center w-6 h-6 rounded ${
                              hasPermission(permission)
                                ? 'bg-green-500'
                                : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          >
                            {hasPermission(permission) ? (
                              <Check className="w-4 h-4 text-white" />
                            ) : (
                              <X className="w-4 h-4 text-gray-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-96 text-center">
              <Shield className="w-16 h-16 text-gray-400 mb-4" />
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Select a role to view and manage permissions
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
