import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './MinMaxReport.css';

const MinMaxReport = () => {
  const [report, setReport] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMinMaxReport();
  }, []);

  const fetchMinMaxReport = async () => {
    try {
      const response = await axios.get('/api/inventory/reports/min-max');
      setReport(response.data);
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredReport = report.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'below-min') return item.status === 'Below Min';
    if (filter === 'above-max') return item.status === 'Above Max';
    if (filter === 'needs-order') return item.orderQuantity > 0;
    return true;
  });

  const generateOrder = async () => {
    try {
      const response = await axios.post('/api/inventory/orders/generate', {
        createdBy: prompt('Enter your name:') || 'System'
      });
      
      if (response.data.message) {
        alert(response.data.message);
      } else {
        alert(`Order ${response.data.orderNumber} created successfully!`);
        fetchMinMaxReport();
      }
    } catch (error) {
      console.error('Error generating order:', error);
      alert('Error generating order');
    }
  };

  const exportToCSV = () => {
    const headers = ['Item Name', 'Category', 'Current Qty', 'Min Qty', 'Max Qty', 'Status', 'Order Qty'];
    const rows = filteredReport.map(item => [
      item.name,
      item.category,
      item.currentQuantity,
      item.minQuantity,
      item.maxQuantity,
      item.status,
      item.orderQuantity
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) return <div>Loading report...</div>;

  return (
    <div className="minmax-report-container">
      <h1>Min/Max Inventory Report</h1>
      
      <div className="report-controls">
        <div className="filter-group">
          <label>Filter:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Items</option>
            <option value="below-min">Below Minimum</option>
            <option value="above-max">Above Maximum</option>
            <option value="needs-order">Needs Ordering</option>
          </select>
        </div>
        
        <div className="action-buttons">
          <button onClick={generateOrder} className="btn-generate">
            Generate Order
          </button>
          <button onClick={exportToCSV} className="btn-export">
            Export to CSV
          </button>
          <button onClick={() => window.print()} className="btn-print">
            Print Report
          </button>
        </div>
      </div>

      <div className="report-summary">
        <div className="summary-card">
          <h3>Total Items</h3>
          <p>{report.length}</p>
        </div>
        <div className="summary-card alert">
          <h3>Below Minimum</h3>
          <p>{report.filter(i => i.status === 'Below Min').length}</p>
        </div>
        <div className="summary-card warning">
          <h3>Above Maximum</h3>
          <p>{report.filter(i => i.status === 'Above Max').length}</p>
        </div>
        <div className="summary-card info">
          <h3>Need Ordering</h3>
          <p>{report.filter(i => i.orderQuantity > 0).length}</p>
        </div>
      </div>

      <table className="report-table">
        <thead>
          <tr>
            <th>Item Name</th>
            <th>Category</th>
            <th>Current Qty</th>
            <th>Min Qty</th>
            <th>Max Qty</th>
            <th>Status</th>
            <th>Suggested Order Qty</th>
          </tr>
        </thead>
        <tbody>
          {filteredReport.map((item, index) => (
            <tr key={index} className={`status-${item.status.toLowerCase().replace(' ', '-')}`}>
              <td>{item.name}</td>
              <td>{item.category}</td>
              <td>{item.currentQuantity}</td>
              <td>{item.minQuantity}</td>
              <td>{item.maxQuantity}</td>
              <td>
                <span className={`status-badge ${item.status.toLowerCase().replace(' ', '-')}`}>
                  {item.status}
                </span>
              </td>
              <td>{item.orderQuantity > 0 ? item.orderQuantity : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MinMaxReport;