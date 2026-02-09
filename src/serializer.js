/**
 * MessagePack Alternative (simple JSON-based implementation)
 * Used for efficient data serialization in Stremio protocol
 */

// Since we're using Node.js 20+, we'll use JSON for serialization
// For production, consider using 'msgpack5' package

function encode(obj) {
  return JSON.stringify(obj);
}

function decode(data) {
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error('Error decoding data:', e);
    return null;
  }
}

export { encode, decode };
