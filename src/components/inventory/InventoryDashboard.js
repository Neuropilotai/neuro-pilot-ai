import React, { useState } from 'react';
import CountSheet from './CountSheet';
import MinMaxReport from './MinMaxReport';
import OrderReview from './OrderReview';
import UsageTracker from './UsageTracker';
import './InventoryDashboard.css';

const InventoryDashboard = () => {
  const [activeTab, setActiveTab] = useState('count');

  const tabs = [
    { id: 'count', label: 'Count Sheets', icon: '📋' },
    { id: 'usage', label: 'Usage Tracker', icon: '📤' },
    { id: 'report', label: 'Min/Max Report', icon: '📊' },
    { id: 'orders', label: 'Order Review', icon: '📦' }
  ];

  return (
    <div className="inventory-dashboard">
      <header className="dashboard-header">
        <h1>Camp Inventory Management System</h1>
        <div className="header-info">
          <span>200-400 People Camp Site</span>
          <span>11 Storage Locations</span>
        </div>
      </header>
      
      <nav className="dashboard-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
      
      <main className="dashboard-content">
        {activeTab === 'count' && <CountSheet />}
        {activeTab === 'usage' && <UsageTracker />}
        {activeTab === 'report' && <MinMaxReport />}
        {activeTab === 'orders' && <OrderReview />}
      </main>
    </div>
  );
};

export default InventoryDashboard;