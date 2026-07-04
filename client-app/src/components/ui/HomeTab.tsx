export function HomeTab() {
  return (
    <div className="p-4">
      <div className="se-header">
        <div>
          <div className="se-logo">УМНАЯ УСАДЬБА</div>
          <div className="se-logo-sub">SmartEstate · загрузка...</div>
        </div>
      </div>
      <div className="mt-4 text-text-dim" style={{ fontSize: 13 }}>
        Загружаю комнаты...
      </div>
    </div>
  );
}

const seStyle = `
  .se-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 22px 0 14px; }
  .se-logo { font-family: 'Cormorant SC', serif; font-size: 20px; letter-spacing: 0.08em; color: #E9E4D8; font-weight: 600; }
  .se-logo-sub { font-size: 11px; color: #5A5F58; margin-top: 3px; font-family: 'JetBrains Mono', monospace; }
`;
const style = document.createElement('style');
style.textContent = seStyle;
document.head.appendChild(style);
