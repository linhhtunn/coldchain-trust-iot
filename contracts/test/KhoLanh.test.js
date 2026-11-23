const { expect } = require('chai');
const { ethers } = require('hardhat');

const VT = { Khong: 0, Kho: 1, ChuHang: 2, ThanhTra: 3 };
const SK = { VuotNguong: 0, TroLaiBinhThuong: 1, MayLanhBat: 2, MayLanhTat: 3, CuaMo: 4 };
const HASH = ethers.keccak256(ethers.toUtf8Bytes('lo 1'));

describe('KhoLanh', () => {
  let c, quanTri, kho, chuHang, thanhTra, nguoiLa;

  beforeEach(async () => {
    [quanTri, kho, chuHang, thanhTra, nguoiLa] = await ethers.getSigners();
    c = await ethers.deployContract('KhoLanh');
    await c.capVaiTro(kho.address, VT.Kho);
    await c.capVaiTro(chuHang.address, VT.ChuHang);
    await c.capVaiTro(thanhTra.address, VT.ThanhTra);
  });

  describe('vai trò', () => {
    it('chỉ quản trị được cấp vai trò', async () => {
      await expect(c.connect(kho).capVaiTro(nguoiLa.address, VT.ThanhTra)).to.be.revertedWith('Chi quan tri');
    });
    it('thu hồi vai trò thì mất quyền ghi', async () => {
      await c.capVaiTro(kho.address, VT.Khong);
      await expect(c.connect(kho).neoLo(1, 5, HASH)).to.be.revertedWith('Sai vai tro');
    });
  });

  describe('neoLo', () => {
    it('kho neo được lô và lưu đúng hash', async () => {
      await expect(c.connect(kho).neoLo(1, 5, HASH)).to.emit(c, 'LoDuocNeo').withArgs(0, 1, 5, HASH);
      const lo = await c.cacLo(0);
      expect(lo.maHash).to.equal(HASH);
      expect(lo.tuId).to.equal(1);
      expect(lo.denId).to.equal(5);
      expect(await c.soLo()).to.equal(1);
    });
    it('chủ hàng, thanh tra, người lạ và cả quản trị đều không neo được', async () => {
      for (const s of [chuHang, thanhTra, nguoiLa, quanTri]) {
        await expect(c.connect(s).neoLo(1, 5, HASH)).to.be.revertedWith('Sai vai tro');
      }
    });
    it('không ghi đè hay chồng lấn lô đã có', async () => {
      await c.connect(kho).neoLo(1, 5, HASH);
      await expect(c.connect(kho).neoLo(1, 5, HASH)).to.be.revertedWith('Lo chong lan');
      await expect(c.connect(kho).neoLo(5, 9, HASH)).to.be.revertedWith('Lo chong lan');
      await c.connect(kho).neoLo(6, 9, HASH); // lô liền sau thì được
    });
    it('từ chối khoảng id ngược', async () => {
      await expect(c.connect(kho).neoLo(9, 5, HASH)).to.be.revertedWith('Khoang id sai');
    });
  });

  describe('sự kiện', () => {
    it('kho ghi sự kiện, người khác không ghi được', async () => {
      await expect(c.connect(kho).ghiSuKien(SK.VuotNguong, 95, 1700000000))
        .to.emit(c, 'SuKienDuocGhi').withArgs(0, SK.VuotNguong, 95, 1700000000);
      await expect(c.connect(thanhTra).ghiSuKien(SK.CuaMo, 0, 1)).to.be.revertedWith('Sai vai tro');
      expect(await c.soSuKien()).to.equal(1);
    });
    it('thanh tra xác nhận một lần, kèm ghi chú', async () => {
      await c.connect(kho).ghiSuKien(SK.VuotNguong, 95, 1700000000);
      await expect(c.connect(kho).xacNhanSuKien(0, 'ok')).to.be.revertedWith('Sai vai tro');
      await c.connect(thanhTra).xacNhanSuKien(0, 'Da kiem tra tai kho');
      const s = await c.cacSuKien(0);
      expect(s.daXacNhan).to.equal(true);
      expect(s.thanhTra).to.equal(thanhTra.address);
      expect(s.ghiChu).to.equal('Da kiem tra tai kho');
      await expect(c.connect(thanhTra).xacNhanSuKien(0, 'lai')).to.be.revertedWith('Da xac nhan');
    });
    it('không xác nhận được sự kiện không tồn tại', async () => {
      await expect(c.connect(thanhTra).xacNhanSuKien(7, 'x')).to.be.revertedWith('Khong co su kien');
    });
  });

  describe('ngưỡng nhiệt', () => {
    it('mặc định 2.0–8.0°C', async () => {
      expect(await c.nguongMin()).to.equal(20);
      expect(await c.nguongMax()).to.equal(80);
    });
    it('chủ hàng đổi được, kho thì không (không nới ngưỡng để che sự cố)', async () => {
      await expect(c.connect(chuHang).datNguong(0, 100)).to.emit(c, 'NguongDoi').withArgs(chuHang.address, 0, 100);
      expect(await c.nguongMax()).to.equal(100);
      await expect(c.connect(kho).datNguong(0, 500)).to.be.revertedWith('Sai vai tro');
    });
    it('từ chối ngưỡng min >= max', async () => {
      await expect(c.connect(chuHang).datNguong(80, 20)).to.be.revertedWith('Nguong sai');
    });
  });
});
