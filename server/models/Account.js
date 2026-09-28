const mongoose = require('mongoose');
const { Schema } = mongoose;

const AccountSchema = new Schema(
  {
    accountId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    bankId: {
      type: String,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    riskFlags: {
      type: [String],
      default: [], // populated by the agent over time
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Account', AccountSchema);
