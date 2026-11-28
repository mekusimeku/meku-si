// MEKU proof-of-work image cleaner: the part shared by the page and the Node tests.
// Plain JavaScript on Uint8Array. No imports, no Node or browser APIs beyond TextEncoder and
// TextDecoder, and no network: build-clean-image.mjs copies this file into the page unchanged,
// apart from removing the word "export".

/** A Uint8Array with exactly the Buffer methods the POW image scanner in lib.mjs uses. */
export class ByteBuffer extends Uint8Array {
  static from(value, encoding) {
    if (typeof value === "string") {
      if (encoding === "latin1" || encoding === "binary") {
        const out = new ByteBuffer(value.length);
        for (let i = 0; i < value.length; i += 1) out[i] = value.charCodeAt(i) & 0xff;
        return out;
      }
      if (encoding !== undefined && encoding !== "utf8" && encoding !== "utf-8") throw new TypeError(`unsupported encoding ${encoding}`);
      const bytes = new TextEncoder().encode(value);
      return new ByteBuffer(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    if (value instanceof ArrayBuffer) return new ByteBuffer(value.slice(0));
    if (ArrayBuffer.isView(value)) {
      const out = new ByteBuffer(value.byteLength);
      out.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      return out;
    }
    if (Array.isArray(value)) {
      const out = new ByteBuffer(value.length);
      for (let i = 0; i < value.length; i += 1) out[i] = value[i];
      return out;
    }
    throw new TypeError("ByteBuffer.from needs a string, an array or bytes");
  }

  static isBuffer(value) {
    return value instanceof ByteBuffer;
  }

  static concat(list) {
    let total = 0;
    for (const part of list) total += part.length;
    const out = new ByteBuffer(total);
    let at = 0;
    for (const part of list) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }

  readUInt16BE(offset) {
    return dataView(this).getUint16(offset, false);
  }

  readUInt16LE(offset) {
    return dataView(this).getUint16(offset, true);
  }

  readUInt32BE(offset) {
    return dataView(this).getUint32(offset, false);
  }

  readUInt32LE(offset) {
    return dataView(this).getUint32(offset, true);
  }

  // Node's rules for the range: a missing or negative start is 0, an end past the bytes is the
  // end, and an empty range gives "".
  toString(encoding = "utf8", start, end) {
    const length = this.length;
    const from = start === undefined || start < 0 ? 0 : Math.trunc(start);
    const to = end === undefined || end > length ? length : Math.trunc(end);
    if (from >= length || to <= from) return "";
    const part = this.subarray(from, to);
    if (encoding === "latin1" || encoding === "binary") {
      let text = "";
      for (let i = 0; i < part.length; i += 8192) text += String.fromCharCode.apply(null, part.subarray(i, i + 8192));
      return text;
    }
    if (encoding === "utf8" || encoding === "utf-8") return new TextDecoder("utf-8").decode(part);
    throw new TypeError(`unsupported encoding ${encoding}`);
  }

  equals(other) {
    if (!(other instanceof Uint8Array) || other.length !== this.length) return false;
    for (let i = 0; i < this.length; i += 1) if (this[i] !== other[i]) return false;
    return true;
  }

  indexOf(needle, from = 0) {
    if (typeof needle === "number") return Uint8Array.prototype.indexOf.call(this, needle, from);
    if (!(needle instanceof Uint8Array)) throw new TypeError("indexOf needs a byte or bytes");
    if (from < 0) throw new RangeError("a negative offset is not supported");
    const start = Math.trunc(from) || 0;
    if (needle.length === 0) return Math.min(start, this.length);
    outer: for (let i = start; i + needle.length <= this.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) if (this[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  }

  includes(needle, from = 0) {
    return this.indexOf(needle, from) !== -1;
  }
}

function dataView(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 that PNG chunks carry. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes) {
  return bytes.length >= 8 && PNG_SIGNATURE_BYTES.every((b, i) => bytes[i] === b);
}

export function isJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

const latin1 = (bytes) => String.fromCharCode.apply(null, bytes);

/** The chunks of a PNG in order, and how many bytes follow IEND. Throws on a damaged file. */
export function readPngChunks(bytes) {
  if (!isPng(bytes)) throw new Error("not a PNG file");
  const view = dataView(bytes);
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (length > 0x7fffffff || end > bytes.length) throw new Error("a chunk runs past the end of the file");
    const type = latin1(bytes.subarray(offset + 4, offset + 8));
    const crcOk = crc32(bytes.subarray(offset + 4, end - 4)) === view.getUint32(end - 4);
    chunks.push({ type, start: offset, end, data: bytes.subarray(offset + 8, end - 4), crcOk });
    offset = end;
    if (type === "IEND") return { chunks, trailing: bytes.length - offset };
  }
  throw new Error("the file has no IEND chunk");
}

// What a picture needs: its header, palette and transparency, and its pixels. Nothing else.
const PIXEL_CHUNKS = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

/**
 * The same PNG with every chunk dropped except IHDR, PLTE, tRNS, IDAT and IEND, and nothing after
 * IEND. Colour profiles go too: the page draws every picture as sRGB, which a PNG without colour
 * chunks means. Throws on a PNG that is damaged or has no pixels.
 */
export function pngEssentialChunks(bytes) {
  const { chunks } = readPngChunks(bytes);
  if (chunks[0].type !== "IHDR" || chunks[0].data.length !== 13 || chunks.filter((c) => c.type === "IHDR").length !== 1)
    throw new Error("the PNG does not start with exactly one header");
  if (!chunks.some((c) => c.type === "IDAT")) throw new Error("the PNG holds no pixel data");
  const kept = chunks.filter((c) => PIXEL_CHUNKS.has(c.type));
  if (kept.some((c) => !c.crcOk)) throw new Error("a pixel chunk of the PNG is damaged");
  let total = 8;
  for (const c of kept) total += c.end - c.start;
  const out = new Uint8Array(total);
  out.set(PNG_SIGNATURE_BYTES, 0);
  let at = 8;
  for (const c of kept) {
    out.set(bytes.subarray(c.start, c.end), at);
    at += c.end - c.start;
  }
  return out;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Whether the PNG's pixel data is complete: it inflates without error to exactly the size its
 * header promises. A cut stream can still carry valid CRCs and pass the metadata check, and
 * some decoders show it anyway. null where this browser cannot inflate (no DecompressionStream).
 */
export async function pngPixelDataComplete(bytes) {
  if (typeof DecompressionStream !== "function") return null;
  const { chunks } = readPngChunks(bytes);
  const ihdr = chunks[0].data;
  const view = dataView(ihdr);
  const [width, height, depth, colour, interlace] = [view.getUint32(0), view.getUint32(4), ihdr[8], ihdr[9], ihdr[12]];
  if (!(colour in CHANNELS) || interlace !== 0) return false;
  const expected = height * (1 + Math.ceil((width * CHANNELS[colour] * depth) / 8));
  const idat = joinBytes(chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
  try {
    const reader = new Blob([idat]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > expected) {
        await reader.cancel();
        return false;
      }
    }
    return total === expected;
  } catch {
    return false;
  }
}

/** Chunk types of a PNG, in order (for tests and the page's report). */
export function pngChunkTypes(bytes) {
  return readPngChunks(bytes).chunks.map((c) => c.type);
}

const PNG_NAMES = {
  eXIf: "EXIF data",
  zxIf: "EXIF data",
  iCCP: "colour profile",
  sRGB: "colour tag",
  gAMA: "colour tag",
  cHRM: "colour tag",
  cICP: "colour tag",
  mDCv: "colour tag",
  cLLi: "colour tag",
  sBIT: "colour tag",
  pHYs: "pixel density",
  tIME: "time stamp",
  tEXt: "text notes",
  zTXt: "text notes",
  iTXt: "text notes",
  iDOT: "Apple layout data",
  bKGD: "background colour",
  acTL: "animation",
  fcTL: "animation",
  fdAT: "animation",
};

/** The hidden parts of an image file, in words, for the page to say what it removed. */
export function describeHiddenData(bytes) {
  const found = [];
  const add = (what) => {
    if (!found.includes(what)) found.push(what);
  };
  if (isPng(bytes)) {
    try {
      const { chunks, trailing } = readPngChunks(bytes);
      for (const c of chunks) {
        if (PIXEL_CHUNKS.has(c.type)) continue;
        if (c.type === "iTXt" && latin1(c.data.subarray(0, 18)) === "XML:com.adobe.xmp\0") add("XMP data");
        else add(PNG_NAMES[c.type] ?? `chunk ${c.type}`);
      }
      if (trailing > 0) add("data after the end of the image");
    } catch {
      add("a damaged or unusual file structure");
    }
    return found;
  }
  if (isJpeg(bytes)) {
    let offset = 2;
    let ended = false;
    while (offset + 2 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0xd9) {
        offset += 2;
        ended = true;
        break;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (offset + 4 > bytes.length) break;
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      const seg = bytes.subarray(offset + 4, offset + 2 + length);
      const head = (n) => latin1(seg.subarray(0, n));
      if (marker === 0xe0) add(head(5) === "JFIF\0" ? "JFIF header" : head(5) === "JFXX\0" ? "thumbnail" : "segment APP0");
      else if (marker === 0xe1) add(head(6) === "Exif\0\0" ? "EXIF data" : head(4) === "http" ? "XMP data" : "segment APP1");
      else if (marker === 0xe2) add(head(12) === "ICC_PROFILE\0" ? "colour profile" : head(4) === "MPF\0" ? "extra images (MPF)" : "segment APP2");
      else if (marker === 0xed) add(head(14) === "Photoshop 3.0\0" ? "Photoshop data" : "segment APP13");
      else if (marker === 0xee) add("Adobe colour flag");
      else if (marker === 0xfe) add("comment");
      else if (marker >= 0xe3 && marker <= 0xef) add(`segment APP${marker - 0xe0}`);
      if (marker === 0xda) {
        // The pixels: skip them up to the end-of-image marker.
        let i = offset + 2 + length;
        while (i + 1 < bytes.length && !(bytes[i] === 0xff && bytes[i + 1] !== 0x00 && !(bytes[i + 1] >= 0xd0 && bytes[i + 1] <= 0xd7))) i += 1;
        offset = i;
        continue;
      }
      offset += 2 + length;
    }
    if (!ended) add("a damaged or unusual file structure");
    else if (offset < bytes.length) add("data after the end of the image");
    return found;
  }
  const head = latin1(bytes.subarray(0, 12));
  if (head.slice(4, 8) === "ftyp") add("a HEIC or HEIF file, with its EXIF data");
  else if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") add("a WebP file, with any data it holds");
  else if (head.startsWith("GIF8")) add("a GIF file, with any data it holds");
  else add("a file in another format, with any data it holds");
  return found;
}

// ---- Test images with hidden data, for the page's self-test and the Node tests ----------

/** One PNG chunk with its length and CRC. */
export function makePngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = dataView(out);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** The PNG with the given chunks inserted just before IEND. */
export function withPngChunks(png, extra) {
  const { chunks } = readPngChunks(png);
  const iend = chunks[chunks.length - 1];
  const parts = [png.subarray(0, iend.start), ...extra, png.subarray(iend.start, iend.end)];
  return joinBytes(parts);
}

/** The JPEG with the given [marker, payload] segments inserted just after its start marker. */
export function withJpegSegments(jpeg, segments) {
  const parts = [jpeg.subarray(0, 2)];
  for (const [marker, payload] of segments) {
    const head = new Uint8Array([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
    parts.push(head, payload);
  }
  parts.push(jpeg.subarray(2));
  return joinBytes(parts);
}

export function joinBytes(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export const asciiBytes = (text) => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);

/** A TIFF block, as EXIF holds it, whose first directory points at GPS data. */
export function testExifTiff() {
  const t = new Uint8Array(32);
  const v = dataView(t);
  t.set(asciiBytes("II*\0"), 0);
  v.setUint32(4, 8, true);
  v.setUint16(8, 1, true);
  v.setUint16(10, 0x8825, true);
  v.setUint16(12, 4, true);
  v.setUint32(14, 1, true);
  v.setUint32(18, 26, true);
  v.setUint32(22, 0, true);
  v.setUint16(26, 0, true);
  return t;
}

/** An XMP packet naming a place and an editing program, like the ones phones and editors add. */
export const TEST_XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about="" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">' +
  "<photoshop:City>Testville</photoshop:City><xmp:CreatorTool>Test editor</xmp:CreatorTool>" +
  "</rdf:Description></rdf:RDF></x:xmpmeta>";

/** PNG chunks like a phone's: EXIF with GPS, XMP, a text note and a time stamp. */
export function testPngMetadata() {
  return [
    makePngChunk("eXIf", testExifTiff()),
    makePngChunk("iTXt", joinBytes([asciiBytes("XML:com.adobe.xmp\0\0\0\0\0"), new TextEncoder().encode(TEST_XMP)])),
    makePngChunk("tEXt", asciiBytes("Software\0Test editor")),
    makePngChunk("tIME", new Uint8Array([0x07, 0xea, 11, 28, 7, 0, 0])),
  ];
}

/** JPEG segments like an edited photo's: EXIF with GPS, Photoshop data, XMP and a comment. */
export function testJpegMetadata() {
  const iptcCaption = joinBytes([new Uint8Array([0x1c, 0x02, 0x78, 0x00, 0x04]), asciiBytes("test")]);
  const resource = joinBytes([asciiBytes("8BIM"), new Uint8Array([0x04, 0x04, 0, 0, 0, 0, 0, iptcCaption.length]), iptcCaption, new Uint8Array(iptcCaption.length % 2)]);
  return [
    [0xe1, joinBytes([asciiBytes("Exif\0\0"), testExifTiff()])],
    [0xed, joinBytes([asciiBytes("Photoshop 3.0\0"), resource])],
    [0xe1, joinBytes([asciiBytes("http://ns.adobe.com/xap/1.0/\0"), new TextEncoder().encode(TEST_XMP)])],
    [0xfe, asciiBytes("Test comment")],
  ];
}
