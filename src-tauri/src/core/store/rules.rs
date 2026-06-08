use crate::core::models::MatchRules;

pub(crate) fn encode_rules(rules: &MatchRules) -> String {
    serde_json::to_string(rules).unwrap_or_else(|_| "{}".to_string())
}

pub(crate) fn decode_rules(raw: Option<String>) -> MatchRules {
    raw.and_then(|value| serde_json::from_str::<MatchRules>(&value).ok())
        .unwrap_or_default()
}
