import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './OrderReview.css';

const OrderReview = () => {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
    fetchInventoryItems();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await axios.get('/api/inventory/orders');
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInventoryItems = async () => {
    try {
      const response = await axios.get('/api/inventory/items');
      setInventoryItems(response.data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const handleOrderSelect = (order) => {
    setSelectedOrder(order);
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.put(`/api/inventory/orders/${orderId}`, { status });
      fetchOrders();
      alert(`Order status updated to ${status}`);
    } catch (error) {
      console.error('Error updating order:', error);
      alert('Error updating order status');
    }
  };

  const handlePrintOrder = () => {
    window.print();
  };

  if (loading) return <div>Loading orders...</div>;

  return (
    <div className="order-review-container">
      <h1>Order Review System</h1>
      
      <div className="order-layout">
        <div className="order-list no-print">
          <h2>Orders</h2>
          <div className="order-filters">
            <button className="filter-btn active">All</button>
            <button className="filter-btn">Draft</button>
            <button className="filter-btn">Pending</button>
            <button className="filter-btn">Submitted</button>
          </div>
          
          <div className="orders">
            {orders.map(order => (
              <div 
                key={order._id} 
                className={`order-card ${selectedOrder?._id === order._id ? 'selected' : ''}`}
                onClick={() => handleOrderSelect(order)}
              >
                <div className="order-header">
                  <span className="order-number">{order.orderNumber}</span>
                  <span className={`order-status ${order.status.toLowerCase()}`}>
                    {order.status}
                  </span>
                </div>
                <div className="order-info">
                  <p>Supplier: {order.supplier}</p>
                  <p>Date: {new Date(order.orderDate).toLocaleDateString()}</p>
                  <p>Items: {order.items.length}</p>
                  <p>Total: ${order.totalAmount.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="order-details">
          {selectedOrder ? (
            <>
              <div className="detail-header">
                <h2>Order Details - {selectedOrder.orderNumber}</h2>
                <div className="detail-actions no-print">
                  <button onClick={handlePrintOrder} className="btn-action">
                    Print Order
                  </button>
                  {selectedOrder.status === 'Draft' && (
                    <button 
                      onClick={() => updateOrderStatus(selectedOrder._id, 'Submitted')}
                      className="btn-action btn-submit"
                    >
                      Submit Order
                    </button>
                  )}
                </div>
              </div>
              
              <div className="order-metadata">
                <div className="metadata-item">
                  <label>Supplier:</label>
                  <span>{selectedOrder.supplier}</span>
                </div>
                <div className="metadata-item">
                  <label>Order Date:</label>
                  <span>{new Date(selectedOrder.orderDate).toLocaleDateString()}</span>
                </div>
                <div className="metadata-item">
                  <label>Status:</label>
                  <span className={`order-status ${selectedOrder.status.toLowerCase()}`}>
                    {selectedOrder.status}
                  </span>
                </div>
                <div className="metadata-item">
                  <label>Created By:</label>
                  <span>{selectedOrder.createdBy}</span>
                </div>
              </div>
              
              <table className="order-items-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Order Quantity</th>
                    <th>Unit Price</th>
                    <th>Total Price</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item, index) => (
                    <tr key={index}>
                      <td>{item.inventoryItem?.name || 'Unknown Item'}</td>
                      <td>{item.inventoryItem?.category || '-'}</td>
                      <td className="stock-qty">{item.currentQuantity}</td>
                      <td className="order-qty">{item.orderQuantity}</td>
                      <td>${item.unitPrice.toFixed(2)}</td>
                      <td>${item.totalPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="5" className="total-label">Total Amount:</td>
                    <td className="total-amount">${selectedOrder.totalAmount.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
              
              {selectedOrder.notes && (
                <div className="order-notes">
                  <h3>Notes:</h3>
                  <p>{selectedOrder.notes}</p>
                </div>
              )}
            </>
          ) : (
            <div className="no-selection">
              <p>Select an order to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderReview;