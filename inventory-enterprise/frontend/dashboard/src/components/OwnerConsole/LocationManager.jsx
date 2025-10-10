import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8083';

export default function LocationManager() {
  const { token } = useAuthStore();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLocation, setEditingLocation] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    location_name: '',
    location_type: 'warehouse',
    latitude: '',
    longitude: '',
    sequence: 1
  });

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/inventory/locations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLocations(response.data || []);
    } catch (error) {
      toast.error('Failed to load locations');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (location) => {
    setEditingLocation(location);
    setFormData({
      location_name: location.location_name || '',
      location_type: location.location_type || 'warehouse',
      latitude: location.latitude || '',
      longitude: location.longitude || '',
      sequence: location.sequence || 1
    });
    setShowCreateModal(true);
  };

  const handleCreate = () => {
    setEditingLocation(null);
    setFormData({
      location_name: '',
      location_type: 'warehouse',
      latitude: '',
      longitude: '',
      sequence: (locations.length + 1)
    });
    setShowCreateModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...formData,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      sequence: parseInt(formData.sequence)
    };

    try {
      if (editingLocation) {
        // Update existing location
        await axios.put(
          `${API_BASE_URL}/api/owner/console/locations/${editingLocation.location_id}/gps`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Location updated successfully');
      } else {
        // Create new location
        await axios.post(
          `${API_BASE_URL}/api/inventory/locations`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Location created successfully');
      }
      setShowCreateModal(false);
      loadLocations();
    } catch (error) {
      toast.error(editingLocation ? 'Failed to update location' : 'Failed to create location');
      console.error(error);
    }
  };

  const handleDelete = async (locationId) => {
    if (!confirm('Are you sure you want to delete this location?')) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/inventory/locations/${locationId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Location deleted successfully');
      loadLocations();
    } catch (error) {
      toast.error('Failed to delete location');
      console.error(error);
    }
  };

  const locationTypes = [
    { value: 'warehouse', label: 'Warehouse' },
    { value: 'shelf', label: 'Shelf' },
    { value: 'bin', label: 'Bin' },
    { value: 'cooler', label: 'Cooler' },
    { value: 'freezer', label: 'Freezer' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Location Management</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Manage storage locations with GPS coordinates. Items can be assigned to multiple locations.
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New Location
        </button>
      </div>

      {/* Locations Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
          <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="mt-4 text-lg font-medium">No locations found</p>
          <p className="text-sm mt-2">Create your first location to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((location) => (
            <div
              key={location.location_id}
              className="bg-white dark:bg-slate-800 rounded-lg border-2 border-slate-200 dark:border-slate-700 p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {location.location_name}
                  </h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 mt-1">
                    {location.location_type || 'warehouse'}
                  </span>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => handleEdit(location)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                    title="Edit location"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(location.location_id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    title="Delete location"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {(location.latitude && location.longitude) ? (
                  <div className="flex items-start text-slate-600 dark:text-slate-400">
                    <svg className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>
                      {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                      <a
                        href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        (Open Map)
                      </a>
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center text-slate-400 dark:text-slate-500">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    No GPS coordinates
                  </div>
                )}
                <div className="flex items-center text-slate-600 dark:text-slate-400">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  Sequence: {location.sequence || 'N/A'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-lg w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {editingLocation ? 'Edit Location' : 'Create New Location'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Location Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-white"
                  placeholder="Main Warehouse"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Location Type *
                </label>
                <select
                  value={formData.location_type}
                  onChange={(e) => setFormData({ ...formData, location_type: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-white"
                >
                  {locationTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-white"
                    placeholder="45.5017"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-white"
                    placeholder="-73.5673"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Display Sequence
                </label>
                <input
                  type="number"
                  value={formData.sequence}
                  onChange={(e) => setFormData({ ...formData, sequence: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-white"
                  placeholder="1"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {editingLocation ? 'Update Location' : 'Create Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
