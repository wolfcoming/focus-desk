use chrono::{DateTime, Local};
use serde::Serialize;

use crate::timeutil::format_short;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InterruptClass {
    MustNow,
    Today,
    DailySoft,
    DailyGrace,
    DailyGraceQuiet,
    Stall,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Continue,
    FinishSlice,
    Switch,
}

#[derive(Debug, Clone, Copy)]
pub struct CurrentWork {
    pub important: bool,
    pub must_now: bool,
    pub today_focus: bool,
    pub remaining_min: Option<i64>,
    pub due_at: Option<DateTime<Local>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Judgment {
    pub verdict: Verdict,
    pub reason: String,
    pub snooze_min: i64,
}

pub struct JudgeInput {
    pub class: InterruptClass,
    pub incoming_due: Option<DateTime<Local>>,
    pub current: Option<CurrentWork>,
    pub already_on_it: bool,
}

pub fn class_name(class: InterruptClass) -> &'static str {
    match class {
        InterruptClass::MustNow => "must_now",
        InterruptClass::Today => "today",
        InterruptClass::DailySoft => "daily_soft",
        InterruptClass::DailyGrace => "daily_grace",
        InterruptClass::DailyGraceQuiet => "daily_grace_quiet",
        InterruptClass::Stall => "stall",
    }
}

pub fn parse_class(value: &str) -> Option<InterruptClass> {
    Some(match value {
        "must_now" => InterruptClass::MustNow,
        "today" => InterruptClass::Today,
        "daily_soft" => InterruptClass::DailySoft,
        "daily_grace" => InterruptClass::DailyGrace,
        "daily_grace_quiet" => InterruptClass::DailyGraceQuiet,
        "stall" => InterruptClass::Stall,
        _ => return None,
    })
}

pub fn verdict_name(verdict: Verdict) -> &'static str {
    match verdict {
        Verdict::Continue => "continue",
        Verdict::FinishSlice => "finish_slice",
        Verdict::Switch => "switch",
    }
}

pub fn priority(class: InterruptClass) -> u8 {
    match class {
        InterruptClass::MustNow => 100,
        InterruptClass::DailyGrace => 80,
        InterruptClass::Today => 60,
        InterruptClass::DailyGraceQuiet => 40,
        InterruptClass::DailySoft => 20,
        InterruptClass::Stall => 10,
    }
}

pub fn judge(input: JudgeInput) -> Judgment {
    if input.already_on_it {
        return Judgment {
            verdict: Verdict::Continue,
            reason: "你已经在做这件。".into(),
            snooze_min: 30,
        };
    }

    match input.class {
        InterruptClass::DailySoft => {
            return Judgment {
                verdict: Verdict::Continue,
                reason: "日常义务刚进入时间窗，先继续手头的事。".into(),
                snooze_min: 90,
            };
        }
        InterruptClass::Stall => {
            return Judgment {
                verdict: Verdict::Continue,
                reason: "这条线已经 3 天没有动。先记下，再决定继续、暂停或归档。".into(),
                snooze_min: 180,
            };
        }
        InterruptClass::DailyGraceQuiet => {
            return Judgment {
                verdict: Verdict::Continue,
                reason: "日常义务过了宽限，这件不要求打断。继续手头工作，稍后再补。".into(),
                snooze_min: 90,
            };
        }
        _ => {}
    }

    if let Some(current) = input.current {
        if current.important {
            if let Some(remaining) = current.remaining_min {
                if remaining <= 15 {
                    return Judgment {
                        verdict: Verdict::FinishSlice,
                        reason: format!("手头这件事大约还剩 {remaining} 分钟，先做完这一段。"),
                        snooze_min: remaining.max(5),
                    };
                }
            }
        }
    }

    match input.class {
        InterruptClass::MustNow => judge_must_now(input.incoming_due, input.current),
        InterruptClass::Today => judge_today(input.current),
        InterruptClass::DailyGrace => judge_daily_grace(input.current),
        InterruptClass::DailySoft
        | InterruptClass::DailyGraceQuiet
        | InterruptClass::Stall => unreachable!("handled above"),
    }
}

fn judge_must_now(incoming_due: Option<DateTime<Local>>, current: Option<CurrentWork>) -> Judgment {
    let Some(current) = current else {
        return Judgment {
            verdict: Verdict::Switch,
            reason: "这件必须现在处理，手头对不上重要工作。".into(),
            snooze_min: 15,
        };
    };

    if current.must_now {
        let incoming_earlier = match (incoming_due, current.due_at) {
            (Some(incoming), Some(current_due)) => incoming <= current_due,
            (Some(_), None) => true,
            _ => false,
        };
        if incoming_earlier {
            let when = incoming_due
                .map(format_short)
                .unwrap_or_else(|| "更早".into());
            return Judgment {
                verdict: Verdict::Switch,
                reason: format!("两件都得马上做，这件截止更早（{when}）。"),
                snooze_min: 15,
            };
        }
        return Judgment {
            verdict: Verdict::Continue,
            reason: "手头这件事截止更早，先做完它。".into(),
            snooze_min: 20,
        };
    }

    if current.important {
        return Judgment {
            verdict: Verdict::FinishSlice,
            reason: "这件已经到了硬截止。手头是重要工作，先做到 15 分钟断点再切换。".into(),
            snooze_min: 15,
        };
    }

    Judgment {
        verdict: Verdict::Switch,
        reason: "这件必须现在处理，手头不是重要工作。".into(),
        snooze_min: 15,
    }
}

fn judge_today(current: Option<CurrentWork>) -> Judgment {
    if let Some(current) = current {
        if current.must_now || current.today_focus || current.important {
            return Judgment {
                verdict: Verdict::Continue,
                reason: "手头已经是今天要做的重要工作，这件先排到这段结束。".into(),
                snooze_min: current.remaining_min.unwrap_or(50).clamp(20, 90),
            };
        }
    }
    Judgment {
        verdict: Verdict::Switch,
        reason: "手头不是今日重点，建议换到这件。".into(),
        snooze_min: 20,
    }
}

fn judge_daily_grace(current: Option<CurrentWork>) -> Judgment {
    if let Some(current) = current {
        if current.important || current.must_now || current.today_focus {
            return Judgment {
                verdict: Verdict::Continue,
                reason: "日常义务过了宽限。手头是重要工作，先标成待补，下个断点再问。".into(),
                snooze_min: 25,
            };
        }
    }
    Judgment {
        verdict: Verdict::Switch,
        reason: "日常义务过了宽限，手头不是重要工作，建议先补上。".into(),
        snooze_min: 20,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(hour: u32, minute: u32) -> DateTime<Local> {
        Local.with_ymd_and_hms(2026, 11, 1, hour, minute, 0).unwrap()
    }

    fn important(remaining: Option<i64>, must_now: bool, focus: bool, due: Option<DateTime<Local>>) -> CurrentWork {
        CurrentWork {
            important: true,
            must_now,
            today_focus: focus,
            remaining_min: remaining,
            due_at: due,
        }
    }

    #[test]
    fn soft_daily_never_switches() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::DailySoft,
            incoming_due: None,
            current: None,
            already_on_it: false,
        });
        assert_eq!(judgment.verdict, Verdict::Continue);
    }

    #[test]
    fn short_remaining_finishes_the_slice() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::MustNow,
            incoming_due: Some(at(17, 40)),
            current: Some(important(Some(10), false, true, None)),
            already_on_it: false,
        });
        assert_eq!(judgment.verdict, Verdict::FinishSlice);
    }

    #[test]
    fn earlier_must_now_wins() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::MustNow,
            incoming_due: Some(at(16, 0)),
            current: Some(important(Some(40), true, true, Some(at(18, 0)))),
            already_on_it: false,
        });
        assert_eq!(judgment.verdict, Verdict::Switch);
    }

    #[test]
    fn later_must_now_waits() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::MustNow,
            incoming_due: Some(at(18, 0)),
            current: Some(important(Some(40), true, true, Some(at(16, 0)))),
            already_on_it: false,
        });
        assert_eq!(judgment.verdict, Verdict::Continue);
    }

    #[test]
    fn must_now_breaks_important_work_at_fifteen_minutes() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::MustNow,
            incoming_due: Some(at(17, 0)),
            current: Some(important(Some(50), false, true, None)),
            already_on_it: false,
        });
        assert_eq!(judgment.verdict, Verdict::FinishSlice);
        assert_eq!(judgment.snooze_min, 15);
    }

    #[test]
    fn must_now_switches_off_unimportant_work() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::MustNow,
            incoming_due: Some(at(17, 0)),
            current: Some(CurrentWork {
                important: false,
                must_now: false,
                today_focus: false,
                remaining_min: Some(40),
                due_at: None,
            }),
            already_on_it: false,
        });
        assert_eq!(judgment.verdict, Verdict::Switch);
    }

    #[test]
    fn today_item_waits_for_focus_work() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::Today,
            incoming_due: Some(at(18, 0)),
            current: Some(important(Some(50), false, true, None)),
            already_on_it: false,
        });
        assert_eq!(judgment.verdict, Verdict::Continue);
    }

    #[test]
    fn today_item_switches_from_a_chore() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::Today,
            incoming_due: None,
            current: None,
            already_on_it: false,
        });
        assert_eq!(judgment.verdict, Verdict::Switch);
    }

    #[test]
    fn grace_daily_does_not_cut_important_work() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::DailyGrace,
            incoming_due: None,
            current: Some(important(Some(50), false, false, None)),
            already_on_it: false,
        });
        assert_eq!(judgment.verdict, Verdict::Continue);
    }

    #[test]
    fn grace_daily_switches_from_a_chore() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::DailyGrace,
            incoming_due: None,
            current: None,
            already_on_it: false,
        });
        assert_eq!(judgment.verdict, Verdict::Switch);
    }

    #[test]
    fn staying_on_the_incoming_item_continues() {
        let judgment = judge(JudgeInput {
            class: InterruptClass::MustNow,
            incoming_due: Some(at(17, 0)),
            current: Some(important(Some(40), true, true, Some(at(17, 0)))),
            already_on_it: true,
        });
        assert_eq!(judgment.verdict, Verdict::Continue);
    }
}
