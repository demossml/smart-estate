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
  .se-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 4px; }
  .se-logo { font-family: 'Cormorant SC', serif; font-size: 16px; letter-spacing: 0.12em; color: #E9E4D8; font-weight: 600; }
`;
const style = document.createElement('style');
style.textContent = seStyle;
document.head.appendChild(style);
