# 🌊 Signal From The Deep Ocean — Form Evaluator

> **TRAINEE PROGRAM 2026** — Hệ thống hỗ trợ Ban Giám Khảo đánh giá, chấm điểm và phân loại hồ sơ ứng tuyển trực quan, đồng bộ trực tiếp hai chiều với file Excel.

---

## 📌 Giới thiệu dự án

**Signal From The Deep Ocean - Form Evaluator** là ứng dụng web nội bộ được thiết kế nhằm tối ưu hóa quy trình chấm đơn ứng tuyển trong chiến dịch tuyển quân **Trainee Program 2026**. 

Thay vì phải thao tác thủ công trên các bảng tính Excel cồng kềnh với hàng chục cột dữ liệu dài, ứng dụng cung cấp giao diện trực quan, chia đôi màn hình (Split Layout), tự động lọc câu hỏi theo từng ban chuyên môn và đồng bộ dữ liệu hai chiều trực tiếp với file Excel gốc.

---

## ✨ Tính năng nổi bật

### 1. 🔄 Đồng bộ 2 chiều với file Excel gốc (Realtime Excel Integration)
- **Đọc dữ liệu tự động**: Tự động nhận diện file `.xlsx` trong thư mục gốc, đọc danh sách câu trả lời từ sheet `RESPONSES` và thông tin đánh giá từ sheet `ĐÁNH GIÁ`.
- **Lưu trực tiếp vào Excel**: Mỗi khi giám khảo lưu nhận xét và mức xếp loại, hệ thống tự động ghi nội dung và tô màu ô tương ứng của giám khảo đó vào sheet `ĐÁNH GIÁ` bằng thư viện `ExcelJS`.

### 2. 🎨 Giao diện Deep Ocean Theme & Split Layout hiện đại
- **Phong cách thiết kế**: Chủ đề đại dương sâu thẳm với hiệu ứng kính mờ (Glassmorphism), bong bóng nước và sóng biển chuyển động mượt mà.
- **Cột trái (Nội dung bài làm)**:
  - Hiển thị đầy đủ thông tin ứng viên: Họ tên, MSSV, Lớp sinh hoạt, Email.
  - Hiển thị các câu hỏi & câu trả lời tương ứng.
  - Tự động nhận diện đường link (Drive, GitHub, Behance, Figma, Portfolio,...) và chuyển đổi thành liên kết có thể nhấp mở ngay ở tab mới.
- **Cột phải (Bảng chấm điểm & Đánh giá)**:
  - Cố định khi cuộn trang, giúp giám khảo dễ dàng đối chiếu và nhập nhận xét.
  - 5 nút xếp loại màu sắc trực quan:
    - 🟢 **Cực tốt** (`#00C853`)
    - 🔵 **Tốt** (`#2196F3`)
    - 🟡 **Tạm** (`#FFD600`)
    - 🟠 **OK / Ấy** (`#FF9100`)
    - 🔴 **Tệ** (`#FF1744`)
  - Ô nhận xét đa dòng (`textarea`) có hỗ trợ tự động lưu.
  - Phím thao tác: **Lưu đánh giá** hoặc **Lưu & Tiếp theo →** để tự động chuyển sang ứng viên kế tiếp.

### 3. 🏢 Lọc và phân loại theo Ban chuyên môn
- Hỗ trợ 2 ban tuyển dụng chính:
  - ⚙️ **Ban Hệ thống**
  - 📢 **Ban Truyền thông - Sự kiện (TT-SK)**
- Giao diện tự động lọc danh sách thí sinh đăng ký theo từng ban và chỉ hiển thị đúng các trường câu hỏi chuyên môn liên quan.

### 4. 👥 Quản lý người chấm (Reviewers) & Đánh giá chéo
- **Thêm người chấm mới**: Tự động cấp thêm cột mới trong sheet Excel.
- **Quản lý & Xóa người chấm**: Giao diện quản trị viên cho phép xem danh sách người chấm, số lượng form đã hoàn thành và hỗ trợ xóa tài khoản thừa (tự động dồn các cột còn lại sang trái trong Excel mà không làm hỏng cấu trúc file).
- **Xem chéo đánh giá**: Giám khảo có thể xem các đánh giá, mức phân loại màu và nhận xét của các giám khảo khác về cùng một ứng viên.

### 5. ⚡ Phím tắt tiện lợi (Fast Keyboard Navigation)
Tối ưu tốc độ chấm bài bằng bàn phím mà không cần rê chuột liên tục:
| Phím tắt | Chức năng |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> hoặc <kbd>Cmd</kbd> + <kbd>S</kbd> | Lưu đánh giá form hiện tại |
| <kbd>A</kbd> hoặc <kbd>◀</kbd> (Mũi tên trái) | Chuyển về form ứng viên trước |
| <kbd>D</kbd> hoặc <kbd>▶</kbd> (Mũi tên phải) | Chuyển sang form ứng viên kế tiếp |

### 6. 📊 Xuất báo cáo kết quả linh hoạt
- **Xuất Excel 1 cột chuẩn (`Danh_gia_<Tên>_1cot.xlsx`)**:
  - **Sheet 1 (`Cot_Copy_Vao_File_Tong`)**: Chứa 1 cột duy nhất bao gồm đánh giá của cả 2 ban (Hệ thống & TT-SK), giữ **chính xác 100% số thứ tự dòng** tương ứng với file tổng của BTC, giữ nguyên màu fill đánh giá. Giám khảo chỉ cần sao chép toàn bộ cột này và dán thẳng vào cột của mình trên file Google Sheets/Excel tổng.
  - **Sheet 2 (`Doi_Chieu_Chi_Tiet`)**: Bảng tổng hợp đầy đủ số dòng, ID, Ban, Họ tên, MSSV, nhận xét và xếp loại để dễ dàng rà soát, đối chiếu.
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
