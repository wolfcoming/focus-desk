use std::time::Duration;

use serde::Deserialize;
use serde_json::json;

use crate::db::{self, Item, ItemDraft, Project, Subproject, Suggested};

const SERVICE: &str = "focus-desk";
const ACCOUNT: &str = "ai-api-key";

#[derive(Clone)]
pub struct AiConfig {
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClarifyResult {
    pub source: String,
    pub note: String,
    pub draft: ItemDraft,
    pub thinking: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MorningResult {
    pub source: String,
    pub note: String,
    pub picks: Vec<MorningPick>,
    pub thinking: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MorningPick {
    pub id: i64,
    pub title: String,
    pub reason: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowUpLines {
    pub scripts: Vec<String>,
    pub thinking: Option<String>,
}

struct ChatReply {
    content: String,
    thinking: Option<String>,
}

pub fn has_api_key() -> Result<bool, String> {
    crate::secret::has(SERVICE, ACCOUNT)
}

pub fn set_api_key(value: &str) -> Result<(), String> {
    crate::secret::set(SERVICE, ACCOUNT, value)
}

pub fn load_config(conn: &rusqlite::Connection) -> Result<Option<AiConfig>, String> {
    let Some(api_key) = crate::secret::get(SERVICE, ACCOUNT)? else {
        return Ok(None);
    };
    let base_url = db::get_setting(conn, "ai_base_url")?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "https://api.openai.com/v1".into());
    let model = db::get_setting(conn, "ai_model")?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "gpt-4o-mini".into());
    Ok(Some(AiConfig { base_url, model, api_key }))
}

pub fn resolve_probe_config(
    conn: &rusqlite::Connection,
    base_url: Option<&str>,
    model: Option<&str>,
    api_key: Option<&str>,
) -> Result<AiConfig, String> {
    let stored = load_config(conn)?;
    let api_key = api_key
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| stored.as_ref().map(|config| config.api_key.clone()))
        .ok_or_else(|| "还没有配置钥匙".to_string())?;
    let base_url = base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.trim_end_matches('/').to_string())
        .or_else(|| stored.as_ref().map(|config| config.base_url.clone()))
        .unwrap_or_else(|| "https://api.openai.com/v1".into());
    let model = model
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| stored.as_ref().map(|config| config.model.clone()))
        .unwrap_or_else(|| "gpt-4o-mini".into());
    Ok(AiConfig { base_url, model, api_key })
}

pub async fn probe(config: AiConfig) -> Result<String, String> {
    let model = config.model.clone();
    let reply = chat(&config, "你只做连通检测。只回复两个字：成功。", "检测").await?;
    let snippet: String = reply.content.chars().take(40).collect();
    let thinking = reply
        .thinking
        .as_deref()
        .map(|text| format!("\n思考过程：{}", text.chars().take(120).collect::<String>()))
        .unwrap_or_default();
    Ok(format!("连接成功。模型 {model} 已响应：{snippet}{thinking}"))
}

pub async fn clarify(
    config: Option<AiConfig>,
    item: &Item,
    projects: &[Project],
    subs: &[Subproject],
) -> ClarifyResult {
    let Some(config) = config else {
        return ClarifyResult {
            source: "rules".into(),
            note: "还没有配置模型，这条先手填。".into(),
            draft: blank_draft(item),
            thinking: None,
        };
    };
    let user = format!(
        "原句：{}\n项目：{}",
        item.title,
        project_lines(projects),
    );
    match chat(
        &config,
        "你是个人任务整理助手。只返回一个 JSON 对象，不要解释，不要 Markdown。字段必须是扁平值：title/notes/waitingOn/dueAt/followUpAt 只能是字符串或 null，不能是对象；projectId 只能是数字或 null；important/urgent 只能是 true/false。kind 只能是 todo、task 或 waiting。todo=仍为待办但挂上项目；task=项目任务；waiting=阻塞项。都用 projectId（大项目 id）；todo 可填 subprojectId，task/waiting 不要填 subprojectId；waiting 还要给出 waitingOn 和 followUpAt。id 只能用给定的，不能编造。不要填 estimateMin。时间用 YYYY-MM-DDTHH:MM。",
        &user,
    )
    .await
    {
        Ok(reply) => match parse_draft(&reply.content, item, projects, subs) {
            Ok(draft) => ClarifyResult {
                source: "ai".into(),
                note: "助手预填了字段，保存前你可以改。".into(),
                draft,
                thinking: reply.thinking,
            },
            Err(err) => ClarifyResult {
                source: "rules".into(),
                note: format!("助手的结果无法使用（{err}），改为手填。"),
                draft: blank_draft(item),
                thinking: reply.thinking,
            },
        },
        Err(err) => ClarifyResult {
            source: "rules".into(),
            note: format!("助手暂时没连上（{err}），改为手填。"),
            draft: blank_draft(item),
            thinking: None,
        },
    }
}

pub async fn morning(config: Option<AiConfig>, suggestions: &[Suggested]) -> MorningResult {
    let fallback = MorningResult {
        source: "rules".into(),
        note: "按重要和截止时间排了三件。".into(),
        picks: suggestions
            .iter()
            .map(|item| MorningPick {
                id: item.item.id,
                title: item.item.title.clone(),
                reason: item.reason.clone(),
            })
            .collect(),
        thinking: None,
    };
    let Some(config) = config else {
        return fallback;
    };
    if fallback.picks.is_empty() {
        return MorningResult {
            source: "rules".into(),
            note: "没有可排进今日三件的重要任务。".into(),
            picks: Vec::new(),
            thinking: None,
        };
    }
    let listed = fallback
        .picks
        .iter()
        .map(|pick| format!("{} {}", pick.id, pick.title))
        .collect::<Vec<_>>()
        .join("\n");
    match chat(
        &config,
        "从候选里选最多 3 件作为今天的项目重点，只返回 JSON：{\"picks\":[{\"id\":1,\"reason\":\"一句理由\"}]}。id 必须来自候选。理由用中文，一句。",
        &listed,
    )
    .await
    {
        Ok(reply) => match parse_morning(&reply.content, &fallback.picks) {
            Ok(picks) if !picks.is_empty() => MorningResult {
                source: "ai".into(),
                note: "助手从规则候选里排了今天的三件。".into(),
                picks,
                thinking: reply.thinking,
            },
            _ => MorningResult {
                thinking: reply.thinking,
                ..fallback
            },
        },
        Err(_) => fallback,
    }
}

pub async fn follow_up_lines(config: Option<AiConfig>, item: &Item, extra: &str) -> Result<FollowUpLines, String> {
    let Some(config) = config else {
        return Err("还没有配置模型".into());
    };
    let user = format!(
        "标题：{}\n在等：{}\n项目：{}\n备注：{}\n补充：{}",
        item.title,
        item.waiting_on.as_deref().unwrap_or("未写"),
        item.project_name.as_deref().unwrap_or("未挂项目"),
        if item.notes.trim().is_empty() { "无" } else { item.notes.as_str() },
        if extra.trim().is_empty() { "无" } else { extra.trim() }
    );
    let reply = chat(
        &config,
        "你在帮一个人跟进卡住的事。根据材料写 1 到 5 条可以直接发出去的中文问询话术，用来推动对方回复、确认或给出下一步。语气具体、礼貌、短。每条单独能发。只返回 JSON：{\"scripts\":[\"话术一\",\"话术二\"]}。不要 Markdown，不要解释。",
        &user,
    )
    .await?;
    let scripts = parse_scripts(&reply.content)?;
    if scripts.is_empty() {
        return Err("没有生成可用的问询话术".into());
    }
    Ok(FollowUpLines {
        scripts,
        thinking: reply.thinking,
    })
}

fn parse_scripts(text: &str) -> Result<Vec<String>, String> {
    let value = extract_json(text)?;
    let list = if let Some(items) = value.as_array() {
        items.clone()
    } else {
        value
            .get("scripts")
            .or_else(|| value.get("lines"))
            .and_then(|item| item.as_array())
            .cloned()
            .ok_or("模型没有返回话术列表")?
    };
    let mut scripts = Vec::new();
    for item in &list {
        if scripts.len() == 5 {
            break;
        }
        let text = value_to_string(item).trim().to_string();
        if text.chars().count() >= 4 && !scripts.iter().any(|known: &String| known == &text) {
            scripts.push(text);
        }
    }
    Ok(scripts)
}

pub async fn match_id(config: &AiConfig, text: &str, items: &[Item]) -> Result<(Option<i64>, Option<String>), String> {
    if text.trim().chars().count() < 2 || items.is_empty() {
        return Ok((None, None));
    }
    let listed = items
        .iter()
        .map(|item| format!("{} {} {}", item.id, item.kind, item.title))
        .collect::<Vec<_>>()
        .join("\n");
    let reply = chat(
        config,
        "判断用户正在做的事是否对应列表中的某一条。只返回 JSON：{\"itemId\":数字或 null}。不能编造 id。对不上就返回 null。",
        &format!("用户说：{text}\n列表：\n{listed}"),
    )
    .await?;
    let value = extract_json(&reply.content)?;
    let id = value.get("itemId").and_then(|item| item.as_i64());
    if let Some(id) = id {
        if items.iter().any(|item| item.id == id) {
            return Ok((Some(id), reply.thinking));
        }
    }
    Ok((None, reply.thinking))
}

async fn chat(config: &AiConfig, system: &str, user: &str) -> Result<ChatReply, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|err| err.to_string())?;
    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    let mut body = json!({
        "model": config.model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
    });
    if config.model.contains("gpt-6-luna") {
        // low effort keeps latency reasonable while still returning thinking when available
        body["reasoning"] = json!({ "effort": "low" });
    } else {
        body["temperature"] = json!(0.2);
        if config.base_url.contains("openrouter") {
            body["reasoning"] = json!({ "exclude": false });
        }
    }
    let response = client
        .post(url)
        .bearer_auth(&config.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(180).collect();
        return Err(format!("模型接口返回 {status} {snippet}"));
    }
    let payload: ChatResponse = response.json().await.map_err(|err| err.to_string())?;
    let message = payload
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message)
        .ok_or_else(|| "模型没有返回内容".to_string())?;
    let content = message_content(&message);
    if content.trim().is_empty() {
        return Err("模型没有返回内容".into());
    }
    Ok(ChatReply {
        content,
        thinking: message_thinking(&message),
    })
}

fn message_content(message: &ChatMessage) -> String {
    match &message.content {
        serde_json::Value::String(text) => text.clone(),
        serde_json::Value::Array(parts) => parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .and_then(|text| text.as_str())
                    .or_else(|| part.as_str())
            })
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

fn message_thinking(message: &ChatMessage) -> Option<String> {
    let direct = message
        .reasoning
        .as_deref()
        .or(message.reasoning_content.as_deref())
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string);
    if direct.is_some() {
        return direct;
    }
    let details = message.reasoning_details.as_ref()?;
    let joined = details
        .iter()
        .filter_map(|detail| {
            detail
                .get("text")
                .and_then(|text| text.as_str())
                .or_else(|| detail.get("summary").and_then(|text| text.as_str()))
                .or_else(|| detail.get("content").and_then(|text| text.as_str()))
        })
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

fn parse_draft(text: &str, item: &Item, projects: &[Project], subs: &[Subproject]) -> Result<ItemDraft, String> {
    let value = extract_json(text)?;
    let kind = match json_str(&value, &["kind"]).as_str() {
        "waiting" => "waiting".into(),
        "todo" => "todo".into(),
        _ => "task".into(),
    };
    let title = json_str(&value, &["title"]);
    let notes = json_str(&value, &["notes"]);
    let important = json_bool(&value, &["important"]);
    let urgent = json_bool(&value, &["urgent"]);
    let due_at = nonempty_opt(json_str(&value, &["dueAt", "due_at"]));
    let waiting_on = nonempty_opt(json_str(&value, &["waitingOn", "waiting_on"]));
    let follow_up_at = nonempty_opt(json_str(&value, &["followUpAt", "follow_up_at"]));
    let project_id = json_i64(&value, &["projectId", "project_id"])
        .or_else(|| {
            json_i64(&value, &["subprojectId", "subproject_id"]).and_then(|id| {
                subs.iter().find(|sub| sub.id == id).map(|sub| sub.project_id)
            })
        })
        .filter(|id| projects.iter().any(|project| project.id == *id));
    let subproject_id = if kind == "todo" {
        json_i64(&value, &["subprojectId", "subproject_id"]).and_then(|id| {
            subs.iter().find(|sub| {
                sub.id == id && project_id.map(|pid| pid == sub.project_id).unwrap_or(false)
            }).map(|sub| sub.id)
        })
    } else {
        None
    };
    Ok(ItemDraft {
        id: Some(item.id),
        kind,
        title: if title.trim().is_empty() { item.title.clone() } else { title },
        notes,
        project_id,
        subproject_id,
        important,
        urgent,
        due_at,
        estimate_min: None,
        repeat_days: None,
        window_start: None,
        window_end: None,
        grace_min: None,
        interrupt_after_grace: false,
        waiting_on,
        follow_up_at,
    })
}

fn nonempty_opt(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn json_get<'a>(value: &'a serde_json::Value, keys: &[&str]) -> Option<&'a serde_json::Value> {
    keys.iter().find_map(|key| value.get(*key))
}

fn json_str(value: &serde_json::Value, keys: &[&str]) -> String {
    json_get(value, keys).map(value_to_string).unwrap_or_default()
}

fn json_i64(value: &serde_json::Value, keys: &[&str]) -> Option<i64> {
    let Some(raw) = json_get(value, keys) else {
        return None;
    };
    match raw {
        serde_json::Value::Number(number) => number.as_i64(),
        serde_json::Value::String(text) => text.trim().parse().ok(),
        serde_json::Value::Object(map) => map
            .get("id")
            .or_else(|| map.get("value"))
            .and_then(|inner| match inner {
                serde_json::Value::Number(number) => number.as_i64(),
                serde_json::Value::String(text) => text.trim().parse().ok(),
                _ => None,
            }),
        _ => None,
    }
}

fn json_bool(value: &serde_json::Value, keys: &[&str]) -> Option<bool> {
    let Some(raw) = json_get(value, keys) else {
        return None;
    };
    match raw {
        serde_json::Value::Bool(flag) => Some(*flag),
        serde_json::Value::Number(number) => number.as_i64().map(|value| value != 0),
        serde_json::Value::String(text) => match text.trim().to_lowercase().as_str() {
            "true" | "yes" | "1" | "重要" | "紧急" => Some(true),
            "false" | "no" | "0" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn value_to_string(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(text) => text.clone(),
        serde_json::Value::Number(number) => number.to_string(),
        serde_json::Value::Bool(flag) => flag.to_string(),
        serde_json::Value::Array(items) => items
            .iter()
            .map(value_to_string)
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join(" "),
        serde_json::Value::Object(map) => {
            for key in ["text", "value", "content", "title", "notes", "summary", "body"] {
                if let Some(inner) = map.get(key) {
                    let text = value_to_string(inner);
                    if !text.trim().is_empty() {
                        return text;
                    }
                }
            }
            if let (Some(date), Some(time)) = (
                map.get("date").and_then(|item| item.as_str()),
                map.get("time").and_then(|item| item.as_str()),
            ) {
                let time = if time.len() == 5 { format!("{time}:00") } else { time.to_string() };
                return format!("{date}T{time}");
            }
            String::new()
        }
    }
}

fn parse_morning(text: &str, allowed: &[MorningPick]) -> Result<Vec<MorningPick>, String> {
    #[derive(Deserialize)]
    struct Payload {
        picks: Vec<Pick>,
    }
    #[derive(Deserialize)]
    struct Pick {
        id: i64,
        reason: String,
    }
    let value = extract_json(text)?;
    let payload: Payload = serde_json::from_value(value).map_err(|err| err.to_string())?;
    let mut picks = Vec::new();
    for pick in payload.picks {
        if picks.len() == 3 {
            break;
        }
        if let Some(known) = allowed.iter().find(|item| item.id == pick.id) {
            if picks.iter().any(|item: &MorningPick| item.id == pick.id) {
                continue;
            }
            picks.push(MorningPick {
                id: pick.id,
                title: known.title.clone(),
                reason: if pick.reason.trim().is_empty() { known.reason.clone() } else { pick.reason },
            });
        }
    }
    Ok(picks)
}

fn blank_draft(item: &Item) -> ItemDraft {
    let kind = if item.kind == "todo" { "todo" } else { "task" };
    ItemDraft {
        id: Some(item.id),
        kind: kind.into(),
        title: item.title.clone(),
        notes: item.notes.clone(),
        project_id: item.project_id,
        subproject_id: if kind == "todo" { item.subproject_id } else { None },
        important: item.important,
        urgent: item.urgent,
        due_at: item.due_at.clone(),
        estimate_min: item.estimate_min,
        repeat_days: item.repeat_days.clone(),
        window_start: item.window_start.clone(),
        window_end: item.window_end.clone(),
        grace_min: item.grace_min.or(Some(30)),
        interrupt_after_grace: item.interrupt_after_grace,
        waiting_on: item.waiting_on.clone(),
        follow_up_at: item.follow_up_at.clone(),
    }
}

fn project_lines(projects: &[Project]) -> String {
    if projects.is_empty() {
        return "（还没有项目）".into();
    }
    projects
        .iter()
        .map(|project| format!("{} {}（{}）", project.id, project.name, project.status))
        .collect::<Vec<_>>()
        .join("；")
}

fn extract_json(text: &str) -> Result<serde_json::Value, String> {
    let trimmed = text.trim();
    if let Ok(value) = serde_json::from_str(trimmed) {
        return Ok(value);
    }
    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if let Ok(value) = serde_json::from_str(&trimmed[start..=end]) {
            return Ok(value);
        }
    }
    Err("模型没有返回可识别的 JSON".into())
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatMessage {
    #[serde(default)]
    content: serde_json::Value,
    #[serde(default)]
    reasoning: Option<String>,
    #[serde(default)]
    reasoning_content: Option<String>,
    #[serde(default)]
    reasoning_details: Option<Vec<serde_json::Value>>,
}

pub fn stored_base_url(conn: &rusqlite::Connection) -> Result<String, String> {
    Ok(db::get_setting(conn, "ai_base_url")?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "https://api.openai.com/v1".into()))
}

pub fn stored_model(conn: &rusqlite::Connection) -> Result<String, String> {
    Ok(db::get_setting(conn, "ai_model")?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "gpt-4o-mini".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Project, Subproject};

    fn sample_item() -> Item {
        Item {
            id: 1,
            kind: "inbox".into(),
            title: "发布会项目下周一早上要开个30分钟会议".into(),
            notes: String::new(),
            project_id: None,
            subproject_id: None,
            project_name: None,
            subproject_name: None,
            important: None,
            urgent: None,
            due_at: None,
            estimate_min: None,
            status: "inbox".into(),
            repeat_days: None,
            window_start: None,
            window_end: None,
            grace_min: None,
            interrupt_after_grace: false,
            waiting_on: None,
            follow_up_at: None,
            started_at: None,
            snooze_until: None,
            quadrant: None,
        }
    }

    #[test]
    fn parse_draft_accepts_nested_string_fields() {
        let item = sample_item();
        let projects = vec![Project {
            id: 10,
            name: "发布会".into(),
            outcome: String::new(),
            status: "active".into(),
            created_at: String::new(),
            updated_at: String::new(),
        }];
        let text = r#"{
          "kind": "task",
          "title": {"text": "开发布会准备会"},
          "notes": {"body": "30分钟"},
          "projectId": {"id": 10},
          "important": true,
          "urgent": true,
          "dueAt": {"date": "2026-11-03", "time": "09:00"}
        }"#;
        let draft = parse_draft(text, &item, &projects, &[] as &[Subproject]).unwrap();
        assert_eq!(draft.kind, "task");
        assert_eq!(draft.title, "开发布会准备会");
        assert_eq!(draft.notes, "30分钟");
        assert_eq!(draft.project_id, Some(10));
        assert_eq!(draft.due_at.as_deref(), Some("2026-11-03T09:00:00"));
        assert_eq!(draft.important, Some(true));
        assert_eq!(draft.urgent, Some(true));
    }
}
