# Barcode Scanner + Stok Takip

Bu proje Next.js (App Router) + Supabase ile çalışır.

## Özellikler

- Email/şifre ile giriş
- Başarılı login sonrası `/home` yönlendirmesi
- Supabase `stok` tablosunu listeleme
- Mobil uyumlu kamera ile barkod okuma
- `Stok Giriş` ve `Stok Çıkış` işlemleri

## Lokal Çalıştırma

1. Paketleri kur:

```bash
npm install
```

2. Ortam değişkenlerini ayarla:

```bash
copy .env.example .env.local
```

`.env.local` içine gerçek değerleri gir:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

3. Uygulamayı çalıştır:

```bash
npm run dev
```

## Vercel Deploy

1. Projeyi GitHub'a push et.
2. Vercel'de **New Project** ile repo'yu import et.
3. Framework otomatik olarak **Next.js** seçilir.
4. Vercel Project Settings > **Environment Variables** bölümüne şu değerleri ekle:
	- `NEXT_PUBLIC_SUPABASE_URL`
	- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy et.

## Önemli Notlar

- Kamera erişimi için HTTPS gerekir. Vercel prod ortamında bu otomatik sağlanır.
- `.env.local` dosyasını repoya commit etme.
- Build doğrulaması için:

```bash
npm run build
```
