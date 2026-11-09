// Convert GLB -> embedded glTF JSON (buffer as base64 data URI) so it can be served as .json
const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  let off = 12, json = null, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    const chunk = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(chunk.toString('utf8')); else if (type === 0x004E4942) bin = chunk;
    off += 8 + len;
  }
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
  fs.writeFileSync(f.replace(/\.glb$/, '.gltf.json'), JSON.stringify(json));
  fs.unlinkSync(f);
}
