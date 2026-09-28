const mongoose = require('mongoose');
const { Schema } = mongoose;

const TransactionSchema = new Schema(
  {
    fromAccount: {
      type: String,
      required: true,
      index: true,
    },
    toAccount: {
      type: String,
      required: true,
      index: true,
    },
    amountUSD: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    paymentFormat: {
      type: String,
      required: true,
    },
    narration: {
      type: String,
      default: '',
    },
    // Ground truth label, strictly for post-hoc evaluation and benchmarking.
    // The investigator agent MUST NEVER query or see this field during triage.
    isLaunderingLabel: {
      type: Boolean,
      required: true,
      default: false,
    },
    anomalyScore: {
      type: Number,
      default: 0.0, // filled in by ML service
    },
    flagged: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for high-performance graph BFS and velocity lookups
TransactionSchema.index({ fromAccount: 1, timestamp: 1 });
TransactionSchema.index({ toAccount: 1, timestamp: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
