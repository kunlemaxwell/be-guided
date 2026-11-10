/** Smallest byte headers that real files of each format start with. */
function bytes(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === 'string') for (const ch of p) out.push(ch.charCodeAt(0));
    else out.push(...p);
  }
  while (out.length < 32) out.push(0);
  return Uint8Array.from(out);
}

export const MAGIC = {
  png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpeg: bytes([0xff, 0xd8, 0xff, 0xe0]),
  gif: bytes('GIF89a'),
  webp: bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '),
  mp4: bytes([0, 0, 0, 0x18], 'ftypmp42'),
  webm: bytes([0x1a, 0x45, 0xdf, 0xa3]),
};
