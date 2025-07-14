const mongoose = require('mongoose');

const countSheetSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  countedBy: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['In Progress', 'Completed', 'Reviewed'],
    default: 'In Progress'
  },
  items: [{
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      required: true
    },
    countedQuantity: {
      type: Number,
      required: true
    },
    systemQuantity: {
      type: Number,
      required: true
    },
    variance: {
      type: Number,
      default: 0
    },
    notes: String
  }],
  completedAt: Date,
  reviewedBy: String,
  reviewedAt: Date
}, {
  timestamps: true
});

countSheetSchema.pre('save', function(next) {
  this.items.forEach(item => {
    item.variance = item.countedQuantity - item.systemQuantity;
  });
  next();
});

module.exports = mongoose.model('CountSheet', countSheetSchema);