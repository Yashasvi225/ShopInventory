const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    sellingPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
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

saleSchema.index({ createdBy: 1, date: -1 });
saleSchema.index({ createdBy: 1, store: 1 });
module.exports = mongoose.model("Sale", saleSchema);
