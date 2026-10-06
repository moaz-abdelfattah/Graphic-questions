# مِسطرة — نسخة Vercel مؤقتة

دي نسخة منفصلة مهيّأة للرفع على Vercel كـ Next.js app.

## تشغيل محليًا

```bash
pnpm install
pnpm dev
```

## رفع على Vercel

1. ارفع الفولدر ده على GitHub أو اسحبه مباشرة داخل Vercel.
2. Vercel هيقرأ `vercel.json` ويشغّل:
   - Install: `pnpm install`
   - Build: `pnpm build`
3. لو حبيت تغيّر رابط الموقع في بيانات المشاركة، ضيف Environment Variable:

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.vercel.app
```

النسخة دي مؤقتة للعرض على التيم، ومفصولة عن نسخة التطوير الأساسية.
