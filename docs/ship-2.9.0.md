# چک‌لیستِ انتشارِ ۲.۹.۰ — آماده، فقط منتظرِ توکن

| مرحله | وضعیت | جزئیات |
|---|---|---|
| ادغامِ کدِ ۲.۹.۰ با منابعِ منتشرشدهٔ ۲.۸.۱۵ | ✅ | `engine.js` + `planner.js` + `ai/*` بدونِ افتِ قابلیتِ ۲.۸.۱۴/۱۵ |
| `npm test` (۱۴ سوئیت) | ✅ | exit 0 · ۵۲ ثانیه · `v290-engine` ۵۲ ✅ |
| `npm run test:ui` (۴ سوئیت Electron) | ✅ | ۵۷ · ۱۱ · ۱۵ · ۵۳ ✅ (xvfb + electron 31.7.7) |
| هستهٔ مدلِ محتوا داخلِ بستهٔ نهایی | ✅ | `chapter-size.js` · `learning-model.js` · `model/*.json` در `app.asar` |
| نسخه‌ها | ✅ | `package.json` · `changelog.js` · `engine.js` · `exam-frequency.js` = ۲.۹.۰ |
| نصب‌کننده | ✅ | `dist/Reval-Setup-2.9.0.exe` — ۸۰٬۱۹۴٬۴۶۷ بایت |
| وصلهٔ کد | ✅ | `dist/reval-code-2.9.0.zip` — ۶۴۱٬۷۸۲ بایت · ۳۹ فایل |
| README | ✅ | نشانِ ۲.۹.۰ · جدولِ دانلود · SHA-256 · بخشِ نسخه + لینکِ یادداشت |
| یادداشتِ انتشار | ✅ | `docs/release-notes-2.9.0.md` |
| push + tag + Release + آپلودِ asset | ⏳ | **نیازمندِ یک PAT تازه** |

## SHA-256

```
30917bb9cc1feb2d13ccd3ce407720aa55923ff5b050355154f8b39a6d3a8340  Reval-Setup-2.9.0.exe
2cccb9b855455e1279215ddb3b4af2ecb486f5303c31994302457d9ad8f34600  reval-code-2.9.0.zip
```

## دستورهای انتشار (بعد از گرفتنِ توکن)

```bash
git clone https://<TOKEN>@github.com/rezaa2544/k3-reval.git /home/user/push
tar -C /home/user/k3-reval --exclude=node_modules --exclude=release --exclude=.git \
    --exclude=dist --exclude=artifacts -cf - . | tar -C /home/user/push -xf -
cd /home/user/push && git add -A && git commit -m "v2.9.0: موتورِ هوشِ فوق‌العاده — زمانِ هر فصل از دلِ محتوا"
git push origin main && git tag v2.9.0 && git push origin v2.9.0
# POST /releases (tag_name=v2.9.0) → آپلودِ exe + zip → بازبینی → rm -rf /home/user/push
```
