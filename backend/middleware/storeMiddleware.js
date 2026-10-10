const Store = require("../models/Store");
const { isValidObjectId } = require("../utils/validators");
async function resolveStore(req, res, next) {
  try {
    const supplied = req.headers["x-store-id"];
    if (
      supplied !== undefined &&
      (typeof supplied !== "string" || !isValidObjectId(supplied))
    ) {
      return res.status(400).json({ message: "Invalid store ID" });
    }
    const filter = {
      createdBy: req.user._id,
      ...(supplied === undefined
        ? { shopType: req.user.shopType }
        : { _id: supplied }),
    };
    req.store = await Store.findOne(filter);
    if (!req.store)
      return res
        .status(supplied === undefined ? (req.user.shopType ? 409 : 400) : 404)
        .json({
          message:
            supplied === undefined
              ? "Select a shop type before continuing."
              : "Store not found",
        });
    // Do not silently accept forged ownership fields on an otherwise authorized request.
    for (const key of ["store", "storeId", "createdBy"]) {
      const expected = key === "createdBy" ? req.user._id : req.store._id;
      if (
        [req.body?.[key], req.query[key]].some(
          (value) => value !== undefined && String(value) !== String(expected),
        )
      ) {
        return res
          .status(400)
          .json({ message: "Record ownership must match the active store." });
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}
module.exports = { resolveStore };
