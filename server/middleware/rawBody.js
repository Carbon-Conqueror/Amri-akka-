'use strict';

// Captures the exact raw bytes of the request body so webhook signature
// verification can HMAC the untouched payload Razorpay signed - not a
// re-serialization of the parsed JSON, which can differ byte-for-byte
// (key order, spacing) and would make every signature check fail.
function captureRawBody(req, res, buf) {
  req.rawBody = buf;
}

module.exports = { captureRawBody };
