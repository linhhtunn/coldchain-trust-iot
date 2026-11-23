require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config({ path: '../backend/.env' });

module.exports = {
  solidity: '0.8.24',
  networks: {
    localhost: { url: 'http://127.0.0.1:8545' },
    // Giai đoạn 6: điền SEPOLIA_RPC_URL và DEPLOYER_KEY vào backend/.env (chỉ dùng ví thử nghiệm)
    ...(process.env.SEPOLIA_RPC_URL && process.env.DEPLOYER_KEY
      ? { sepolia: { url: process.env.SEPOLIA_RPC_URL, accounts: [process.env.DEPLOYER_KEY] } }
      : {}),
  },
};
