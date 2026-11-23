# Kho lạnh: IoT + Blockchain

Giám sát nhiệt độ kho bảo quản chuỗi lạnh bằng ESP32, và dùng blockchain để **không bên nào sửa được dữ liệu âm thầm sau khi đã ghi nhận**.

Dự án kế thừa hạ tầng IoT từ đồ án *Nhà thông minh*. Phần đóng góp mới là lớp blockchain (xem [mục 8](#8-kế-thừa-và-đóng-góp-mới)). Kế hoạch gốc: [KE_HOACH.md](KE_HOACH.md).

## 1. Bài toán

Kho lạnh (vắc xin, thuốc, thực phẩm) phải lưu nhật ký nhiệt độ cho chủ hàng và cơ quan thanh tra. Nhật ký nằm trong cơ sở dữ liệu của kho nên kho có lý do để sửa khi xảy ra sự cố. Chủ hàng và thanh tra không có cách kiểm tra.

Giải pháp: cứ mỗi 5 phút, hệ thống tính mã hash của lô dữ liệu cảm biến mới và ghi hash đó lên blockchain, giống một con dấu niêm phong. Sau này ai sửa dữ liệu trong MySQL thì hash tính lại sẽ không khớp với hash trên chain.

| Bên | Vai trò trong smart contract | Được làm gì |
|---|---|---|
| Kho | Kho (backend giữ khóa) | Ghi hash lô, ghi sự kiện |
| Chủ hàng | Chủ hàng (MetaMask) | Đặt ngưỡng nhiệt cho phép |
| Thanh tra | Thanh tra (MetaMask) | Xác nhận một sự kiện, kèm ghi chú |

Kho không đổi được ngưỡng và không xác nhận thay thanh tra, vì hai việc đó cần chữ ký ví của bên kia.

## 2. Kiến trúc

```
ESP32 (ESPHome) ──MQTT──► Mosquitto ──► Backend Node.js ──► MySQL (Docker)   dữ liệu thô
                                            │
                                            └──────────────► Smart contract KhoLanh
                                                              hash của lô + sự kiện
Dashboard React ──► đọc dữ liệu từ backend, tự tính hash và tự đọc chain
                └─► MetaMask: chủ hàng đặt ngưỡng, thanh tra xác nhận
```

- Dữ liệu thô nằm trong MySQL. Blockchain chỉ giữ hash và sự kiện, nên không có dữ liệu cá nhân và phí thấp.
- Chia lô theo khoảng `id` của bảng `cam_bien_data`. Hash = keccak256 của các dòng `id|topic|gia_tri|giây` nối bằng `\n` (xem `backend/hash.js`).
- Sự kiện (vượt ngưỡng, máy lạnh bật/tắt, cửa mở) được ghi lên chain ngay khi xảy ra.
- Nút **Kiểm tra** trên dashboard tự tính hash và tự đọc hash từ chain ngay trong trình duyệt, không tin kết luận của server.

## 3. Yêu cầu

Node.js 20+, Docker Desktop, trình duyệt có MetaMask, và một ESP32 đã nạp firmware ESPHome gửi topic `nha/phongkhach/...` về broker Mosquitto (container `mosquitto`, cổng 1883).

## 4. Chạy trên máy (chain local)

```bash
# 1. MySQL (cổng 3307) và Mosquitto
docker compose up -d
docker start mosquitto

# 2. Chain local + contract (giữ terminal này mở)
cd contracts && npm install
npx hardhat node
# terminal khác, trong contracts/:
npx hardhat run scripts/deploy.js --network localhost
# chép địa chỉ contract in ra

# 3. Backend
cd backend && npm install
cp .env.example .env        # điền CONTRACT_ADDRESS, đặt BATCH_MS=30000 nếu muốn thấy lô sớm
node index.js

# 4. Dashboard
cd dashboard && npm install
npx vite --port 5174        # mở http://localhost:5174
```

Chạy test: `cd contracts && npx hardhat test` (12 test), `cd backend && node --test hash.test.js` (4 test).

### MetaMask trên chain local

Dashboard tự thêm mạng "Hardhat Local" (chainId 31337, RPC `http://127.0.0.1:8545`) khi bạn bấm Kết nối. Cần nhập hai khóa thử nghiệm **công khai** của Hardhat để đóng vai chủ hàng và thanh tra:

| Vai trò | Tài khoản Hardhat | Khóa riêng |
|---|---|---|
| Chủ hàng | #2 `0x3C44…93BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| Thanh tra | #3 `0x90F7…b906` | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |

Hai khóa này ai cũng biết. Chỉ dùng trên chain local, tuyệt đối không dùng cho mạng thật.

## 5. Kịch bản demo

1. Mở dashboard: nhiệt độ kho cập nhật trực tiếp.
2. Ở khung **Xác thực dữ liệu**, bấm Kiểm tra một lô: ✅ Nguyên vẹn.
3. Nhiệt độ vượt ngưỡng (ví dụ cầm tay lên cảm biến): sự kiện hiện trong **Nhật ký sự kiện**, ghi lên chain ngay.
4. Đóng vai kho gian lận, sửa một dòng của lô trong MySQL:
   ```bash
   docker exec kho-lanh-mysql mysql -ukholanh -pkholanh_dev kho_lanh \
     -e "UPDATE cam_bien_data SET gia_tri='6.0' WHERE id=4"
   ```
5. Bấm Kiểm tra lại: ❌ Đã bị chỉnh sửa, hiện hai hash khác nhau.
6. Kết nối MetaMask bằng ví **chủ hàng**, đổi ngưỡng nhiệt. Ngưỡng mới nằm trên chain.
7. Chuyển sang ví **thanh tra**, bấm Xác nhận một sự kiện, nhập ghi chú, ký.
8. (Tùy chọn) Thử gọi `datNguong` bằng ví của kho: contract từ chối.

## 6. Chạy trên Sepolia (mạng thử nghiệm công khai)

Cần: một RPC Sepolia miễn phí (Alchemy hoặc Infura), ETH thử nghiệm từ faucet, và **ví mới chỉ dùng để thử nghiệm**.

1. Tạo 3 ví MetaMask mới: kho, chủ hàng, thanh tra. Xin ETH Sepolia cho ví kho và ví triển khai.
2. Trong `backend/.env` điền:
   ```
   RPC_URL=<RPC Sepolia>
   SEPOLIA_RPC_URL=<RPC Sepolia>
   DEPLOYER_KEY=<khóa ví triển khai>
   KHO_KEY=<khóa ví kho>
   KHO_ADDRESS=<địa chỉ ví kho>
   CHUHANG_ADDRESS=<địa chỉ ví chủ hàng>
   THANHTRA_ADDRESS=<địa chỉ ví thanh tra>
   CHAIN_ID=11155111
   CHAIN_NAME=Sepolia
   EXPLORER_TX_URL=https://sepolia.etherscan.io/tx/
   ```
3. Triển khai: `cd contracts && npx hardhat run scripts/deploy.js --network sepolia`, rồi điền `CONTRACT_ADDRESS`.
4. Chạy lại backend. Xóa các lô cũ trong bảng `lo_du_lieu` nếu trước đó dùng chain local (con trỏ lô lấy từ chain, chain mới sẽ bắt đầu lại từ lô 0).

File `.env` đã nằm trong `.gitignore`. Không commit khóa riêng.

## 7. Hạn chế

- **Dữ liệu làm giả trước khi ghi hash** thì blockchain không phát hiện được (ví dụ cảm biến lắp sai, hoặc sửa dòng trong 2 giây đầu trước khi gom lô). Hướng phát triển: ESP32 tự ký từng bản tin.
- **DHT11 sai số ±2°C**, độ phân giải 1°C: đây là mô hình thu nhỏ, chưa đủ cho kho vắc xin thật. Nên đổi sang DS18B20.
- **Nhiệt độ phòng không xuống được 2–8°C**: khi demo hãy đặt ngưỡng theo nhiệt độ phòng hoặc cho cảm biến vào thùng đá.
- **Backend giữ trạng thái "đang vượt ngưỡng" trong bộ nhớ**: khởi động lại khi nhiệt độ đang cao sẽ ghi thêm một sự kiện vượt ngưỡng.
- **Mỗi lô chỉ bảo vệ dữ liệu từ lúc đã neo**: trong tối đa 5 phút chờ gom lô, dữ liệu chưa được niêm phong. Sự kiện quan trọng thì ghi ngay nên không bị chờ.
- **Chưa kiểm toán bảo mật contract** bằng công cụ chuyên dụng, và dashboard chưa có đăng nhập.
- Backend bật "chế độ thủ công" trên ESP32 khi khởi động, nên tự động hóa của dự án nhà thông minh trên board đó tạm tắt.

## 8. Kế thừa và đóng góp mới

| Kế thừa từ đồ án IoT (Nhà thông minh) | Đóng góp mới của đồ án Blockchain |
|---|---|
| Phần cứng ESP32 và các cảm biến | Smart contract `KhoLanh.sol` và bộ kiểm thử Hardhat |
| Firmware ESPHome | Gom lô và neo hash lên chain |
| Luồng MQTT → Node.js → MySQL | Ghi sự kiện lên chain theo thời gian thực |
| Biểu đồ và thẻ cảm biến trên dashboard | Phân vai trò: kho, chủ hàng, thanh tra |
| | Xác thực phía trình duyệt, không cần tin server |
| | Tích hợp ví MetaMask |
| | Bài toán nghiệp vụ chuỗi lạnh |

## 9. Cấu trúc thư mục

```
backend/      Node.js: MQTT, MySQL, gom lô, API (hash.js, chain.js, index.js)
contracts/    Hardhat: KhoLanh.sol, test, script triển khai
dashboard/    React + Vite: Blockchain.jsx (xác thực, nhật ký, ví)
docker-compose.yml   MySQL 8 (cổng 3307)
```
