import { useEffect, useState } from "react";

interface BIPEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

export function InstallBanner() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(() => localStorage.getItem("svoy:install-dismissed") === "1");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (standalone || hidden) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const dismiss = () => { localStorage.setItem("svoy:install-dismissed", "1"); setHidden(true); };
  return (
    <div className="install">
      <div>
        <b>Установить СВОЙ</b>
        {evt ? <p>Добавьте приложение на главный экран.</p>
          : ios ? <p>В Safari нажмите «Поделиться» → «На экран “Домой”».</p>
          : <p>Меню браузера (⋮) → «Установить приложение» или «Добавить на главный экран». Не все браузеры предлагают установку автоматически.</p>}
      </div>
      {evt && <button className="btn" onClick={async () => { await evt.prompt(); setEvt(null); }}>Установить</button>}
      <button className="btn ghost" onClick={dismiss} aria-label="Закрыть">✕</button>
    </div>
  );
}
