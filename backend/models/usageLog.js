const mongoose = require('mongoose');

const usageLogSchema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true
  },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['Usage', 'Return', 'Adjustment', 'Transfer'],
    default: 'Usage'
  },
  takenBy: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    trim: true
  },
  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UsageLog', usageLogSchema);