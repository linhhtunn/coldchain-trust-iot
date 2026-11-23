const hre = require('hardhat');

// Trên mạng local: dùng sẵn tài khoản 1, 2, 3 của Hardhat làm kho, chủ hàng, thanh tra.
// Trên Sepolia: điền KHO_ADDRESS, CHUHANG_ADDRESS, THANHTRA_ADDRESS (địa chỉ ví, không phải khóa) vào backend/.env.
const VAI_TRO = { KHO_ADDRESS: 1, CHUHANG_ADDRESS: 2, THANHTRA_ADDRESS: 3 };

async function main() {
  const signers = await hre.ethers.getSigners();
  const laMangLocal = ['hardhat', 'localhost'].includes(hre.network.name);
  const kho = await hre.ethers.deployContract('KhoLanh');
  await kho.waitForDeployment();
  console.log('KhoLanh đã triển khai tại:', await kho.getAddress());

  for (const [bien, vaiTro] of Object.entries(VAI_TRO)) {
    const diaChi = process.env[bien] || (laMangLocal ? signers[vaiTro].address : null);
    if (!diaChi) { console.warn(`Bỏ qua ${bien}: chưa có địa chỉ`); continue; }
    await (await kho.capVaiTro(diaChi, vaiTro)).wait();
    console.log(`Đã cấp vai trò ${vaiTro} (${bien}) cho ${diaChi}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
