const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Product = require("../models/Product");
const Supplier = require("../models/Supplier");
const Store = require("../models/Store");
const mongoose = require("mongoose");
const { selectedStores } = require("../utils/storeSelection");
const {
  validShopType,
  requiredString,
  optionalString,
} = require("../utils/validators");
const {
  validatedEmail,
  registrationPassword,
  loginPassword,
} = require("../utils/authValidation");
function tokenFor(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}
async function register(req, res, next) {
  try {
    const name = requiredString(req.body.name, "name"),
      email = validatedEmail(req.body.email),
      password = registrationPassword(req.body.password);
    // Omitted selections preserve the existing two-step API for legacy clients.
    const types =
      req.body.shopTypes === undefined
        ? []
        : selectedStores(req.body.shopTypes);
    if (await User.exists({ email }))
      return res.status(409).json({ message: "Email already registered" });
    const user = await mongoose.connection.transaction(async (session) => {
      const [created] = await User.create(
        [{ name, email, password, shopType: types[0] || null }],
        { session },
      );
      if (types.length)
        await Store.create(
          types.map((shopType) => ({
            createdBy: created._id,
            shopType,
            name: "",
          })),
          { session, ordered: true },
        );
      return created;
    });
    res.status(201).json({ token: tokenFor(user), user });
  } catch (e) {
    next(e);
  }
}
async function login(req, res, next) {
  try {
    const email = validatedEmail(req.body.email);
    const password = loginPassword(req.body.password);
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid email" });
    }
      if(!await user.comparePassword(password)){
      return res.status(401).json({ message: "Invalid password" });}
    const safeUser = await User.findById(user._id);
    res.json({ token: tokenFor(user), user: safeUser });
  } catch (e) {
    next(e);
  }
}
async function setShopType(req, res, next) {
  try {
    const shopType =
      typeof req.body.shopType === "string"
        ? req.body.shopType.toUpperCase()
        : "";
    if (!validShopType(shopType))
      return res
        .status(400)
        .json({
          message: "Please select Medical, Restaurant, Grocery or Clothing",
        });
    const existingStores = await Store.find({ createdBy: req.user._id });
    if (existingStores.length > 1)
      return res
        .status(409)
        .json({
          message:
            "Use the store selector to switch between your configured stores.",
        });
    const [incompatibleProducts, incompatibleSuppliers] = await Promise.all([
      Product.exists({ createdBy: req.user._id, shopType: { $ne: shopType } }),
      Supplier.exists({ createdBy: req.user._id, shopType: { $ne: shopType } }),
    ]);
    if (incompatibleProducts || incompatibleSuppliers) {
      return res
        .status(409)
        .json({
          message:
            "This shop has products or suppliers for another store type. Keep its current type to preserve existing records.",
        });
    }
    const name = optionalString(req.body.shopName, "shopName");
    await mongoose.connection.transaction(async (session) => {
      const old = await Store.findOne({ createdBy: req.user._id }).session(
        session,
      );
      if (old && old.shopType !== shopType) {
        for (const table of [
          "products",
          "suppliers",
          "sales",
          "stocktransactions",
          "expiryalerts",
        ]) {
          if (
            await mongoose.connection.db
              .collection(table)
              .findOne({ createdBy: req.user._id }, { session })
          ) {
            const error = new Error(
              "This store has historical records. Keep its current type to preserve them.",
            );
            error.statusCode = 409;
            throw error;
          }
        }
        await old.deleteOne({ session });
      }
      await Store.findOneAndUpdate(
        { createdBy: req.user._id, shopType },
        { $set: { name } },
        { upsert: true, new: true, session, runValidators: true },
      );
      req.user.shopType = shopType;
      req.user.shopName = name;
      await req.user.save({ session });
    });
    res.json({ user: req.user });
  } catch (error) {
    next(error);
  }
}
function getShopType(req, res) {
  res.json({ user: req.user });
}
module.exports = { register, login, setShopType, getShopType };
