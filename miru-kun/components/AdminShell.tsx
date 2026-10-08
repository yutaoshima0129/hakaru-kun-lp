"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminNav from "@/components/AdminNav";
import { getAdminBackend, getAuth, mode, type StoreRecord } from "@/lib/backend";

type StoreContextValue = {
  storeId: string;
  storeName: string;
  stores: StoreRecord[];
  selectStore: (id: string) => void;
  reloadStores: () => Promise<void>;
};

const StoreContext = createContext<StoreContextValue | null>(null);

/** 管理画面の各ページから、選択中の店舗を取得する（AdminShell の内側でのみ使える） */
export function useStore(): StoreContextValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useStore は AdminShell の内側で使ってください");
  return v;
}

const STORE_KEY = "miru-kun:store";

const readSavedStore = () => {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  // cloud: undefined=確認中 / null=未ログイン / string=ログイン中
  const [email, setEmail] = useState<string | null | undefined>(mode === "cloud" ? undefined : null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) return;
    auth.getUserEmail().then(setEmail, () => setEmail(null));
    return auth.onChange(setEmail);
  }, []);

  const needsLogin = mode === "cloud" && !email;

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/" className="font-black text-lg text-primary-dark">
            見る君 <span className="text-xs font-bold text-gray-400">管理画面</span>
          </Link>
          {!needsLogin && <AdminNav />}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {email && (
              <span className="flex items-center gap-2 text-xs text-gray-500">
                {email}
                <button onClick={() => getAuth()!.signOut()} className="font-bold underline">
                  ログアウト
                </button>
              </span>
            )}
            <a
              href="/player"
              target="_blank"
              className="text-sm font-bold text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90"
            >
              サイネージ画面を開く ↗
            </a>
          </div>
        </div>
      </header>
      {needsLogin ? (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
          {email === undefined ? <p className="text-sm text-gray-400">読み込み中…</p> : <LoginForm />}
        </main>
      ) : (
        <StoreGate>{children}</StoreGate>
      )}
    </div>
  );
}

function LoginForm() {
  const [signup, setSignup] = useState(false);
  const [em, setEm] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const auth = getAuth()!;
      if (signup) {
        const { needsConfirmation } = await auth.signUp(em, pw);
        if (needsConfirmation) setMsg("確認メールを送りました。メール内のリンクを開いてからログインしてください。");
      } else {
        await auth.signIn(em, pw);
      }
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-sm mx-auto bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
      <h1 className="text-xl font-black text-gray-800">{signup ? "新規登録" : "ログイン"}</h1>
      <label className="block">
        <span className="text-xs font-bold text-gray-500">メールアドレス</span>
        <input
          type="email"
          required
          value={em}
          onChange={(e) => setEm(e.target.value)}
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-gray-500">パスワード（6文字以上）</span>
        <input
          type="password"
          required
          minLength={6}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
        />
      </label>
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      <button disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-white font-bold hover:opacity-90 disabled:opacity-50">
        {signup ? "登録する" : "ログイン"}
      </button>
      <button type="button" onClick={() => setSignup(!signup)} className="text-sm text-primary font-bold underline">
        {signup ? "アカウントをお持ちの方はログイン" : "はじめての方は新規登録"}
      </button>
    </form>
  );
}

/** 店舗一覧を読み込み、選択中の店舗を Context で配る。店舗が無ければ登録フォームを出す */
function StoreGate({ children }: { children: React.ReactNode }) {
  const [stores, setStores] = useState<StoreRecord[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const reloadStores = useCallback(async () => {
    try {
      setStores(await getAdminBackend().listStores());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 保存済みの店舗は描画後にしか読めない
    setSelected(readSavedStore());
    reloadStores();
  }, [reloadStores]);

  const selectStore = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(STORE_KEY, id);
    } catch {}
  }, []);

  const store = stores?.find((s) => s.id === selected) ?? stores?.[0] ?? null;
  const value = useMemo<StoreContextValue | null>(
    () => (store && stores ? { storeId: store.id, storeName: store.name, stores, selectStore, reloadStores } : null),
    [store, stores, selectStore, reloadStores],
  );

  if (error) return <main className="max-w-6xl w-full mx-auto px-4 py-6 text-sm text-red-600">読み込みに失敗しました：{error}</main>;
  if (!stores) return <main className="max-w-6xl w-full mx-auto px-4 py-6 text-sm text-gray-400">読み込み中…</main>;

  if (!value || adding) {
    return (
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <NewStoreForm
          first={!value}
          onCancel={() => setAdding(false)}
          onCreated={async (s) => {
            await reloadStores();
            selectStore(s.id);
            setAdding(false);
          }}
        />
      </main>
    );
  }

  return (
    <StoreContext.Provider value={value}>
      {mode === "cloud" && (
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-xs font-bold text-gray-500">店舗</span>
            {stores.length > 1 ? (
              <select
                value={value.storeId}
                onChange={(e) => selectStore(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 bg-white"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-bold text-gray-800">{value.storeName}</span>
            )}
            <button onClick={() => setAdding(true)} className="text-xs font-bold text-primary underline">
              店舗を追加
            </button>
          </div>
        </div>
      )}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </StoreContext.Provider>
  );
}

function NewStoreForm({
  first,
  onCreated,
  onCancel,
}: {
  first: boolean;
  onCreated: (s: StoreRecord) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onCreated(await getAdminBackend().createStore(name.trim()));
    } catch (err) {
      alert(`店舗を登録できませんでした：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-sm mx-auto bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
      <h1 className="text-xl font-black text-gray-800">{first ? "最初の店舗を登録" : "店舗を追加"}</h1>
      <label className="block">
        <span className="text-xs font-bold text-gray-500">店舗名</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：見る君食堂 渋谷店"
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
        />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={busy || !name.trim()} className="px-5 py-2.5 rounded-lg bg-primary text-white font-bold hover:opacity-90 disabled:opacity-50">
          登録
        </button>
        {!first && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-600 font-bold">
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
