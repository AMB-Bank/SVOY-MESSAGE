export function Avatar({ name, url, size = 44, online }: { name?: string; url?: string; size?: number; online?: boolean }) {
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {url ? <img src={url} alt="" /> : letter}
      {online && <i className="dot" />}
    </span>
  );
}
