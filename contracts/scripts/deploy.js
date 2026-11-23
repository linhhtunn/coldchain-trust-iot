const hre = require('hardhat');

async function main() {
  const kho = await hre.ethers.deployContract('KhoLanh');
  await kho.waitForDeployment();
  console.log('KhoLanh đã triển khai tại:', await kho.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
