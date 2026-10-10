const mongoose = require("mongoose");
const { SHOP_TYPES, FASHION_TYPES } = require("../domain/storeTypes");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    category: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    purchasePrice: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, min: 0, required: true },
    quantity: { type: Number, min: 0, default: 0 },
    minimumStock: { type: Number, min: 0, default: 0 },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },
    expiryDate: { type: Date, default: null },
    fashionType: {
      type: String,
      enum: [...FASHION_TYPES, null],
      default: null,
      required: function () {
        return this.shopType === "CLOTHING";
      },
      validate: {
        validator: function (value) {
          return value == null || this.shopType === "CLOTHING";
        },
        message:
          "Fashion classification is only available for Clothing products.",
      },
    },
    shopType: { type: String, enum: SHOP_TYPES, required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);

// Clothing has no expiry semantics, including when older clients send a date.
productSchema.pre("validate", function () {
  if (this.shopType === "CLOTHING") this.expiryDate = null;
});

productSchema.index({ createdBy: 1, sku: 1 }, { unique: true });
productSchema.index({ createdBy: 1, quantity: 1 });
productSchema.index({ createdBy: 1, expiryDate: 1 });

productSchema.index({ createdBy: 1, store: 1 });
module.exports = mongoose.model("Product", productSchema);
