# Public Demo — Runbook

`demo.launchtic.com` là sandbox dùng chung: khách tự đăng nhập 1 tài khoản demo, action nguy hiểm bị chặn, box tự reset về baseline 1 lần/ngày.

## DEMO_MODE làm gì
Bật `DEMO_MODE=true` trong `.env` → app:
- **Auto-login** bằng `DEMO_EMAIL`/`DEMO_PASSWORD` (bỏ qua form login).
- **Chặn outbound email** — `sendEmail()` thành no-op.
- **Chặn action rủi ro** (403 "disabled in the live demo"): đổi password, đổi license, payment, storage/S3, AI key, custom domain, team, xoá/clone workspace. Còn lại (funnel, page, contacts, draft email) vẫn chạy.

## Cài đặt lần đầu
1. **Comp license AGENCY** không hết hạn trên launchtic.com, lấy `key`.
2. **Install** trên VPS demo: `curl -fsSL https://launchtic.com/install | bash -s -- --license <DEMO_KEY>`
3. **Bật demo mode** — thêm vào `.env` rồi recreate:
   ```
   DEMO_MODE=true
   DEMO_EMAIL=demo@launchtic.com
   DEMO_PASSWORD=launchtic-demo
   ```
   `cd launchtic && docker compose up -d --force-recreate`
4. **Chạy wizard** tại `https://demo.launchtic.com`: tạo admin bằng **đúng** `DEMO_EMAIL`+`DEMO_PASSWORD` (đây là account auto-login), set domain `demo.launchtic.com`.
5. **Dựng content demo** (funnel/contacts/email mẫu) — tài khoản marketing khách thấy.
6. **Chụp baseline:**
   ```bash
   cp /path/to/demo/demo-reset.sh ~/launchtic/ && chmod +x ~/launchtic/demo-reset.sh
   cd ~/launchtic && ./demo-reset.sh snapshot
   ```

## Cơ chế reset
`demo-reset.sh` chỉ quản **DB (Postgres) + thư mục `uploads`**.
- `snapshot` (tay, 1 lần): `pg_dump` + nén `uploads` → `demo-baseline/`. Đây là bản gốc sạch.
- `restore` (cron): dừng web/worker/renderer → `pg_restore --clean` → giải nén lại uploads → restart caddy (re-resolve bind mount uploads) → khởi động lại app. Rác khách biến mất. `.env`/cert/volume khác không đụng.

Đổi content mẫu → dựng lại rồi `./demo-reset.sh snapshot`.

## Cron auto-reset

**Chọn giờ theo ưu tiên US > EU > Á/Úc → 10:00 UTC, 1 lần/ngày.** Lúc đó US ngủ sâu (West ~02h, East ~05h) nên không cắt ngang ai, và demo tươi đúng đầu ngày làm việc US; đổi lại EU bị gián đoạn ~30s lúc trưa (chấp nhận, vì #2).

**Cron chạy theo timezone server**, không phải UTC mặc nhiên. Kiểm tra và (nếu cần) ép về UTC:
```bash
timedatectl                          # xem dòng "Time zone:"
timedatectl set-timezone UTC         # nếu chưa phải UTC
```

Thêm dòng cron (mở editor crontab của root):
```bash
crontab -e
```
Dán dòng này vào, lưu lại:
```cron
0 10 * * * cd /root/launchtic && ./demo-reset.sh restore >> /var/log/demo-reset.log 2>&1
```

Kiểm tra + theo dõi:
```bash
crontab -l                           # xác nhận dòng cron đã có
tail -f /var/log/demo-reset.log      # xem log mỗi lần chạy
./demo-reset.sh restore              # chạy tay 1 lần để test ngay, không đợi 10:00 UTC
```
Gỡ cron khi cần (vd trước khi update có migration): `crontab -l | grep -v demo-reset | crontab -`

## Update app
Update chỉ pull image mới + refresh compose/Caddyfile; `.env` + volume giữ nguyên. Migration chạy khi `web` khởi động.

**Không migration** — 1 lệnh: `cd ~/launchtic && curl -fsSL https://launchtic.com/update | bash`

**Có migration** (hoặc không chắc → cứ làm cách này): baseline cũ mang schema cũ, cron `restore` sau update sẽ đắp schema cũ lên app mới → vỡ. Phải chụp lại baseline:
```bash
cd ~/launchtic
crontab -l | grep -v demo-reset | crontab -      # tạm gỡ cron
./demo-reset.sh restore                           # 1. content sạch (schema cũ)
curl -fsSL https://launchtic.com/update | bash    # 2. app mới migrate data sạch
#                                                    3. verify demo chạy OK
./demo-reset.sh snapshot                           # 4. baseline mới = sạch + schema mới
#                                                    5. gắn lại dòng cron
```

## App design (VPS riêng)
Demo bị wipe mỗi 2h → không phải chỗ designer dựng content. Chạy **instance riêng trên VPS riêng** (cô lập hoàn toàn, reset demo không đụng tới):
1. Trỏ DNS `app.launchtic.com` → VPS mới.
2. Install chuẩn, `DEMO_MODE` để **false** (login/settings/email thật): `curl -fsSL https://launchtic.com/install | bash -s -- --license <DESIGN_KEY>` (cần instance/license riêng).
3. **Không** `demo-reset.sh`, **không** cron trên box này.

Promote content design → demo (design = nguồn gốc, demo = bản clone):
```bash
# trên VPS design: xuất
docker compose exec -T postgres pg_dump -U postgres -Fc launchtic > content.dump
tar -czf content-uploads.tar.gz uploads
# scp 2 file sang VPS demo → demo-baseline/db.dump + giải nén uploads, rồi:
cd ~/launchtic && ./demo-reset.sh restore   # demo hiện content designer
#                 ./demo-reset.sh snapshot  # đóng băng làm baseline mới
```

## Lưu ý
- Renderer checkout không chặn riêng nhưng an toàn: payment bị chặn, không seed → funnel demo không có provider thật để charge.
- Sandbox dùng chung: khách thấy edit của nhau giữa 2 lần reset.
- Tắt demo: bỏ `DEMO_MODE` (hoặc stop stack) → về install thường.
