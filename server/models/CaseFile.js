const mongoose = require('mongoose');
const { Schema } = mongoose;

const CaseFileSchema = new Schema(
  {
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
      index: true,
    },
    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    evidence: {
      type: [String],
      default: [], // human-readable findings from each tool call
    },
    reasoningTrace: {
      type: [Schema.Types.Mixed],
      default: [], // full agent step log
    },
    verdict: {
      type: String, // agent's recommended action
      required: true,
    },
    status: {
      type: String, // "pending" | "approved" | "dismissed"
      enum: ['pending', 'approved', 'dismissed'],
      default: 'pending',
      index: true,
    },
    reviewedBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('CaseFile', CaseFileSchema);
