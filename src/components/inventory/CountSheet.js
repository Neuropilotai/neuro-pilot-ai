import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CountSheet.css';

const CountSheet = () => {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [items, setItems] = useState([]);
  const [countData, setCountData] = useState({});
  const [countedBy, setCountedBy] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      fetchItemsForLocation(selectedLocation);
    }
  }, [selectedLocation]);

  const fetchLocations = async () => {
    try {
      const response = await axios.get('/api/inventory/locations');
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchItemsForLocation = async (locationId) => {
    setLoading(true);
    try {
      const response = await axios.get('/api/inventory/items');
      const locationItems = response.data.filter(item => 
        item.locations.some(loc => loc.locationId._id === locationId)
      );
      setItems(locationItems);
      
      const initialCounts = {};
      locationItems.forEach(item => {
        const locationData = item.locations.find(loc => loc.locationId._id === locationId);
        initialCounts[item._id] = {
          systemQuantity: locationData?.quantity || 0,
          countedQuantity: ''
        };
      });
      setCountData(initialCounts);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCountChange = (itemId, value) => {
    setCountData(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        countedQuantity: value
      }
    }));
  };

  const handleSubmit = async () => {
    if (!countedBy) {
      alert('Please enter your name');
      return;
    }

    const countSheetData = {
      location: selectedLocation,
      countedBy,
      status: 'Completed',
      items: Object.entries(countData).map(([itemId, data]) => ({
        inventoryItem: itemId,
        systemQuantity: data.systemQuantity,
        countedQuantity: parseInt(data.countedQuantity) || 0
      }))
    };

    try {
      await axios.post('/api/inventory/count-sheets', countSheetData);
      alert('Count sheet submitted successfully!');
      setCountedBy('');
      setSelectedLocation('');
      setItems([]);
      setCountData({});
    } catch (error) {
      console.error('Error submitting count sheet:', error);
      alert('Error submitting count sheet');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="count-sheet-container">
      <h1>Inventory Count Sheet</h1>
      
      <div className="no-print">
        <div className="form-group">
          <label>Select Location:</label>
          <select 
            value={selectedLocation} 
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">-- Select Location --</option>
            {locations.map(location => (
              <option key={location._id} value={location._id}>
                {location.name} ({location.type})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Counted By:</label>
          <input
            type="text"
            value={countedBy}
            onChange={(e) => setCountedBy(e.target.value)}
            placeholder="Enter your name"
          />
        </div>
      </div>

      {selectedLocation && (
        <>
          <div className="count-header">
            <h2>Location: {locations.find(l => l._id === selectedLocation)?.name}</h2>
            <p>Date: {new Date().toLocaleDateString()}</p>
            <p>Counted By: {countedBy || '_________________'}</p>
          </div>

          {loading ? (
            <p>Loading items...</p>
          ) : (
            <table className="count-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>System Qty</th>
                  <th>Counted Qty</th>
                  <th>Variance</th>
                  <th className="no-print">Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const data = countData[item._id] || {};
                  const variance = data.countedQuantity 
                    ? parseInt(data.countedQuantity) - data.systemQuantity 
                    : 0;
                  
                  return (
                    <tr key={item._id}>
                      <td>{item.name}</td>
                      <td>{item.category}</td>
                      <td>{item.unit}</td>
                      <td>{data.systemQuantity}</td>
                      <td>
                        <input
                          type="number"
                          value={data.countedQuantity}
                          onChange={(e) => handleCountChange(item._id, e.target.value)}
                          className="count-input"
                          placeholder="0"
                        />
                      </td>
                      <td className={variance !== 0 ? 'variance' : ''}>
                        {data.countedQuantity ? variance : '-'}
                      </td>
                      <td className="no-print">
                        <input type="text" className="notes-input" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="actions no-print">
            <button onClick={handlePrint} className="btn-print">
              Print Count Sheet
            </button>
            <button onClick={handleSubmit} className="btn-submit">
              Submit Count
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CountSheet;