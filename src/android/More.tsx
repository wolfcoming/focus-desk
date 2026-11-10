type MorePage = "settings";

const LINKS: { id: MorePage; title: string; hint: string }[] = [
  { id: "settings", title: "设置", hint: "模型、同步与数据" },
];

export function More({ onOpen }: { onOpen: (page?: MorePage) => void }) {
  return (
    <section className="android-more">
      <header className="android-page-head">
        <div className="android-page-head-copy">
          <h1>更多</h1>
          <p className="lead">账号与偏好</p>
        </div>
      </header>
      <div className="android-list">
        {LINKS.map((link) => (
          <button
            key={link.id}
            type="button"
            className="android-list-item"
            onClick={() => onOpen(link.id)}
          >
            <span className="android-list-title">{link.title}</span>
            <span className="android-list-sub">{link.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
