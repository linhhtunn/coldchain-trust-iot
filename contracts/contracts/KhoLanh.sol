// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KhoLanh - neo hash dữ liệu cảm biến và nhật ký sự kiện của kho lạnh
/// @notice Chỉ lưu mã hash và sự kiện, không lưu dữ liệu thô. Nhiệt độ tính theo đơn vị 0.1°C (85 = 8.5°C).
contract KhoLanh {
    enum VaiTro { Khong, Kho, ChuHang, ThanhTra }
    enum LoaiSuKien { VuotNguong, TroLaiBinhThuong, MayLanhBat, MayLanhTat, CuaMo }

    struct Lo {
        uint64 tuId;       // id dòng đầu trong cam_bien_data
        uint64 denId;      // id dòng cuối
        bytes32 maHash;
        uint64 thoiGian;
    }

    struct SuKien {
        LoaiSuKien loai;
        int32 giaTri;      // nhiệt độ lúc xảy ra (0.1°C), hoặc 0 nếu không liên quan
        uint64 thoiGianDo; // thời điểm cảm biến đo
        uint64 thoiGianGhi;
        bool daXacNhan;
        address thanhTra;
        string ghiChu;
    }

    address public immutable quanTri;
    mapping(address => VaiTro) public vaiTro;

    Lo[] public cacLo;
    SuKien[] public cacSuKien;

    int32 public nguongMin = 20; // 2.0°C
    int32 public nguongMax = 80; // 8.0°C

    event VaiTroDuocCap(address indexed diaChi, VaiTro vaiTro);
    event LoDuocNeo(uint256 indexed idLo, uint64 tuId, uint64 denId, bytes32 maHash);
    event SuKienDuocGhi(uint256 indexed idSuKien, LoaiSuKien loai, int32 giaTri, uint64 thoiGianDo);
    event SuKienDuocXacNhan(uint256 indexed idSuKien, address indexed thanhTra, string ghiChu);
    event NguongDoi(address indexed chuHang, int32 nguongMin, int32 nguongMax);

    modifier chiVaiTro(VaiTro v) {
        require(vaiTro[msg.sender] == v, "Sai vai tro");
        _;
    }

    constructor() {
        quanTri = msg.sender;
    }

    function capVaiTro(address diaChi, VaiTro v) external {
        require(msg.sender == quanTri, "Chi quan tri");
        vaiTro[diaChi] = v;
        emit VaiTroDuocCap(diaChi, v);
    }

    /// @notice Kho neo hash của lô dòng [tuId, denId]. Lô sau phải bắt đầu sau lô trước, nên không ghi đè hay chồng lấn được.
    function neoLo(uint64 tuId, uint64 denId, bytes32 maHash) external chiVaiTro(VaiTro.Kho) {
        require(tuId <= denId, "Khoang id sai");
        if (cacLo.length > 0) require(tuId > cacLo[cacLo.length - 1].denId, "Lo chong lan");
        cacLo.push(Lo(tuId, denId, maHash, uint64(block.timestamp)));
        emit LoDuocNeo(cacLo.length - 1, tuId, denId, maHash);
    }

    function ghiSuKien(LoaiSuKien loai, int32 giaTri, uint64 thoiGianDo) external chiVaiTro(VaiTro.Kho) {
        cacSuKien.push(SuKien(loai, giaTri, thoiGianDo, uint64(block.timestamp), false, address(0), ""));
        emit SuKienDuocGhi(cacSuKien.length - 1, loai, giaTri, thoiGianDo);
    }

    /// @notice Chủ hàng đặt ngưỡng nhiệt cho phép; kho không tự nới ngưỡng được.
    function datNguong(int32 min, int32 max) external chiVaiTro(VaiTro.ChuHang) {
        require(min < max, "Nguong sai");
        nguongMin = min;
        nguongMax = max;
        emit NguongDoi(msg.sender, min, max);
    }

    function xacNhanSuKien(uint256 idSuKien, string calldata ghiChu) external chiVaiTro(VaiTro.ThanhTra) {
        require(idSuKien < cacSuKien.length, "Khong co su kien");
        SuKien storage s = cacSuKien[idSuKien];
        require(!s.daXacNhan, "Da xac nhan");
        s.daXacNhan = true;
        s.thanhTra = msg.sender;
        s.ghiChu = ghiChu;
        emit SuKienDuocXacNhan(idSuKien, msg.sender, ghiChu);
    }

    function soLo() external view returns (uint256) { return cacLo.length; }
    function soSuKien() external view returns (uint256) { return cacSuKien.length; }
}
