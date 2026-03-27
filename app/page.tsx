"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setMessage(error.message);
    else {
      setMessage("Giriş başarılı. Yönlendiriliyorsun...");
      router.push("/home");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Giriş Yap
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Supabase email/şifre ile giriş
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="ornek@mail.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              Şifre
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 py-2.5 font-medium disabled:opacity-60"
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
        )}
      </div>
    </div>
  );
}