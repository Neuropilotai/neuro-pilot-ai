const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  orderDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  deliveryDate: {
    type: Date
  },
  supplier: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Draft', 'Pending', 'Submitted', 'Delivered', 'Cancelled'],
    default: 'Draft'
  },
  items: [{
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      required: true
    },
    currentQuantity: {
      type: Number,
      required: true
    },
    orderQuantity: {
      type: Number,
      required: true
    },
    unitPrice: {
      type: Number,
      default: 0
    },
    totalPrice: {
      type: Number,
      default: 0
    }
  }],
  totalAmount: {
    type: Number,
    default: 0
  },
  notes: String,
  createdBy: {
    type: String,
    required: true
  },
  approvedBy: String,
  approvedAt: Date
}, {
  timestamps: true
});

orderSchema.pre('save', function(next) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const day = String(new Date().getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  
  if (!this.orderNumber) {
    this.orderNumber = `ORD-${year}${month}${day}-${random}`;
  }
  
  this.totalAmount = this.items.reduce((sum, item) => {
    item.totalPrice = item.orderQuantity * item.unitPrice;
    return sum + item.totalPrice;
  }, 0);
  
  next();
});

module.exports = mongoose.model('Order', orderSchema);