export function PendingRow({ text }: { text: string }) {
  return (
    <li aria-live="polite">
      <span>{text}</span>
      <span>处理中…</span>
    </li>
  );
}
