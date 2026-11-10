type MorePage = "progress" | "weekly" | "settings";

const LINKS: { id: MorePage; title: string; hint: string }[] = [
  { id: "progress", title: "进度总览", hint: "各项目完成度一眼看完" },
  { id: "weekly", title: "周回顾", hint: "本周堆积与停滞事项" },
  { id: "settings", title: "设置", hint: "模型、同步与数据" },
];

export function More({ onOpen }: { onOpen: (page: MorePage) => void }) {
  return (
    <section className="android-more">
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
