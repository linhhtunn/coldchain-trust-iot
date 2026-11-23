const test = require('node:test');
const assert = require('node:assert');
const { tinhHash } = require('./hash');

const rows = [
  { id: 1, topic: 'nha/phongkhach/nhietdo/state', gia_tri: '5.0', ts: 1700000000 },
  { id: 2, topic: 'nha/phongkhach/doam/state', gia_tri: '80', ts: 1700000001 },
];

test('cùng dữ liệu thì cùng hash, không phụ thuộc thứ tự đưa vào', () => {
  assert.strictEqual(tinhHash(rows), tinhHash([...rows].reverse()));
});

test('sửa một giá trị thì hash đổi', () => {
  const suaDoi = rows.map((r) => (r.id === 1 ? { ...r, gia_tri: '6.0' } : r));
  assert.notStrictEqual(tinhHash(rows), tinhHash(suaDoi));
});

test('xóa một dòng thì hash đổi', () => {
  assert.notStrictEqual(tinhHash(rows), tinhHash(rows.slice(1)));
});

test('hash có dạng 0x + 64 ký tự hex', () => {
  assert.match(tinhHash(rows), /^0x[0-9a-f]{64}$/);
});
