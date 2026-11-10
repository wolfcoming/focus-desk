import type { Project } from "../types";
import { Empty } from "../widgets";

export function ProjectsHome({
  projects,
  onOpen,
  onCreate,
}: {
  projects: Project[];
  onOpen: (id: number) => void;
  onCreate: () => void;
}) {
  const visible = projects.filter((project) => project.status !== "archived");

  return (
    <section className="android-projects-home">
      <header className="android-page-head">
        <h1>项目</h1>
        <button type="button" className="primary" onClick={onCreate}>
          新建
        </button>
      </header>

      {visible.length === 0 ? (
        <Empty text="还没有项目。点右上角新建一条。" />
      ) : (
        <div className="android-list">
          {visible.map((project) => (
            <button
              key={project.id}
              type="button"
              className="android-list-item"
              onClick={() => onOpen(project.id)}
            >
              <span className="android-list-title">{project.name}</span>
              {project.outcome ? (
                <span className="android-list-sub">{project.outcome}</span>
              ) : (
                <span className="android-list-sub muted">还没有写描述</span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
