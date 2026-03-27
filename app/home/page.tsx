"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { supabase } from "@/lib/supabase/client";

type StockRow = {
  id: number;
  barcode: string;
  urun_adi: string;
  miktar: number;
  created_at: string | null;
  updated_at: string | null;
};

type StockActionType = "giris" | "cikis";

const barcodeReader = new BrowserMultiFormatReader();

export default function HomePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scannedLockRef = useRef(false);

  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [activeAction, setActiveAction] = useState<StockActionType | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const stopScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    scannedLockRef.current = false;
    setIsScanning(false);
  }, []);

  const loadStocks = useCallback(async () => {
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
  }, []);

  const applyStockAction = useCallback(
    async (barcode: string, action: StockActionType) => {
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
    [loadStocks]
  );

  const startScanner = useCallback(
    async (action: StockActionType) => {
      if (isScanning) {
        return;
      }

      setActionMessage(null);
      setActiveAction(action);

      if (!navigator.mediaDevices?.getUserMedia) {
        setActionMessage("Bu cihazda kamera erişimi desteklenmiyor.");
        return;
      }

      const videoElement = videoRef.current;
      if (!videoElement) {
        setActionMessage("Kamera görüntüsü başlatılamadı.");
        return;
      }

      setIsScanning(true);

      try {
        const controls = await barcodeReader.decodeFromVideoDevice(
          undefined,
          videoElement,
          async (result) => {
            if (!result || scannedLockRef.current) {
              return;
            }

            scannedLockRef.current = true;
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

  useEffect(() => {
    const checkSessionAndLoad = async () => {
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
  }, [loadStocks, router, stopScanner]);

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

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => startScanner("giris")}
              disabled={isScanning}
              className="w-full sm:w-auto rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2.5 font-medium disabled:opacity-60"
            >
              Stok Giriş
            </button>
            <button
              type="button"
              onClick={() => startScanner("cikis")}
              disabled={isScanning}
              className="w-full sm:w-auto rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 font-medium disabled:opacity-60"
            >
              Stok Çıkış
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
