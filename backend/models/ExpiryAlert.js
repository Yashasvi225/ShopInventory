const mongoose = require("mongoose");
const { EXPIRY_STORES } = require("../domain/expiryAlerts");

const schema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    expiryDay: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    shopType: { type: String, enum: EXPIRY_STORES, required: true },
    dismissedAt: { type: Date, default: null },
    recommendationStatus: {
      type: String,
      enum: ["PENDING", "GENERATING", "READY", "UNAVAILABLE", "NO_DATA"],
      default: "PENDING",
    },
    recommendation: { type: mongoose.Schema.Types.Mixed, default: null },
    attempts: { type: Number, default: 0 },
    retryAt: { type: Date, default: null },
    leaseUntil: { type: Date, default: null },
    claim: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Persistence and an atomic claim protect against refreshes and multiple API
// processes racing on the same product/expiry event.
schema.index({ createdBy: 1, product: 1, expiryDay: 1 }, { unique: true });
schema.index({ recommendationStatus: 1, retryAt: 1 });
schema.index({ createdBy: 1, store: 1 });
module.exports = mongoose.model("ExpiryAlert", schema);
