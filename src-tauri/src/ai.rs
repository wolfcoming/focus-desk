use std::time::Duration;

use serde::Deserialize;
use serde_json::json;

use crate::db::{self, Item, ItemDraft, Project, Subproject, Suggested, WeeklyPacket};

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
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MorningResult {
    pub source: String,
    pub note: String,
    pub picks: Vec<MorningPick>,
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
pub struct WeeklyResult {
    pub source: String,
    pub summary: String,
}

pub fn has_api_key() -> Result<bool, String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|err| err.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(err) => Err(err.to_string()),
    }
}

pub fn set_api_key(value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|err| err.to_string())?;
    if value.trim().is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        }
    } else {
        entry.set_password(value.trim()).map_err(|err| err.to_string())
    }
}

pub fn load_config(conn: &rusqlite::Connection) -> Result<Option<AiConfig>, String> {
    if !has_api_key()? {
        return Ok(None);
    }
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|err| err.to_string())?;
    let api_key = entry.get_password().map_err(|err| err.to_string())?;
    let base_url = db::get_setting(conn, "ai_base_url")?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "https://api.openai.com/v1".into());
    let model = db::get_setting(conn, "ai_model")?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "gpt-4o-mini".into());
    Ok(Some(AiConfig { base_url, model, api_key }))
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
        };
    };
    let user = format!(
        "原句：{}\n项目：{}\n子任务：{}",
        item.title,
        project_lines(projects),
        sub_lines(subs)
    );
    match chat(
        &config,
        "你是个人任务整理助手。只返回 JSON，不要解释。kind 只能是 task 或 waiting。项目任务用 projectId（大项目 id），不要填 subprojectId；等待跟进用 subprojectId（子任务 id）并给出 waitingOn 和 followUpAt。id 只能用给定的，不能编造。重要与否放在 important。不要填 estimateMin。时间用 YYYY-MM-DDTHH:MM。",
        &user,
    )
    .await
    {
        Ok(text) => match parse_draft(&text, item, projects, subs) {
            Ok(draft) => ClarifyResult {
                source: "ai".into(),
                note: "助手预填了字段，保存前你可以改。".into(),
                draft,
            },
            Err(err) => ClarifyResult {
                source: "rules".into(),
                note: format!("助手的结果无法使用（{err}），改为手填。"),
                draft: blank_draft(item),
            },
        },
        Err(err) => ClarifyResult {
            source: "rules".into(),
            note: format!("助手暂时没连上（{err}），改为手填。"),
            draft: blank_draft(item),
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
    };
    let Some(config) = config else {
        return fallback;
    };
    if fallback.picks.is_empty() {
        return MorningResult {
            source: "rules".into(),
            note: "没有可排进今日三件的重要任务。".into(),
            picks: Vec::new(),
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
        Ok(text) => match parse_morning(&text, &fallback.picks) {
            Ok(picks) if !picks.is_empty() => MorningResult {
                source: "ai".into(),
                note: "助手从规则候选里排了今天的三件。".into(),
                picks,
            },
            _ => fallback,
        },
        Err(_) => fallback,
    }
}

pub async fn weekly(config: Option<AiConfig>, packet: &WeeklyPacket) -> WeeklyResult {
    let rules = format!(
        "收集箱 {} 条，停滞的子任务 {} 个，到点的等待 {} 条，没有截止的重要任务 {} 条，本周拒绝切换 {} 次。",
        packet.inbox.len(),
        packet.stale.len(),
        packet.follow_ups.len(),
        packet.undated_important.len(),
        packet.overrides.len()
    );
    let Some(config) = config else {
        return WeeklyResult {
            source: "rules".into(),
            summary: rules,
        };
    };
    let detail = json!({
        "inbox": packet.inbox.iter().map(|item| item.title.clone()).collect::<Vec<_>>(),
        "stale": packet.stale.iter().map(|item| format!("{} / {}", item.project_name, item.name)).collect::<Vec<_>>(),
        "followUps": packet.follow_ups.iter().map(|item| item.title.clone()).collect::<Vec<_>>(),
        "undated": packet.undated_important.iter().map(|item| item.title.clone()).collect::<Vec<_>>(),
        "overrides": packet.overrides.iter().map(|item| item.reason.clone()).collect::<Vec<_>>()
    });
    match chat(
        &config,
        "你在帮一个人做每周回顾。用中文写一段不超过 120 字的材料，点出该清空、该跟进、该暂停的事。只返回 JSON：{\"summary\":\"...\"}。不要替他做最终决定。",
        &detail.to_string(),
    )
    .await
    {
        Ok(text) => match extract_json(&text).and_then(|value| {
            value
                .get("summary")
                .and_then(|item| item.as_str())
                .map(|summary| summary.to_string())
                .ok_or_else(|| "缺少 summary".to_string())
        }) {
            Ok(summary) => WeeklyResult { source: "ai".into(), summary },
            Err(_) => WeeklyResult { source: "rules".into(), summary: rules },
        },
        Err(_) => WeeklyResult { source: "rules".into(), summary: rules },
    }
}

pub async fn match_id(config: &AiConfig, text: &str, items: &[Item]) -> Result<Option<i64>, String> {
    if text.trim().chars().count() < 2 || items.is_empty() {
        return Ok(None);
    }
    let listed = items
        .iter()
        .map(|item| format!("{} {} {}", item.id, item.kind, item.title))
        .collect::<Vec<_>>()
        .join("\n");
    let text = chat(
        config,
        "判断用户正在做的事是否对应列表中的某一条。只返回 JSON：{\"itemId\":数字或 null}。不能编造 id。对不上就返回 null。",
        &format!("用户说：{text}\n列表：\n{listed}"),
    )
    .await?;
    let value = extract_json(&text)?;
    let id = value.get("itemId").and_then(|item| item.as_i64());
    if let Some(id) = id {
        if items.iter().any(|item| item.id == id) {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

async fn chat(config: &AiConfig, system: &str, user: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
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
        body["reasoning"] = json!({ "effort": "none" });
    } else {
        body["temperature"] = json!(0.2);
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
    payload
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .filter(|content| !content.trim().is_empty())
        .ok_or_else(|| "模型没有返回内容".into())
}

fn parse_draft(text: &str, item: &Item, projects: &[Project], subs: &[Subproject]) -> Result<ItemDraft, String> {
    let value = extract_json(text)?;
    let loose: LooseDraft = serde_json::from_value(value).map_err(|err| err.to_string())?;
    let kind = match loose.kind.as_str() {
        "waiting" => "waiting".into(),
        _ => "task".into(),
    };
    let estimate_min = loose.estimate_min.filter(|minutes| matches!(minutes, 15 | 25 | 50 | 90));
    let (project_id, subproject_id) = if kind == "waiting" {
        let subproject_id = loose.subproject_id.filter(|id| subs.iter().any(|sub| sub.id == *id));
        let project_id = subproject_id.and_then(|id| {
            subs.iter().find(|sub| sub.id == id).map(|sub| sub.project_id)
        });
        (project_id, subproject_id)
    } else {
        let project_id = loose.project_id.filter(|id| projects.iter().any(|project| project.id == *id));
        (project_id, None)
    };
    Ok(ItemDraft {
        id: Some(item.id),
        kind,
        title: if loose.title.trim().is_empty() { item.title.clone() } else { loose.title },
        notes: loose.notes,
        project_id,
        subproject_id,
        important: loose.important,
        due_at: loose.due_at,
        estimate_min,
        repeat_days: loose.repeat_days,
        window_start: loose.window_start,
        window_end: loose.window_end,
        grace_min: loose.grace_min.or(Some(30)),
        interrupt_after_grace: loose.interrupt_after_grace,
        waiting_on: loose.waiting_on,
        follow_up_at: loose.follow_up_at,
    })
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
    ItemDraft {
        id: Some(item.id),
        kind: "task".into(),
        title: item.title.clone(),
        notes: item.notes.clone(),
        project_id: item.project_id,
        subproject_id: item.subproject_id,
        important: item.important,
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

fn sub_lines(subs: &[Subproject]) -> String {
    if subs.is_empty() {
        return "（还没有子任务）".into();
    }
    subs.iter()
        .map(|sub| format!("{} {} / {}", sub.id, sub.project_name, sub.name))
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
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct LooseDraft {
    kind: String,
    title: String,
    notes: String,
    project_id: Option<i64>,
    subproject_id: Option<i64>,
    important: Option<bool>,
    due_at: Option<String>,
    estimate_min: Option<i64>,
    repeat_days: Option<String>,
    window_start: Option<String>,
    window_end: Option<String>,
    grace_min: Option<i64>,
    interrupt_after_grace: bool,
    waiting_on: Option<String>,
    follow_up_at: Option<String>,
}

impl Default for LooseDraft {
    fn default() -> Self {
        Self {
            kind: String::new(),
            title: String::new(),
            notes: String::new(),
            project_id: None,
            subproject_id: None,
            important: None,
            due_at: None,
            estimate_min: None,
            repeat_days: None,
            window_start: None,
            window_end: None,
            grace_min: None,
            interrupt_after_grace: false,
            waiting_on: None,
            follow_up_at: None,
        }
    }
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
