# 🌊 Signal From The Deep Ocean — Form Evaluator

> **TRAINEE PROGRAM 2026** — Hệ thống hỗ trợ Ban Giám Khảo đánh giá, chấm điểm và phân loại hồ sơ ứng tuyển trực quan, kết nối Google Sheets API hai chiều và đồng bộ thời gian thực qua WebSocket.

---

## 📌 Giới thiệu dự án

**Signal From The Deep Ocean - Form Evaluator** là ứng dụng web nội bộ được thiết kế nhằm tối ưu hóa quy trình chấm đơn ứng tuyển trong chiến dịch tuyển quân **Trainee Program 2026**. 

Hệ thống kết nối trực tiếp với **Google Sheet**:
👉 **[Google Sheet form-review](https://docs.google.com/spreadsheets/d/1EkPPK0w5yLrSAGAxsbb3Td8lYZcpuYda4XxFONUyS0E/edit?gid=0#gid=0)**

Mọi thao tác đánh giá, chấm điểm số (1 - 5) và nhận xét của ban giám khảo đều được tự động lưu trực tiếp vào Google Sheet với đầy đủ màu sắc, đồng thời đồng bộ ngay lập tức tới các giám khảo khác đang mở web bằng công nghệ **WebSocket Real-time**.

---

## ✨ Tính năng nổi bật

### 1. 🌐 Liên kết Google Sheets API hai chiều (Google Sheets API Integration)
- **Kết nối chính thức**: Kết nối bảo mật thông qua Google Cloud Service Account tới bảng tính [form-review](https://docs.google.com/spreadsheets/d/1EkPPK0w5yLrSAGAxsbb3Td8lYZcpuYda4XxFONUyS0E/edit?gid=0#gid=0).
- **Tự động lưu và cập nhật**: Mọi đánh giá nhận xét và thang điểm màu sắc đều được lưu tự động lên sheet `ĐÁNH GIÁ` trên Google Sheets theo thời gian thực.
- **Dự phòng file Excel nội bộ**: Đồng thời lưu bản sao dự phòng vào file `.xlsx` nội bộ.

### 2. 🎯 Hệ thống điểm số 1 đến 5 & Cột điểm tổng hợp riêng cho từng giám khảo
- **Quy đổi điểm số tự động từ màu đánh giá**:
  - 🟢 **Cực tốt** (`#00C853`) ➔ **5 điểm**
  - 🔵 **Tốt** (`#2196F3`) ➔ **4 điểm**
  - 🟡 **Tạm** (`#FFD600`) ➔ **3 điểm**
  - 🟠 **OK** (`#FF9100`) ➔ **2 điểm**
  - 🔴 **Tệ** (`#FF1744`) ➔ **1 điểm**
- **Cột điểm riêng biệt trong Google Sheet**: Với mỗi giám khảo, ngoài cột nhận xét còn có một **cột điểm mới** (`Điểm - <Tên Giám Khảo>`) ghi rõ số điểm 1 - 5 của riêng giám khảo đó cho từng form, được căn giữa và tô màu nền khớp chuẩn với màu đánh giá.
- **Hỗ trợ phím tắt số**: Nhấn trực tiếp các phím <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>, <kbd>4</kbd>, <kbd>5</kbd> trên bàn phím để chọn điểm số nhanh.

### 3. ⚡ Đồng bộ phần "Đánh giá từ người khác" Real-time qua WebSocket
- **Live Sync tức thì**: Khi giám khảo A lưu nhận xét hoặc điểm số của một ứng viên, màn hình của giám khảo B (nếu đang xem cùng ứng viên đó) sẽ ngay lập tức cập nhật nhận xét và badge điểm số của giám khảo A cùng hiệu ứng highlight phát sáng.
- **Thanh trạng thái kết nối**: Header hiển thị trạng thái `🟢 GG Sheet: Đồng bộ` và nút `🔄 Đồng bộ` giúp tải lại dữ liệu từ Google Sheet bất cứ lúc nào.

### 4. 🎨 Giao diện Deep Ocean Theme & Split Layout hiện đại
- **Phong cách thiết kế**: Chủ đề đại dương sâu thẳm với hiệu ứng kính mờ (Glassmorphism), bong bóng nước và sóng biển chuyển động mượt mà.
- **Cột trái (Nội dung bài làm)**:
  - Hiển thị đầy đủ thông tin ứng viên: Họ tên, MSSV, Lớp sinh hoạt, Email.
  - Hiển thị các câu hỏi & câu trả lời tương ứng.
  - Tự động nhận diện đường link (Drive, GitHub, Behance, Figma, Portfolio,...) và chuyển đổi thành liên kết có thể nhấp mở ngay ở tab mới.
- **Cột phải (Bảng chấm điểm & Đánh giá)**:
  - Cố định khi cuộn trang, giúp giám khảo dễ dàng đối chiếu và nhập nhận xét.
  - 5 nút xếp loại màu sắc và điểm số trực quan kèm badge điểm (5đ, 4đ, 3đ, 2đ, 1đ).
  - Ô nhận xét đa dòng (`textarea`) có hỗ trợ tự động lưu.
  - Phím thao tác: **Lưu đánh giá** hoặc **Lưu & Tiếp theo →** để tự động chuyển sang ứng viên kế tiếp.

### 5. 🏢 Lọc và phân loại theo Ban chuyên môn
- Hỗ trợ 2 ban tuyển dụng chính:
  - ⚙️ **Ban Hệ thống**
  - 📢 **Ban Truyền thông - Sự kiện (TT-SK)**
- Giao diện tự động lọc danh sách thí sinh đăng ký theo từng ban và chỉ hiển thị đúng các trường câu hỏi chuyên môn liên quan.

### 6. 👥 Quản lý người chấm (Reviewers) & Đánh giá chéo
- **Thêm người chấm mới**: Tự động tạo thêm cột nhận xét và cột điểm số tương ứng trên Google Sheet.
- **Quản lý & Xóa người chấm**: Giao diện quản trị viên cho phép xem danh sách người chấm, số lượng form đã hoàn thành và xóa tài khoản thừa.

### 7. ⚡ Phím tắt tiện lợi (Fast Keyboard Navigation)
Tối ưu tốc độ chấm bài bằng bàn phím mà không cần rê chuột liên tục:
| Phím tắt | Chức năng |
| :--- | :--- |
| <kbd>1</kbd> .. <kbd>5</kbd> | Chọn nhanh mức điểm từ 1 đến 5 (Tệ ➔ Cực tốt) |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> hoặc <kbd>Cmd</kbd> + <kbd>S</kbd> | Lưu đánh giá form hiện tại lên Google Sheet |
| <kbd>A</kbd> hoặc <kbd>◀</kbd> (Mũi tên trái) | Chuyển về form ứng viên trước |
| <kbd>D</kbd> hoặc <kbd>▶</kbd> (Mũi tên phải) | Chuyển sang form ứng viên kế tiếp |

### 8. 📊 Xuất báo cáo kết quả linh hoạt
- **Xuất Excel có cột điểm (`Danh_gia_<Tên>_kem_diem.xlsx`)**:
  - **Sheet 1 (`Cot_Copy_Vao_File_Tong`)**: Chứa cột Nhận xét và cột Điểm số (1-5) với màu nền đầy đủ, giữ **chính xác 100% số thứ tự dòng** tương ứng với form ứng viên.
  - **Sheet 2 (`Doi_Chieu_Chi_Tiet`)**: Bảng tổng hợp đầy đủ số dòng, ID, Ban, Họ tên, MSSV, nhận xét, điểm số và xếp loại để dễ dàng rà soát, đối chiếu.
- **Tải file TXT (`.txt`)**: Xuất toàn bộ đánh giá ra định dạng text gọn nhẹ, tiện lợi cho việc lưu trữ offline hoặc gửi báo cáo nhanh qua tin nhắn.

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ / Thư viện | Mục đích |
| :--- | :--- | :--- |
| **Backend** | [Node.js](https://nodejs.org/) & [Express 5](https://expressjs.com/) | Xây dựng RESTful API phục vụ đọc/ghi dữ liệu và xuất báo cáo |
| **Excel Engine** | [ExcelJS](https://github.com/exceljs/exceljs) | Xử lý đọc và ghi file Excel (`.xlsx`), định dạng style, màu sắc fill cell |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+) | Giao diện Single Page Application nhẹ, mượt mà, không phụ thuộc framework nặng |
| **Design System** | Glassmorphism, CSS Custom Properties, Animations | Thiết kế hiện đại, responsive, thẩm mỹ cao |
| **Font** | Google Fonts ([Inter](https://fonts.google.com/specimen/Inter)) | Typography hiện đại, rõ ràng |

---

## 📁 Cấu trúc thư mục

```plaintext
danh-gia-form/
├── [TRAINEE PROGRAM 2026] ... .xlsx   # File dữ liệu Excel nguồn (gồm sheet RESPONSES & ĐÁNH GIÁ)
├── server.js                         # Backend Express xử lý đọc/ghi Excel và API endpoints
├── package.json                      # Thông tin gói phần mềm & dependencies
├── package-lock.json                 # Khóa phiên bản dependencies
├── public/                           # Thư mục giao diện tĩnh (Frontend)
│   ├── index.html                    # Giao diện chính, modal hướng dẫn, modal quản lý
│   ├── style.css                     # Hệ thống stylesheet, Deep Ocean theme, animations
│   └── app.js                        # Logic xử lý giao diện, phím tắt, gọi API
└── README.md                         # Tài liệu hướng dẫn sử dụng dự án
```

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### 1. Yêu cầu hệ thống
- Đã cài đặt **Node.js** (khuyến nghị phiên bản `18.x` hoặc `20.x` LTS trở lên).
- Trình duyệt web hiện đại (Google Chrome, Microsoft Edge, Safari, Brave,...).

### 2. Cài đặt các gói phụ thuộc
Mở terminal tại thư mục dự án và chạy:
```bash
npm install
```

### 3. Chuẩn bị file dữ liệu Excel
- Đảm bảo trong thư mục gốc của dự án có sẵn **1 file Excel `.xlsx`** chứa dữ liệu tuyển quân.
- File Excel cần có cấu trúc gồm ít nhất 2 sheet:
  - `RESPONSES`: Chứa câu trả lời nguyên bản của ứng viên từ Google Form.
  - `ĐÁNH GIÁ`: Chứa bảng tổng hợp kết quả đánh giá (Dòng 2 là danh sách tên người chấm, từ dòng 3 trở đi là ID và điểm/nhận xét).

### 4. Khởi chạy Server
Chạy lệnh sau để bật server:
```bash
npm start
```
*Hoặc:*
```bash
npm run dev
```

Terminal sẽ hiển thị thông báo:
```plaintext
🌊 Form Evaluation Server running at http://localhost:3000
```

### 5. Truy cập ứng dụng
Mở trình duyệt và truy cập:
👉 [http://localhost:3000](http://localhost:3000)

---

## 📖 Hướng dẫn sử dụng cho Giám khảo

1. **Chọn người chấm**:
   - Chọn tên của bạn trong menu thả xuống **Người chấm**.
   - Nếu chưa có tên, nhập vào ô **Nhập tên người chấm mới...** và nhấn **+ Thêm**.
2. **Chọn Ban cần chấm**:
   - Nhấp chọn **⚙️ Hệ thống** hoặc **📢 Truyền thông - Sự kiện**.
3. **Bắt đầu chấm**:
   - Nhấn **🚀 Bắt đầu chấm**.
   - Đọc nội dung hồ sơ của ứng viên ở cột trái (có thể click vào các liên kết bài tập / drive của ứng viên để xem sản phẩm).
   - Chọn màu xếp loại tương ứng và điền nhận xét tại cột phải.
   - Nhấn **Lưu & Tiếp theo →** hoặc dùng phím tắt `Ctrl + S` rồi `D` để sang ứng viên tiếp theo.
4. **Theo dõi tiến độ**:
   - Nhấp vào biểu tượng 📋 ở góc dưới bên phải để mở danh sách toàn bộ thí sinh, xem tiến độ những bài đã chấm (có chấm màu) và bài chưa chấm.
5. **Xuất kết quả bàn giao**:
   - Sau khi chấm xong, nhấn nút **📊 Xuất Excel (1 cột)** trên thanh tiêu đề để tải về file Excel đã khớp sẵn từng dòng với file tổng của BTC.
   - Mở file vừa tải về, copy toàn bộ cột đánh giá và dán vào cột tương ứng của bạn trên file tổng.

---

## ⚠️ Lưu ý quan trọng
- **Đóng file Excel khi đang chạy web**: Nếu bạn mở file `.xlsx` bằng Microsoft Excel hoặc WPS trên máy tính, hệ điều hành có thể khóa file (file lock). Vui lòng đóng file Excel trước khi thực hiện thao tác lưu đánh giá hoặc thêm/xóa người chấm trên web để tránh lỗi xung đột ghi file.
- **Sao lưu định kỳ**: Nên tạo một bản sao lưu (backup) của file Excel chính trước các đợt chấm lớn để đảm bảo an toàn dữ liệu.

---

## 🐬 Bản quyền & Chương trình
- **Dự án**: Trainee Program 2026 — *Signal From The Deep Ocean*
- Phát triển phục vụ công tác tuyển sinh và đánh giá nội bộ.
