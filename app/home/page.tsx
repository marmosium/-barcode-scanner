"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { getSupabaseClient } from "@/lib/supabase/client";

type StockRow = {
  id: number;
  barcode: string;
  urun_adi: string;
  miktar: number;
  created_at: string | null;
  updated_at: string | null;
};

type StockActionType = "giris" | "cikis";

const supportedFormats = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
];

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, supportedFormats);

const barcodeReader = new BrowserMultiFormatReader(hints);

export default function HomePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scannedLockRef = useRef(false);

  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isImageScanning, setIsImageScanning] = useState(false);
  const [activeAction, setActiveAction] = useState<StockActionType | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "ready" | "scanning" | "detected">("idle");
  const [lastDetectedCode, setLastDetectedCode] = useState<string | null>(null);
  const [lastDetectedFormat, setLastDetectedFormat] = useState<string | null>(null);

  const getClientOrNotify = useCallback(() => {
    try {
      return getSupabaseClient();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase bağlantı hatası.";
      setActionMessage(message);
      return null;
    }
  }, []);

  const stopScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    scannedLockRef.current = false;
    setIsScanning(false);
    setScanStatus("idle");
  }, []);

  const loadStocks = useCallback(async () => {
    const supabase = getClientOrNotify();
    if (!supabase) {
      setLoadingRows(false);
      return;
    }

    setLoadingRows(true);

    const { data, error } = await supabase
      .from("stok")
      .select("id, barcode, urun_adi, miktar, created_at, updated_at")
      .order("id", { ascending: false });

    if (error) {
      setActionMessage(`Stok listesi alınamadı: ${error.message}`);
      setStockRows([]);
    } else {
      setStockRows((data ?? []) as StockRow[]);
    }

    setLoadingRows(false);
  }, [getClientOrNotify]);

  const applyStockAction = useCallback(
    async (barcode: string, action: StockActionType) => {
      const supabase = getClientOrNotify();
      if (!supabase) {
        return;
      }

      const cleanedBarcode = barcode.trim();

      if (!cleanedBarcode) {
        setActionMessage("Okunan barkod geçersiz.");
        return;
      }

      const { data: existingRow, error: readError } = await supabase
        .from("stok")
        .select("id, barcode, urun_adi, miktar")
        .eq("barcode", cleanedBarcode)
        .maybeSingle();

      if (readError) {
        setActionMessage(`Barkod kontrolü başarısız: ${readError.message}`);
        return;
      }

      if (action === "giris") {
        if (existingRow) {
          const { error: updateError } = await supabase
            .from("stok")
            .update({
              miktar: existingRow.miktar + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingRow.id);

          if (updateError) {
            setActionMessage(`Stok giriş güncellemesi başarısız: ${updateError.message}`);
            return;
          }
        } else {
          const { error: insertError } = await supabase.from("stok").insert({
            barcode: cleanedBarcode,
            urun_adi: `Ürün ${cleanedBarcode}`,
            miktar: 1,
          });

          if (insertError) {
            setActionMessage(`Yeni stok ekleme başarısız: ${insertError.message}`);
            return;
          }
        }

        setActionMessage(`Stok giriş başarılı: ${cleanedBarcode}`);
      } else {
        if (!existingRow) {
          setActionMessage(`Bu barkod stokta bulunamadı: ${cleanedBarcode}`);
          return;
        }

        if (existingRow.miktar <= 0) {
          setActionMessage(`Bu ürünün stoğu zaten 0: ${cleanedBarcode}`);
          return;
        }

        const { error: updateError } = await supabase
          .from("stok")
          .update({
            miktar: existingRow.miktar - 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingRow.id);

        if (updateError) {
          setActionMessage(`Stok çıkış güncellemesi başarısız: ${updateError.message}`);
          return;
        }

        setActionMessage(`Stok çıkış başarılı: ${cleanedBarcode}`);
      }

      await loadStocks();
    },
    [getClientOrNotify, loadStocks]
  );

  const startScanner = useCallback(
    async (action: StockActionType) => {
      if (isScanning) {
        return;
      }

      setActionMessage(null);
      setActiveAction(action);
      setLastDetectedCode(null);
      setLastDetectedFormat(null);
      setScanStatus("ready");

      if (!navigator.mediaDevices?.getUserMedia) {
        setActionMessage("Bu cihazda kamera erişimi desteklenmiyor.");
        return;
      }

      const videoElement = videoRef.current;
      if (!videoElement) {
        setActionMessage("Kamera görüntüsü başlatılamadı.");
        setScanStatus("idle");
        return;
      }

      setIsScanning(true);
      setScanStatus("scanning");

      try {
        const controls = await barcodeReader.decodeFromVideoDevice(
          undefined,
          videoElement,
          async (result) => {
            if (!result || scannedLockRef.current) {
              return;
            }

            scannedLockRef.current = true;
            setLastDetectedCode(result.getText());
            setLastDetectedFormat(result.getBarcodeFormat().toString());
            setScanStatus("detected");

            if (navigator.vibrate) {
              navigator.vibrate(120);
            }

            controls.stop();
            scannerControlsRef.current = null;
            setIsScanning(false);

            await applyStockAction(result.getText(), action);
          }
        );

        scannerControlsRef.current = controls;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Bilinmeyen kamera hatası";
        setActionMessage(`Kamera başlatılamadı: ${message}`);
        stopScanner();
      }
    },
    [applyStockAction, isScanning, stopScanner]
  );

  const openImagePicker = useCallback((action: StockActionType) => {
    setActiveAction(action);
    setActionMessage(null);
    setLastDetectedCode(null);
    setLastDetectedFormat(null);
    imageInputRef.current?.click();
  }, []);

  const handleImageUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      if (!activeAction) {
        setActionMessage("Önce stok giriş veya çıkış işlemini seç.");
        event.target.value = "";
        return;
      }

      setIsImageScanning(true);
      setScanStatus("scanning");
      setActionMessage("Fotoğraf analiz ediliyor...");

      try {
        const imageUrl = URL.createObjectURL(file);

        try {
          const result = await barcodeReader.decodeFromImageUrl(imageUrl);
          const detectedText = result.getText();
          const detectedFormat = result.getBarcodeFormat().toString();

          setLastDetectedCode(detectedText);
          setLastDetectedFormat(detectedFormat);
          setScanStatus("detected");

          await applyStockAction(detectedText, activeAction);
        } finally {
          URL.revokeObjectURL(imageUrl);
        }
      } catch {
        setActionMessage("Fotoğrafta okunabilir QR/barkod bulunamadı.");
        setScanStatus("idle");
      } finally {
        setIsImageScanning(false);
        event.target.value = "";
      }
    },
    [activeAction, applyStockAction]
  );

  useEffect(() => {
    const checkSessionAndLoad = async () => {
      const supabase = getClientOrNotify();
      if (!supabase) {
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        router.replace("/");
        return;
      }

      await loadStocks();
    };

    checkSessionAndLoad();

    return () => {
      stopScanner();
    };
  }, [getClientOrNotify, loadStocks, router, stopScanner]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4 sm:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 sm:p-6 shadow-sm">
          <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
            Home
          </h1>
          <p className="mt-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
            Barkod okutarak stok giriş/çıkış işlemi yapabilir ve mevcut stok tablosunu görebilirsin.
          </p>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Desteklenen okuma: QR + Barkod (Code128, EAN-13, EAN-8, UPC, ITF, Codabar)
          </p>

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => startScanner("giris")}
              disabled={isScanning || isImageScanning}
              className="w-full sm:w-auto rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2.5 font-medium disabled:opacity-60"
            >
              Stok Giriş
            </button>
            <button
              type="button"
              onClick={() => startScanner("cikis")}
              disabled={isScanning || isImageScanning}
              className="w-full sm:w-auto rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 font-medium disabled:opacity-60"
            >
              Stok Çıkış
            </button>
            <button
              type="button"
              onClick={() => openImagePicker("giris")}
              disabled={isScanning || isImageScanning}
              className="w-full sm:w-auto rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 font-medium disabled:opacity-60"
            >
              Fotoğraf Yükle (Giriş)
            </button>
            <button
              type="button"
              onClick={() => openImagePicker("cikis")}
              disabled={isScanning || isImageScanning}
              className="w-full sm:w-auto rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 font-medium disabled:opacity-60"
            >
              Fotoğraf Yükle (Çıkış)
            </button>
            {isScanning && (
              <button
                type="button"
                onClick={stopScanner}
                className="w-full sm:w-auto rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 font-medium"
              >
                Taramayı Durdur
              </button>
            )}
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageUpload}
            className="hidden"
          />

          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
            <video
              ref={videoRef}
              className={`w-full aspect-video object-cover ${isScanning ? "block" : "hidden"}`}
              muted
              autoPlay
              playsInline
            />
            {!isScanning && (
              <div className="p-4 text-sm text-zinc-600 dark:text-zinc-400">
                Kamera açmak için "Stok Giriş" veya "Stok Çıkış" butonuna bas.
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300">
            {scanStatus === "idle" && "Tarayıcı kapalı."}
            {scanStatus === "ready" && "Kamera hazırlanıyor..."}
            {scanStatus === "scanning" &&
              (isImageScanning
                ? "Fotoğraf analizi aktif: QR veya barkod aranıyor."
                : "Tarama aktif: QR veya barkodu kameraya göster.")}
            {scanStatus === "detected" && "Kod algılandı ve işleniyor..."}
          </div>

          {lastDetectedCode && (
            <div className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300">
              <p>
                Son okunan: <span className="font-medium">{lastDetectedCode}</span>
              </p>
              {lastDetectedFormat && <p className="text-xs mt-1">Format: {lastDetectedFormat}</p>}
            </div>
          )}

          {activeAction && isScanning && (
            <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
              {activeAction === "giris"
                ? "Stok giriş modu aktif. Barkodu kameraya okut."
                : "Stok çıkış modu aktif. Barkodu kameraya okut."}
            </p>
          )}

          {actionMessage && (
            <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{actionMessage}</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Stok Tablosu
            </h2>
            <button
              type="button"
              onClick={loadStocks}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm text-zinc-800 dark:text-zinc-100"
            >
              Yenile
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Barkod</th>
                  <th className="px-3 py-2 font-medium">Ürün Adı</th>
                  <th className="px-3 py-2 font-medium">Miktar</th>
                </tr>
              </thead>
              <tbody>
                {loadingRows ? (
                  <tr>
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400" colSpan={4}>
                      Yükleniyor...
                    </td>
                  </tr>
                ) : stockRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400" colSpan={4}>
                      Kayıt bulunamadı.
                    </td>
                  </tr>
                ) : (
                  stockRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-zinc-100 dark:border-zinc-900 text-zinc-800 dark:text-zinc-200"
                    >
                      <td className="px-3 py-2">{row.id}</td>
                      <td className="px-3 py-2">{row.barcode}</td>
                      <td className="px-3 py-2">{row.urun_adi}</td>
                      <td className="px-3 py-2">{row.miktar}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
