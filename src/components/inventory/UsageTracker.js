import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './UsageTracker.css';

const UsageTracker = () => {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [quantity, setQuantity] = useState('');
  const [takenBy, setTakenBy] = useState('');
  const [reason, setReason] = useState('');
  const [usageHistory, setUsageHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchItems();
    fetchLocations();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/inventory/items');
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await axios.get('/api/inventory/locations');
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchUsageHistory = async (itemId) => {
    try {
      const response = await axios.get(`/api/inventory/usage/${itemId}`);
      setUsageHistory(response.data);
      setShowHistory(true);
    } catch (error) {
      console.error('Error fetching usage history:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedItem || !selectedLocation || !quantity || !takenBy) {
      alert('Please fill in all required fields');
      return;
    }

    const usageData = {
      inventoryItem: selectedItem,
      location: selectedLocation,
      quantity: parseInt(quantity),
      type: 'Usage',
      takenBy,
      reason
    };

    try {
      await axios.post('/api/inventory/usage', usageData);
      alert('Usage recorded successfully!');
      
      // Reset form
      setQuantity('');
      setTakenBy('');
      setReason('');
      
      // Refresh items to show updated quantities
      fetchItems();
    } catch (error) {
      console.error('Error recording usage:', error);
      alert('Error recording usage');
    }
  };

  const selectedItemData = items.find(item => item._id === selectedItem);

  return (
    <div className="usage-tracker-container">
      <h1>Usage Tracker</h1>
      
      <div className="usage-form-card">
        <h2>Record Item Usage</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Item *</label>
              <select
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                required
              >
                <option value="">Select an item</option>
                {items.map(item => (
                  <option key={item._id} value={item._id}>
                    {item.name} (Current: {item.currentQuantity} {item.unit})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Location *</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                required
              >
                <option value="">Select location</option>
                {locations.map(location => (
                  <option key={location._id} value={location._id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Quantity *</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Taken By *</label>
              <input
                type="text"
                value={takenBy}
                onChange={(e) => setTakenBy(e.target.value)}
                placeholder="Employee name"
                required
              />
            </div>
          </div>
          
          <div className="form-group">
            <label>Reason/Notes</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional: Reason for usage"
              rows="3"
            />
          </div>
          
          {selectedItemData && (
            <div className="item-info">
              <p><strong>Current Stock:</strong> {selectedItemData.currentQuantity} {selectedItemData.unit}</p>
              <p><strong>Min Level:</strong> {selectedItemData.minQuantity}</p>
              {selectedItemData.currentQuantity <= selectedItemData.reorderPoint && (
                <p className="alert">⚠️ Item is below reorder point!</p>
              )}
            </div>
          )}
          
          <div className="form-actions">
            <button type="submit" className="btn-submit">
              Record Usage
            </button>
            {selectedItem && (
              <button 
                type="button" 
                onClick={() => fetchUsageHistory(selectedItem)}
                className="btn-history"
              >
                View History
              </button>
            )}
          </div>
        </form>
      </div>
      
      {showHistory && (
        <div className="usage-history-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Usage History</h2>
              <button onClick={() => setShowHistory(false)} className="close-btn">×</button>
            </div>
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Location</th>
                    <th>Taken By</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {usageHistory.map((log, index) => (
                    <tr key={index}>
                      <td>{new Date(log.date).toLocaleString()}</td>
                      <td>
                        <span className={`type-badge ${log.type.toLowerCase()}`}>
                          {log.type}
                        </span>
                      </td>
                      <td>{log.quantity}</td>
                      <td>{log.location?.name || '-'}</td>
                      <td>{log.takenBy}</td>
                      <td>{log.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsageTracker;