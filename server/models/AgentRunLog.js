const mongoose = require('mongoose');
const { Schema } = mongoose;

const AgentRunLogSchema = new Schema(
  {
    caseFileId: {
      type: Schema.Types.ObjectId,
      ref: 'CaseFile',
      required: true,
      index: true,
    },
    steps: [
      {
        tool: { type: String, required: true },
        input: { type: Schema.Types.Mixed },
        output: { type: Schema.Types.Mixed },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('AgentRunLog', AgentRunLogSchema);
