// Only resolveStore may establish this scope. Body/query fields never grant access.
function scope(req) {
  if (!req.store || String(req.store.createdBy) !== String(req.user._id)) {
    const error = new Error('Select an authorized store first.'); error.statusCode = 400; throw error;
  }
  return { createdBy: req.user._id, store: req.store._id };
}
module.exports = { scope };
