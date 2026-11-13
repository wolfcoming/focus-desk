use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::timeutil;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteNode {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub starred: bool,
    pub pinned: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

const SELECT: &str = "
SELECT id, parent_id, kind, title, body, starred, pinned, sort_order, created_at, updated_at
FROM note_nodes
";

pub fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS note_nodes (
           id INTEGER PRIMARY KEY,
           parent_id INTEGER REFERENCES note_nodes(id),
           kind TEXT NOT NULL CHECK (kind IN ('folder', 'note')),
           title TEXT NOT NULL DEFAULT '',
           body TEXT NOT NULL DEFAULT '',
           starred INTEGER NOT NULL DEFAULT 0,
           pinned INTEGER NOT NULL DEFAULT 0,
           sort_order INTEGER NOT NULL DEFAULT 0,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_note_nodes_parent
           ON note_nodes(parent_id, sort_order, id);",
    )
    .map_err(|err| err.to_string())
}

pub fn list_notes(conn: &Connection) -> Result<Vec<NoteNode>, String> {
    let mut stmt = conn
        .prepare(&format!("{SELECT} ORDER BY id ASC"))
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], map_note)
        .map_err(|err| err.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

pub fn create_note_node(
    conn: &Connection,
    kind: &str,
    parent_id: Option<i64>,
    title: &str,
) -> Result<NoteNode, String> {
    if kind != "folder" && kind != "note" {
        return Err("未知的笔记类型".into());
    }
    require_folder_parent(conn, parent_id)?;
    let title = clean_title(kind, title);
    let sort = next_sort(conn, parent_id)?;
    let stamp = timeutil::now_iso();
    conn.execute(
        "INSERT INTO note_nodes
           (parent_id, kind, title, body, starred, pinned, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, '', 0, 0, ?4, ?5, ?5)",
        params![parent_id, kind, title, sort, stamp],
    )
    .map_err(|err| err.to_string())?;
    get_note(conn, conn.last_insert_rowid())
}

pub fn save_note(conn: &Connection, id: i64, title: &str, body: &str) -> Result<NoteNode, String> {
    let current = get_note(conn, id)?;
    if current.kind != "note" {
        return Err("文件夹没有正文".into());
    }
    if body.len() > 8_000_000 {
        return Err("笔记内容过长".into());
    }
    let title = clean_title("note", title);
    if current.title == title && current.body == body {
        return Ok(current);
    }
    let stamp = timeutil::now_iso();
    let changed = conn
        .execute(
            "UPDATE note_nodes SET title = ?2, body = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, title, body, stamp],
        )
        .map_err(|err| err.to_string())?;
    if changed == 0 {
        return Err("笔记不存在".into());
    }
    get_note(conn, id)
}

pub fn rename_note(conn: &Connection, id: i64, title: &str) -> Result<NoteNode, String> {
    let current = get_note(conn, id)?;
    let title = clean_title(&current.kind, title);
    if current.title == title {
        return Ok(current);
    }
    let stamp = timeutil::now_iso();
    conn.execute(
        "UPDATE note_nodes SET title = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, title, stamp],
    )
    .map_err(|err| err.to_string())?;
    get_note(conn, id)
}

pub fn set_starred(conn: &Connection, id: i64, starred: bool) -> Result<NoteNode, String> {
    set_flag(conn, id, "starred", starred)
}

pub fn set_pinned(conn: &Connection, id: i64, pinned: bool) -> Result<NoteNode, String> {
    set_flag(conn, id, "pinned", pinned)
}

pub fn move_note(conn: &Connection, id: i64, parent_id: Option<i64>) -> Result<NoteNode, String> {
    let current = get_note(conn, id)?;
    if current.parent_id == parent_id {
        return Ok(current);
    }
    require_folder_parent(conn, parent_id)?;
    if let Some(pid) = parent_id {
        if is_inside(conn, id, pid)? {
            return Err("不能移动到自身或子文件夹".into());
        }
    }
    let sort = next_sort(conn, parent_id)?;
    conn.execute(
        "UPDATE note_nodes SET parent_id = ?2, sort_order = ?3 WHERE id = ?1",
        params![id, parent_id, sort],
    )
    .map_err(|err| err.to_string())?;
    get_note(conn, id)
}

pub fn delete_note(conn: &Connection, id: i64) -> Result<(), String> {
    let exists = conn
        .query_row("SELECT 1 FROM note_nodes WHERE id = ?1", params![id], |_| Ok(()))
        .optional()
        .map_err(|err| err.to_string())?;
    if exists.is_none() {
        return Err("笔记不存在".into());
    }
    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    delete_tree(&tx, id)?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(())
}

fn set_flag(conn: &Connection, id: i64, field: &str, value: bool) -> Result<NoteNode, String> {
    let _ = get_note(conn, id)?;
    let sql = match field {
        "starred" => "UPDATE note_nodes SET starred = ?2 WHERE id = ?1",
        "pinned" => "UPDATE note_nodes SET pinned = ?2 WHERE id = ?1",
        _ => return Err("未知标记".into()),
    };
    conn.execute(sql, params![id, if value { 1 } else { 0 }])
        .map_err(|err| err.to_string())?;
    get_note(conn, id)
}

fn get_note(conn: &Connection, id: i64) -> Result<NoteNode, String> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), params![id], map_note)
        .map_err(|err| {
            if err == rusqlite::Error::QueryReturnedNoRows {
                "笔记不存在".into()
            } else {
                err.to_string()
            }
        })
}

fn require_folder_parent(conn: &Connection, parent_id: Option<i64>) -> Result<(), String> {
    let Some(pid) = parent_id else {
        return Ok(());
    };
    let parent = get_note(conn, pid)?;
    if parent.kind != "folder" {
        return Err("只能放在文件夹里".into());
    }
    Ok(())
}

fn next_sort(conn: &Connection, parent_id: Option<i64>) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM note_nodes
         WHERE (?1 IS NULL AND parent_id IS NULL) OR parent_id = ?1",
        params![parent_id],
        |row| row.get(0),
    )
    .map_err(|err| err.to_string())
}

/// True when `node` is `ancestor` or lives inside it.
fn is_inside(conn: &Connection, ancestor: i64, mut node: i64) -> Result<bool, String> {
    for _ in 0..1000 {
        if node == ancestor {
            return Ok(true);
        }
        let parent = conn
            .query_row(
                "SELECT parent_id FROM note_nodes WHERE id = ?1",
                params![node],
                |row| row.get::<_, Option<i64>>(0),
            )
            .optional()
            .map_err(|err| err.to_string())?;
        match parent {
            Some(Some(pid)) => node = pid,
            _ => return Ok(false),
        }
    }
    Err("笔记层级异常".into())
}

fn delete_tree(conn: &Connection, id: i64) -> Result<(), String> {
    let children = {
        let mut stmt = conn
            .prepare("SELECT id FROM note_nodes WHERE parent_id = ?1")
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![id], |row| row.get::<_, i64>(0))
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?
    };
    for child in children {
        delete_tree(conn, child)?;
    }
    conn.execute("DELETE FROM note_nodes WHERE id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn clean_title(kind: &str, title: &str) -> String {
    let title: String = title.trim().chars().take(200).collect();
    if kind == "folder" && title.is_empty() {
        "新建文件夹".into()
    } else {
        title
    }
}

fn map_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteNode> {
    Ok(NoteNode {
        id: row.get(0)?,
        parent_id: row.get(1)?,
        kind: row.get(2)?,
        title: row.get(3)?,
        body: row.get(4)?,
        starred: row.get::<_, i64>(5)? != 0,
        pinned: row.get::<_, i64>(6)? != 0,
        sort_order: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        ensure_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn creates_nests_saves_and_lists() {
        let conn = test_conn();
        let folder = create_note_node(&conn, "folder", None, "工作").unwrap();
        let note = create_note_node(&conn, "note", Some(folder.id), "").unwrap();
        assert_eq!(note.parent_id, Some(folder.id));
        assert_eq!(note.title, "");
        let saved = save_note(&conn, note.id, "周报", "<p>本周</p>").unwrap();
        assert_eq!(saved.title, "周报");
        assert_eq!(saved.body, "<p>本周</p>");
        assert_eq!(list_notes(&conn).unwrap().len(), 2);
        let again = save_note(&conn, note.id, "周报", "<p>本周</p>").unwrap();
        assert_eq!(again.updated_at, saved.updated_at);
    }

    #[test]
    fn rejects_note_as_parent_and_cycle() {
        let conn = test_conn();
        let note = create_note_node(&conn, "note", None, "一篇").unwrap();
        let err = create_note_node(&conn, "note", Some(note.id), "子笔记").unwrap_err();
        assert!(err.contains("文件夹"));
        let parent = create_note_node(&conn, "folder", None, "父").unwrap();
        let child = create_note_node(&conn, "folder", Some(parent.id), "子").unwrap();
        let err = move_note(&conn, parent.id, Some(child.id)).unwrap_err();
        assert!(err.contains("不能移动"));
        let moved = move_note(&conn, note.id, Some(child.id)).unwrap();
        assert_eq!(moved.parent_id, Some(child.id));
    }

    #[test]
    fn delete_removes_descendants() {
        let conn = test_conn();
        let folder = create_note_node(&conn, "folder", None, "").unwrap();
        assert_eq!(folder.title, "新建文件夹");
        let child = create_note_node(&conn, "folder", Some(folder.id), "子").unwrap();
        let note = create_note_node(&conn, "note", Some(child.id), "内文").unwrap();
        delete_note(&conn, folder.id).unwrap();
        assert!(list_notes(&conn).unwrap().is_empty());
        assert!(get_note(&conn, note.id).is_err());
    }

    #[test]
    fn star_pin_do_not_require_body_change() {
        let conn = test_conn();
        let note = create_note_node(&conn, "note", None, "星").unwrap();
        let starred = set_starred(&conn, note.id, true).unwrap();
        assert!(starred.starred);
        assert_eq!(starred.updated_at, note.updated_at);
        let pinned = set_pinned(&conn, note.id, true).unwrap();
        assert!(pinned.pinned);
    }
}
