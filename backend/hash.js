const { keccak256, toUtf8Bytes } = require('ethers');

// Mỗi dòng: id|topic|gia_tri|giây (UNIX_TIMESTAMP), nối bằng \n, đã sắp theo id.
// Dashboard dùng đúng công thức này để tự tính lại hash trong trình duyệt.
function tinhHash(rows) {
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  const chuoi = sorted.map((r) => `${r.id}|${r.topic}|${r.gia_tri}|${r.ts}`).join('\n');
  return keccak256(toUtf8Bytes(chuoi));
}

module.exports = { tinhHash };
