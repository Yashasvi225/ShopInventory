const mongoose = require("mongoose");

const stockTransactionSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    type: { type: String, enum: ["STOCK_IN", "STOCK_OUT"], required: true },
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String, trim: true, default: "" },
    date: { type: Date, default: Date.now },
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { versionKey: false },
);

stockTransactionSchema.index({ createdBy: 1, date: -1 });
stockTransactionSchema.index({ createdBy: 1, store: 1 });
module.exports = mongoose.model("StockTransaction", stockTransactionSchema);
