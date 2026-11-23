const { ethers } = require('ethers');

const ABI = [
  'function neoLo(uint64 tuId, uint64 denId, bytes32 maHash)',
  'function ghiSuKien(uint8 loai, int32 giaTri, uint64 thoiGianDo)',
  'function soLo() view returns (uint256)',
  'function cacLo(uint256) view returns (uint64 tuId, uint64 denId, bytes32 maHash, uint64 thoiGian)',
  'function soSuKien() view returns (uint256)',
  'function cacSuKien(uint256) view returns (uint8 loai, int32 giaTri, uint64 thoiGianDo, uint64 thoiGianGhi, bool daXacNhan, address thanhTra, string ghiChu)',
  'function nguongMin() view returns (int32)',
  'function nguongMax() view returns (int32)',
];

const LOAI_SU_KIEN = ['VuotNguong', 'TroLaiBinhThuong', 'MayLanhBat', 'MayLanhTat', 'CuaMo'];

// Trả về null nếu chưa cấu hình, khi đó backend vẫn chạy như bản chưa có blockchain.
function khoiTaoChain({ rpcUrl, khoKey, diaChi }) {
  if (!rpcUrl || !khoKey || !diaChi) return null;
  const wallet = new ethers.Wallet(khoKey, new ethers.JsonRpcProvider(rpcUrl));
  return new ethers.Contract(diaChi, ABI, wallet);
}

// Giao dịch chạy lần lượt để không đụng nonce khi nhiều sự kiện đến cùng lúc.
let hangDoi = Promise.resolve();
function xepHang(viec) {
  const ketQua = hangDoi.then(viec);
  hangDoi = ketQua.catch(() => {});
  return ketQua;
}

module.exports = { khoiTaoChain, xepHang, LOAI_SU_KIEN };
