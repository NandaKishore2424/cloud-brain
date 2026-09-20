import * as Crypto from 'expo-crypto';

/**
 * UUIDv7 generation.
 *
 * Why v7 and not v4: a v7 UUID embeds a 48-bit millisecond timestamp in its
 * leading bits, so IDs sort chronologically as plain strings. Three payoffs
 * for a local-first app:
 *
 *  1. Index locality. New rows append to the right of the B-tree instead of
 *     landing at random offsets, which keeps inserts cheap as the table grows.
 *  2. Free ordering. `ORDER BY id` is already "oldest first" — no secondary
 *     sort on created_at, no extra index.
 *  3. Sync-friendly. The client mints IDs offline with no coordination and
 *     effectively zero collision risk, so a row keeps one identity from the
 *     moment it is created on-device through to Postgres (Phase 4).
 *
 * Layout (RFC 9562):
 *   bytes 0-5   48-bit big-endian unix millisecond timestamp
 *   byte  6     high nibble = version (7), low nibble = random
 *   byte  7     random
 *   byte  8     top two bits = variant (0b10), rest random
 *   bytes 9-15  random
 */
export function newId(): string {
  const bytes = Crypto.getRandomBytes(16);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const ms = Date.now();
  // Split the 48-bit timestamp: top 16 bits, then low 32 bits.
  view.setUint16(0, Math.floor(ms / 0x1_0000_0000));
  view.setUint32(2, ms >>> 0);

  // Stamp version 7 into the high nibble of byte 6, keeping the random low nibble.
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x70);
  // Stamp the RFC 9562 variant (0b10) into the top two bits of byte 8.
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);

  let hex = '';
  for (let i = 0; i < 16; i += 1) {
    hex += view.getUint8(i).toString(16).padStart(2, '0');
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Extract the creation time encoded in a v7 id. Useful when debugging sync. */
export function timestampFromId(id: string): number | null {
  const hex = id.replace(/-/g, '');
  if (hex.length !== 32) return null;
  const ms = Number.parseInt(hex.slice(0, 12), 16);
  return Number.isNaN(ms) ? null : ms;
}
