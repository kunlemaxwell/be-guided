// Reads JSON from stdin and prints one field of the first array item whose
// `match` field equals `value`:  ... --json | node json-pick.mjs name be-guided uuid
// Prints nothing if there is no match. Used by setup.sh to find existing resources.
let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  const [match, value, field] = process.argv.slice(2);
  try {
    const start = raw.search(/[[{]/);
    const data = JSON.parse(start >= 0 ? raw.slice(start) : raw);
    const list = Array.isArray(data) ? data : Object.values(data).find(Array.isArray) ?? [];
    const hit = list.find((x) => x && x[match] === value);
    if (hit && hit[field] !== undefined) console.log(String(hit[field]));
  } catch {
    // not JSON: print nothing
  }
});
