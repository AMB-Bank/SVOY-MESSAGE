/** Название бренда: «СВО» — красным, «Й» — белым. Использовать на синем/тёмном фоне. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }} aria-label="СВОЙ">
      <span className="wm-red">СВО</span><span className="wm-white">Й</span>
    </span>
  );
}
export const SLOGAN = "Связь, которая объединяет";
