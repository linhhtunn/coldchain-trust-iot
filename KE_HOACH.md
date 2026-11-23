# Kế hoạch: Giám sát kho lạnh bằng IoT và Blockchain

Trạng thái: **chờ duyệt**. Chưa có dòng code nào được viết.

Tên đề tài đề xuất: *"Ứng dụng Blockchain trong giám sát và xác thực dữ liệu nhiệt độ kho bảo quản chuỗi lạnh dựa trên nền tảng IoT"*.

---

## 1. Mục tiêu

Xây một dự án riêng cho môn Blockchain, tách từ đồ án nhà thông minh. Dự án chứng minh được một việc: **dữ liệu cảm biến của kho lạnh không thể bị sửa âm thầm sau khi đã ghi nhận**, và các bên liên quan (kho, chủ hàng, thanh tra) tự kiểm tra được điều đó.

Phạm vi đã chốt: **Mức 2**, gồm:

1. Ghi mã hash của từng lô dữ liệu cảm biến lên blockchain, có nút xác thực.
2. Ghi các sự kiện quan trọng lên blockchain ngay khi xảy ra (vượt ngưỡng nhiệt, bật/tắt máy lạnh).
3. Phân vai trò trong smart contract (kho, chủ hàng, thanh tra).

Không làm: ESP32 tự ký dữ liệu (Mức 3), đăng nhập tài khoản, chatbot.

---

## 2. Hiện trạng đã kiểm tra

| Thành phần | Hiện trạng | Ghi chú |
|---|---|---|
| MySQL | **Cài thẳng trên Windows** (dịch vụ `MySQL80`, cổng 3306). Không chạy trong Docker. | Database `nha_thong_minh`, user `iotapp` |
| Mosquitto (MQTT) | Chạy trong Docker, container tên `mosquitto` | Lúc kiểm tra đang tắt |
| Home Assistant | Chạy trong Docker, container tên `homeassistant` | Lúc kiểm tra đang tắt |
| Backend | `nha-thong-minh-backend/index.js`, 331 dòng. Cổng 3000 (API) và 8081 (WebSocket) viết cứng trong code | Nghe topic `nha/phongkhach/#`, ghi mọi bản tin vào bảng `cam_bien_data` |
| Dashboard | `nha-thong-minh-dashboard/src/App.jsx`, 1211 dòng, một file | React, Vite, Recharts |
| Firmware | ESPHome, cấu hình ở `bao-cao/work/firmware-report.yaml` | Không sửa |
| File tạo bảng MySQL | **Không có trong repo** | Phải xuất từ database đang chạy |

Phần cứng: DHT11 (nhiệt độ, độ ẩm), cảm biến chuyển động PIR, cảm biến ánh sáng LDR, relay, đèn LED, còi.

---

## 3. Các quyết định

### Bạn đã chốt
- Giữ nguyên firmware. Backend mới vẫn nghe topic `nha/phongkhach/...`, chỉ đổi tên hiển thị.
- Database của dự án mới chạy trong Docker.
- Làm Mức 2.
- Nộp cho môn Blockchain, nên báo cáo phải tách rõ phần kế thừa và phần mới (mục 10).

### Mình đề xuất, cần bạn duyệt

**D1. Mạng blockchain: Hardhat khi phát triển, Sepolia khi demo.**
Câu hỏi này lúc trước bạn chưa rõ, mình giải thích lại:
- **Hardhat** là một blockchain giả lập chạy ngay trên máy bạn. Miễn phí, không cần mạng, giao dịch xong tức thì. Dùng để viết và thử code.
- **Sepolia** là mạng thử nghiệm công khai của Ethereum. Cũng miễn phí (dùng ETH thử nghiệm xin từ trang faucet), nhưng ai trên thế giới cũng xem được giao dịch qua trang Etherscan. Dùng khi demo, để thầy cô thấy dữ liệu nằm trên một mạng không thuộc về bạn.
- Code giống hệt nhau cho cả hai, chỉ đổi địa chỉ mạng trong file `.env`. Nếu hôm demo mạng lỗi thì chuyển về Hardhat.

**D2. Vị trí dự án (đã chốt):** thư mục `D:\Đại Học Điện Lực\Nam 4 ky 1\Blockchain\kho-lanh-blockchain`, là một repo git riêng, đẩy lên `https://github.com/linhhtunn/coldchain-trust-iot.git`.

**D3. MySQL mới chạy ở cổng 3307**, vì cổng 3306 đang do MySQL cài trên Windows dùng. Hai database độc lập, dự án nhà thông minh không bị ảnh hưởng.

**D4. Dùng chung Mosquitto đang có.** Không tạo broker MQTT mới, vì ESP32 đang trỏ vào broker này (`192.168.0.102:1883`). Hai backend cùng nhận dữ liệu từ một ESP32.

**D5. Bỏ khỏi bản copy:** chatbot và Ollama, quản lý thói quen người dùng, phát hiện bất thường theo trung bình 7 ngày. Thay bằng cảnh báo vượt ngưỡng nhiệt của kho.

**D6. Thanh tra và chủ hàng dùng ví MetaMask trên trình duyệt.** Backend chỉ giữ khóa của vai trò "kho". Như vậy vai trò mới có ý nghĩa thật: kho không thể giả làm thanh tra. Cách đơn giản hơn là backend giữ cả ba khóa, bớt khoảng 30 dòng code nhưng lập luận yếu đi. Mình khuyên dùng MetaMask.

**D7. Relay đóng vai máy làm lạnh, và backend mới bật "chế độ thủ công" khi khởi động.**
Firmware hiện tự bật relay khi có chuyển động lúc trời tối (logic nhà thông minh). Trong kho lạnh, relay phải do người vận hành điều khiển. Backend mới gửi lệnh bật chế độ thủ công (topic có sẵn) để tắt tự động hóa đó.
**Hệ quả:** khi backend kho lạnh đang chạy, tự động hóa của dự án nhà thông minh trên board cũng bị tắt. Muốn quay lại thì tắt chế độ thủ công trên dashboard nhà thông minh.

---

## 4. Kiến trúc

```
ESP32 (firmware giữ nguyên)
   │  MQTT  nha/phongkhach/#
   ▼
Mosquitto (Docker, dùng chung)
   │
   ▼
Backend kho lạnh (Node.js, cổng 3001)
   ├─► MySQL (Docker, cổng 3307)        dữ liệu thô, truy vấn nhanh
   ├─► WebSocket (cổng 8082)            dữ liệu trực tiếp cho dashboard
   └─► Smart contract KhoLanh           hash của lô + sự kiện
            ▲
            │ đọc trực tiếp, và ghi bằng MetaMask (chủ hàng, thanh tra)
Dashboard kho lạnh (React, cổng 5174)
```

### Cảm biến đóng vai gì trong kho lạnh

| Cảm biến / thiết bị | Topic (giữ nguyên) | Ý nghĩa trong kho lạnh |
|---|---|---|
| DHT11 nhiệt độ | `.../nhietdo/state` | Nhiệt độ kho, dữ liệu chính |
| DHT11 độ ẩm | `.../doam/state` | Độ ẩm kho |
| Cảm biến ánh sáng | `.../anhsang/state` | Cửa kho mở hoặc đèn kho bật (kho đóng kín thì tối) |
| Cảm biến chuyển động | `.../chuyendong/state` | Có người trong kho |
| Relay | `.../relay/state`, `.../relay/set` | Máy làm lạnh |
| Còi | `.../coi/...` | Còi báo động |
| Đèn LED | `.../den/...` | Đèn báo |

---

## 5. Smart contract `KhoLanh.sol`

Một contract duy nhất, ước tính 70–90 dòng.

### Vai trò

| Vai trò | Ai giữ khóa | Được làm gì |
|---|---|---|
| Quản trị | Ví triển khai contract | Cấp và thu hồi vai trò |
| Kho | Backend (khóa trong `.env`) | Ghi hash của lô, ghi sự kiện |
| Chủ hàng | Ví MetaMask | Đặt ngưỡng nhiệt cho phép (ví dụ 2–8°C) |
| Thanh tra | Ví MetaMask | Xác nhận đã kiểm tra một sự kiện, kèm ghi chú |

Việc **đọc** không cần vai trò: trên blockchain công khai ai cũng đọc được. Vai trò chỉ giới hạn việc **ghi**.

Điểm đáng nói trong báo cáo: **ngưỡng nhiệt do chủ hàng đặt và nằm trên blockchain**. Kho không thể lặng lẽ nới ngưỡng để che sự cố.

### Hàm

| Hàm | Ai gọi | Việc làm |
|---|---|---|
| `capVaiTro(diaChi, vaiTro)` | Quản trị | Cấp hoặc thu hồi vai trò |
| `neoLo(tuId, denId, maHash)` | Kho | Lưu hash của lô dữ liệu, phát event |
| `ghiSuKien(loai, giaTri, thoiGianDo)` | Kho | Ghi sự kiện: vượt ngưỡng, hết vượt ngưỡng, bật/tắt máy lạnh, cửa mở |
| `datNguong(nhietMin, nhietMax)` | Chủ hàng | Đặt ngưỡng nhiệt |
| `xacNhanSuKien(idSuKien, ghiChu)` | Thanh tra | Đánh dấu sự kiện đã được kiểm tra |

### Kiểm thử contract
File test Hardhat, kiểm các ý: đúng vai trò thì ghi được, sai vai trò thì bị từ chối, lô được lưu đúng hash, không ghi đè được lô đã có.

---

## 6. Backend

Copy từ `nha-thong-minh-backend`, rồi sửa.

### Giữ
- Kết nối MQTT, ghi mọi bản tin vào `cam_bien_data`, phát WebSocket.
- `GET /api/lichsu/:loai` (biểu đồ lịch sử).
- `POST /api/relay` và `POST /api/che-do-thu-cong`.

### Xóa
- `/api/chatbot`, `/api/thoi-quen`, `/api/bat-thuong`, hàm `taoTomTat`, hàm `phatHienLenh`.

### Sửa
- Đưa các giá trị viết cứng (cổng 3000, 8081, địa chỉ MQTT) vào `.env`.
- Hàm cảnh báo `kiemTraGoiY`: thay ngưỡng nhà ở (30°C, 33°C) bằng ngưỡng đọc từ contract.

### Thêm

**a) Gom lô và ghi hash (5 phút một lần)**
1. Lấy các dòng trong `cam_bien_data` có `id` lớn hơn `den_id` của lô gần nhất. Không có dòng mới thì bỏ qua.
2. Ghép mỗi dòng thành `id|topic|gia_tri|thời gian dạng số giây`, nối các dòng theo thứ tự `id`, tính keccak256.
3. Gọi `neoLo()`. Giao dịch được xác nhận thì mới ghi một dòng vào bảng `lo_du_lieu`.
4. Giao dịch lỗi thì không ghi gì. Lần chạy sau tự gom lại từ chỗ cũ, không mất dữ liệu.

Hai chi tiết bắt buộc để hash tính lại luôn khớp:
- Chia lô theo khoảng `id`, không theo thời gian.
- Thời gian lấy bằng `UNIX_TIMESTAMP(thoi_gian)` ngay trong câu SQL, để không phụ thuộc múi giờ của máy.

**b) Ghi sự kiện**
- Nhiệt độ bắt đầu vượt ngưỡng: ghi một sự kiện. Trở lại bình thường: ghi một sự kiện nữa. Không ghi mỗi bản tin (code hiện tại đã có sẵn cơ chế chống lặp `goiYTruocDo`, dùng lại).
- Lệnh bật/tắt relay từ dashboard: ghi sự kiện.
- Cảm biến ánh sáng báo cửa mở: ghi sự kiện.

**c) API mới**

| API | Trả về |
|---|---|
| `GET /api/lo-du-lieu` | Danh sách các lô: khoảng id, hash, mã giao dịch, thời gian |
| `GET /api/xac-thuc/:idLo` | Tính lại hash từ MySQL, đọc hash trên chain, trả về hợp lệ hay không |
| `GET /api/lo-du-lieu/:idLo/du-lieu` | Các dòng dữ liệu thô của lô, để dashboard tự tính hash |
| `GET /api/su-kien` | Danh sách sự kiện đọc từ chain |

**d) Bảng mới**
`lo_du_lieu (id, tu_id, den_id, ma_hash, tx_hash, thoi_gian)`.

**e) Kiểm thử**
Một bài test nhỏ cho hàm tính hash: cùng dữ liệu thì ra cùng hash, sửa một ký tự thì hash khác.

Phụ thuộc thêm: chỉ `ethers`.

---

## 7. Dashboard

Copy từ `nha-thong-minh-dashboard`, rồi sửa. Chi tiết từng chỗ sửa trong `App.jsx` sẽ được liệt kê khi bắt đầu Giai đoạn 4, vì file dài 1211 dòng và mình chưa đọc kỹ.

### Giữ
Thẻ cảm biến, biểu đồ nhiệt độ và độ ẩm, điều khiển relay, kết nối WebSocket.

### Xóa
Trang chatbot, phần thói quen người dùng, trang mô tả thiết bị nhà thông minh.

### Đổi
Tên và nhãn: "Phòng khách" thành "Kho lạnh", "Relay" thành "Máy làm lạnh", "Ánh sáng" thành "Cửa kho".

### Thêm

| Khung | Nội dung |
|---|---|
| Xác thực dữ liệu | Bảng các lô. Mỗi lô có nút **Kiểm tra**, kết quả ✅ Nguyên vẹn hoặc ❌ Đã bị sửa, và link Etherscan |
| Nhật ký sự kiện | Danh sách sự kiện trên chain: loại, giá trị, thời gian, đã được thanh tra xác nhận chưa |
| Ngưỡng nhiệt | Hiện ngưỡng đang áp dụng. Chủ hàng kết nối MetaMask để đổi |
| Thanh tra | Thanh tra kết nối MetaMask để xác nhận một sự kiện |

Nút Kiểm tra chạy theo cách: trình duyệt lấy dữ liệu thô của lô, **tự tính hash**, và **tự đọc hash trên chain**. Người kiểm tra không cần tin câu trả lời của server.

---

## 8. Docker

File `docker-compose.yml` của dự án mới chứa **MySQL 8.0**:
- Cổng 3307 trên máy.
- Tự tạo bảng từ `schema.sql` khi chạy lần đầu.
- Dữ liệu lưu trong volume, tắt container không mất.

File `schema.sql` được tạo bằng cách xuất cấu trúc bảng `cam_bien_data` từ MySQL đang chạy, cộng bảng `lo_du_lieu` mới.

Không đưa vào compose: Mosquitto (dùng container sẵn có), Hardhat (chạy bằng lệnh khi cần), backend và dashboard (chạy bằng `npm` cho dễ sửa code).

---

## 9. Các giai đoạn

Mỗi giai đoạn kết thúc bằng một thứ chạy được và kiểm tra được.

| # | Việc | Kiểm tra xong khi |
|---|---|---|
| 1 | Tạo repo mới, copy backend và dashboard, xóa tính năng không dùng, đưa cấu hình vào `.env`. Dựng MySQL bằng Docker | Dashboard mới hiện dữ liệu cảm biến trực tiếp, lấy từ MySQL trong Docker |
| 2 | Viết contract `KhoLanh.sol`, bài test, script triển khai | Test contract đạt hết, triển khai được lên Hardhat |
| 3 | Backend: gom lô, ghi hash, ghi sự kiện, các API mới | Sau 5 phút có lô mới trong `lo_du_lieu` kèm mã giao dịch. API xác thực trả về hợp lệ |
| 4 | Dashboard: khung xác thực, nhật ký sự kiện, đổi tên nhãn | Bấm Kiểm tra ra ✅. Sửa tay một dòng trong MySQL, bấm lại ra ❌ |
| 5 | MetaMask: chủ hàng đặt ngưỡng, thanh tra xác nhận sự kiện | Ví sai vai trò bị contract từ chối. Ví đúng vai trò thì ghi được |
| 6 | Triển khai lên Sepolia, chạy thử toàn bộ | Giao dịch hiện trên Etherscan |
| 7 | README, kịch bản demo, khung báo cáo | Người khác làm theo README dựng được dự án |

Thứ tự này cho phép dừng sau Giai đoạn 4 mà vẫn có sản phẩm hoàn chỉnh ở Mức 1.

---

## 10. Phần kế thừa và phần đóng góp mới (cho báo cáo môn Blockchain)

| Kế thừa từ đồ án IoT | Đóng góp mới của đồ án Blockchain |
|---|---|
| Phần cứng ESP32 và các cảm biến | Smart contract `KhoLanh.sol` và bộ kiểm thử |
| Firmware ESPHome | Cơ chế gom lô và ghi hash lên chain |
| Luồng MQTT → Node.js → MySQL | Ghi sự kiện lên chain theo thời gian thực |
| Biểu đồ và thẻ cảm biến trên dashboard | Phân vai trò: kho, chủ hàng, thanh tra |
| | Xác thực phía trình duyệt, không cần tin server |
| | Tương tác ví MetaMask |
| | Bài toán nghiệp vụ chuỗi lạnh và phân tích các bên |

Báo cáo nên có một mục ghi thẳng điều này. Bạn nên hỏi giảng viên môn Blockchain trước khi làm, vì mỗi giảng viên có quy định riêng về việc dùng lại đồ án cũ.

---

## 11. Kịch bản demo

1. Mở dashboard, cho thấy nhiệt độ kho đang cập nhật trực tiếp.
2. Mở khung Xác thực, bấm Kiểm tra một lô: ✅ Nguyên vẹn. Mở link Etherscan của lô đó.
3. Làm nóng cảm biến (cầm tay hoặc hà hơi) cho vượt ngưỡng. Còi kêu, sự kiện "vượt ngưỡng" hiện trong nhật ký.
4. Đóng vai kho gian lận: vào MySQL sửa nhiệt độ của lô đó về mức an toàn.
5. Bấm Kiểm tra lại: ❌ Đã bị sửa.
6. Đóng vai thanh tra: kết nối MetaMask, xác nhận sự kiện vượt ngưỡng.
7. Thử dùng ví của kho để đổi ngưỡng nhiệt: contract từ chối.

---

## 12. Rủi ro và hạn chế

| Vấn đề | Mức độ | Cách xử lý |
|---|---|---|
| DHT11 sai số ±2°C, độ phân giải 1°C. Không đủ chính xác cho kho vắc xin thật | Hạn chế của mô hình | Ghi rõ trong báo cáo đây là mô hình thu nhỏ. Hướng phát triển: đổi sang DS18B20 |
| Nhiệt độ phòng không xuống được 2–8°C | Ảnh hưởng demo | Ngưỡng nằm trên contract và đổi được. Demo dùng ngưỡng theo nhiệt độ phòng, hoặc đặt cảm biến vào thùng đá |
| Sepolia phụ thuộc mạng và faucet | Ảnh hưởng demo | Chuẩn bị sẵn Hardhat để chuyển sang. Xin ETH thử nghiệm trước vài ngày |
| Lộ khóa riêng của ví | Bảo mật | Khóa chỉ nằm trong `.env`, file này có trong `.gitignore`. Chỉ dùng ví thử nghiệm, không dùng ví có tiền thật |
| Dữ liệu bị làm giả **trước khi** ghi hash | Giới hạn bản chất | Blockchain không phát hiện được. Ghi vào phần hạn chế. Hướng phát triển: ESP32 tự ký dữ liệu (Mức 3) |
| Trong tối đa 5 phút chờ gom lô, dữ liệu chưa được bảo vệ | Giới hạn thiết kế | Sự kiện quan trọng được ghi ngay lên chain, không chờ lô |
| Chế độ thủ công làm tắt tự động hóa của dự án nhà thông minh (D7) | Ảnh hưởng dự án cũ | Tắt chế độ thủ công khi quay lại dùng nhà thông minh |
| Dashboard không có đăng nhập | Ngoài phạm vi | Việc ghi quan trọng được bảo vệ bằng ví MetaMask và vai trò trong contract |

---

## 13. Việc bạn cần chuẩn bị

- Cài tiện ích MetaMask trên trình duyệt, tạo một ví **mới chỉ để thử nghiệm**.
- Đăng ký một tài khoản RPC miễn phí (Alchemy hoặc Infura) để kết nối Sepolia. Chỉ cần ở Giai đoạn 6.
- Xin ETH thử nghiệm Sepolia từ faucet. Chỉ cần ở Giai đoạn 6.
- Bật container `mosquitto` khi chạy thử.
- Hỏi giảng viên môn Blockchain về việc kế thừa đồ án IoT.

---

## 14. Cần bạn trả lời để duyệt

1. Đồng ý các đề xuất D1–D7 ở mục 3 không? Đặc biệt là **D6** (dùng MetaMask) và **D7** (bật chế độ thủ công).
2. ~~Tên thư mục và vị trí~~ Đã chốt ở D2.
3. Môn Blockchain có hạn nộp khi nào? Nếu gấp, mình sẽ đề xuất dừng ở giai đoạn nào.
