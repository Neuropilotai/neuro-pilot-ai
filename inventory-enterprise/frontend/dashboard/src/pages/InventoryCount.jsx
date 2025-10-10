/**
 * Inventory Count Entry Page
 * Full-featured count entry with offline queue, barcode scanning, variance calculation
 * @version 3.0.0
 */

import { useState, useEffect, useRef } from 'react';
import {
  Search,
  Barcode,
  Save,
  Send,
  Trash2,
  Plus,
  RefreshCw,
  MapPin,
  AlertCircle,
  CheckCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

export default function InventoryCount() {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [countRows, setCountRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingQueue, setPendingQueue] = useState([]);
  const barcodeRef = useRef(null);

  // Load locations on mount
  useEffect(() => {
    loadLocations();
    loadOfflineQueue();

    // Network status listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleOnline = () => {
    setIsOnline(true);
    toast.success('Connection restored');
    processOfflineQueue();
  };

  const handleOffline = () => {
    setIsOnline(false);
    toast.error('You are offline. Changes will be queued.');
  };

  const loadLocations = async () => {
    try {
      const data = await api.getLocations();
      setLocations(data.locations || []);
    } catch (error) {
      console.error('Failed to load locations:', error);
      toast.error('Failed to load locations');
    }
  };

  const loadOfflineQueue = () => {
    const queue = localStorage.getItem('inventory_count_queue');
    if (queue) {
      setPendingQueue(JSON.parse(queue));
    }
  };

  const saveToOfflineQueue = (data) => {
    const queue = [...pendingQueue, { ...data, timestamp: Date.now() }];
    setPendingQueue(queue);
    localStorage.setItem('inventory_count_queue', JSON.stringify(queue));
    toast.success('Saved to offline queue');
  };

  const processOfflineQueue = async () => {
    if (pendingQueue.length === 0) return;

    toast.loading('Syncing offline data...');
    let successCount = 0;

    for (const item of pendingQueue) {
      try {
        if (item.action === 'draft') {
          await api.saveDraftCount(item.data);
        } else if (item.action === 'submit') {
          await api.submitCountForApproval(item.data);
        }
        successCount++;
      } catch (error) {
        console.error('Failed to sync item:', error);
      }
    }

    if (successCount === pendingQueue.length) {
      setPendingQueue([]);
      localStorage.removeItem('inventory_count_queue');
      toast.dismiss();
      toast.success(`Synced ${successCount} items`);
    } else {
      toast.dismiss();
      toast.error(`Synced ${successCount}/${pendingQueue.length} items`);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const data = await api.searchInventoryItems(searchQuery);
      const items = data.items || [];

      if (items.length === 0) {
        toast.error('No items found');
        return;
      }

      // Add found items to count rows if not already added
      items.forEach((item) => {
        if (!countRows.find((r) => r.itemCode === item.code)) {
          addCountRow(item);
        }
      });

      setSearchQuery('');
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeInput = async (e) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      e.preventDefault();
      setLoading(true);

      try {
        const data = await api.searchInventoryItems(barcodeInput);
        const items = data.items || [];

        if (items.length > 0) {
          const item = items[0];
          const existing = countRows.find((r) => r.itemCode === item.code);

          if (existing) {
            // Increment counted quantity
            setCountRows((rows) =>
              rows.map((r) =>
                r.itemCode === item.code
                  ? { ...r, countedQty: (r.countedQty || 0) + 1 }
                  : r
              )
            );
            toast.success(`${item.name}: +1 (Total: ${(existing.countedQty || 0) + 1})`);
          } else {
            addCountRow({ ...item, countedQty: 1 });
            toast.success(`Added: ${item.name}`);
          }
        } else {
          toast.error('Barcode not found');
        }

        setBarcodeInput('');
      } catch (error) {
        console.error('Barcode lookup failed:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const addCountRow = (item) => {
    setCountRows((rows) => [
      ...rows,
      {
        id: Date.now() + Math.random(),
        itemCode: item.code,
        name: item.name,
        expectedQty: item.quantity || 0,
        countedQty: item.countedQty || 0,
        notes: '',
      },
    ]);
  };

  const updateCountRow = (id, field, value) => {
    setCountRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const removeCountRow = (id) => {
    setCountRows((rows) => rows.filter((row) => row.id !== id));
  };

  const calculateVariance = (row) => {
    const variance = (row.countedQty || 0) - (row.expectedQty || 0);
    return variance;
  };

  const handleSaveDraft = async () => {
    if (!selectedLocation) {
      toast.error('Please select a location');
      return;
    }

    if (countRows.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    setSaving(true);
    const countData = {
      locationId: selectedLocation,
      rows: countRows.map((r) => ({
        itemCode: r.itemCode,
        expectedQty: r.expectedQty,
        countedQty: r.countedQty,
        notes: r.notes,
      })),
      status: 'draft',
    };

    try {
      if (isOnline) {
        await api.saveDraftCount(countData);
        toast.success('Draft saved successfully');
        resetForm();
      } else {
        saveToOfflineQueue({ action: 'draft', data: countData });
      }
    } catch (error) {
      console.error('Save draft failed:', error);
      saveToOfflineQueue({ action: 'draft', data: countData });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!selectedLocation) {
      toast.error('Please select a location');
      return;
    }

    if (countRows.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    const hasVariance = countRows.some((r) => calculateVariance(r) !== 0);
    if (hasVariance) {
      const confirm = window.confirm(
        'Some items have variances. Submit for approval?'
      );
      if (!confirm) return;
    }

    setSaving(true);
    const countData = {
      locationId: selectedLocation,
      rows: countRows.map((r) => ({
        itemCode: r.itemCode,
        expectedQty: r.expectedQty,
        countedQty: r.countedQty,
        variance: calculateVariance(r),
        notes: r.notes,
      })),
      status: 'pending_approval',
    };

    try {
      if (isOnline) {
        await api.submitCountForApproval(countData);
        toast.success('Count submitted for approval');
        resetForm();
      } else {
        saveToOfflineQueue({ action: 'submit', data: countData });
      }
    } catch (error) {
      console.error('Submit failed:', error);
      saveToOfflineQueue({ action: 'submit', data: countData });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCountRows([]);
    setSelectedLocation('');
    setSearchQuery('');
    setBarcodeInput('');
  };

  const totalVariance = countRows.reduce(
    (sum, row) => sum + Math.abs(calculateVariance(row)),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Inventory Count Entry
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Physical count with barcode scanning and offline support
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Network Status */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
            isOnline
              ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          )}>
            {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {isOnline ? 'Online' : 'Offline'}
          </div>

          {/* Pending Queue */}
          {pendingQueue.length > 0 && (
            <button
              onClick={processOfflineQueue}
              className="flex items-center gap-2 px-3 py-1.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 rounded-lg text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Sync {pendingQueue.length} pending
            </button>
          )}
        </div>
      </div>

      {/* Location & Search */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Location Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <MapPin className="w-4 h-4 inline mr-1" />
              Location
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="input w-full"
            >
              <option value="">Select location...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Item Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              Search Item
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Item code or name..."
                className="input flex-1"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !searchQuery.trim()}
                className="btn-secondary"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Barcode Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Barcode className="w-4 h-4 inline mr-1" />
              Barcode Scanner
            </label>
            <input
              ref={barcodeRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeInput}
              placeholder="Scan or type barcode..."
              className="input w-full font-mono"
              autoFocus
            />
          </div>
        </div>
      </div>

      {/* Count Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Item Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Expected
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Counted
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Variance
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {countRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No items added. Search or scan items to begin counting.
                  </td>
                </tr>
              ) : (
                countRows.map((row) => {
                  const variance = calculateVariance(row);
                  const hasVariance = variance !== 0;

                  return (
                    <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                        {row.itemCode}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {row.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                        {row.expectedQty}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <input
                          type="number"
                          value={row.countedQty}
                          onChange={(e) =>
                            updateCountRow(row.id, 'countedQty', parseInt(e.target.value) || 0)
                          }
                          className="input w-24 text-right"
                          min="0"
                        />
                      </td>
                      <td className={cn(
                        'px-4 py-3 text-sm text-right font-semibold',
                        hasVariance
                          ? variance > 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                          : 'text-gray-600 dark:text-gray-400'
                      )}>
                        {variance > 0 ? '+' : ''}{variance}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => updateCountRow(row.id, 'notes', e.target.value)}
                          placeholder="Notes..."
                          className="input w-full"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <button
                          onClick={() => removeCountRow(row.id)}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        {countRows.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <strong>{countRows.length}</strong> items counted
                {totalVariance > 0 && (
                  <span className="ml-4 text-yellow-600 dark:text-yellow-400">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    Total variance: {totalVariance}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={resetForm}
                  className="btn-secondary"
                  disabled={saving}
                >
                  Clear All
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={saving || countRows.length === 0}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Draft
                </button>
                <button
                  onClick={handleSubmitForApproval}
                  disabled={saving || countRows.length === 0}
                  className="btn-primary flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Submit for Approval
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
