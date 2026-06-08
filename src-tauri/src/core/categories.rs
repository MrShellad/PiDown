use crate::core::models::{DbCategory, DbTag, MatchRules};

pub const CATEGORY_VIDEO: &str = "视频";
pub const CATEGORY_AUDIO: &str = "音频";
pub const CATEGORY_IMAGE: &str = "图片";
pub const CATEGORY_ARCHIVE: &str = "压缩包";
pub const CATEGORY_PROGRAM: &str = "程序";
pub const CATEGORY_AI_MODEL: &str = "AI模型";
pub const CATEGORY_OTHER: &str = "其他";

const DEFAULT_CATEGORIES: [(&str, &str, i32); 7] = [
    (CATEGORY_VIDEO, "film", 1),
    (CATEGORY_AUDIO, "music", 2),
    (CATEGORY_IMAGE, "image", 3),
    (CATEGORY_ARCHIVE, "archive", 4),
    (CATEGORY_PROGRAM, "cpu", 5),
    (CATEGORY_AI_MODEL, "box", 6),
    (CATEGORY_OTHER, "file", 7),
];

pub fn default_categories() -> &'static [(&'static str, &'static str, i32)] {
    &DEFAULT_CATEGORIES
}

pub fn infer_category_name(filename: &str) -> &'static str {
    let name_lower = filename.to_lowercase();

    if name_lower.ends_with(".mp4")
        || name_lower.ends_with(".mkv")
        || name_lower.ends_with(".avi")
        || name_lower.ends_with(".mov")
        || name_lower.ends_with(".flv")
        || name_lower.ends_with(".wmv")
        || name_lower.ends_with(".webm")
    {
        CATEGORY_VIDEO
    } else if name_lower.ends_with(".mp3")
        || name_lower.ends_with(".wav")
        || name_lower.ends_with(".flac")
        || name_lower.ends_with(".ogg")
        || name_lower.ends_with(".m4a")
        || name_lower.ends_with(".wma")
    {
        CATEGORY_AUDIO
    } else if name_lower.ends_with(".jpg")
        || name_lower.ends_with(".jpeg")
        || name_lower.ends_with(".png")
        || name_lower.ends_with(".gif")
        || name_lower.ends_with(".bmp")
        || name_lower.ends_with(".webp")
        || name_lower.ends_with(".svg")
    {
        CATEGORY_IMAGE
    } else if name_lower.ends_with(".zip")
        || name_lower.ends_with(".rar")
        || name_lower.ends_with(".7z")
        || name_lower.ends_with(".tar")
        || name_lower.ends_with(".gz")
        || name_lower.ends_with(".tgz")
    {
        CATEGORY_ARCHIVE
    } else if name_lower.ends_with(".exe")
        || name_lower.ends_with(".msi")
        || name_lower.ends_with(".dmg")
        || name_lower.ends_with(".pkg")
        || name_lower.ends_with(".sh")
        || name_lower.ends_with(".bat")
        || name_lower.ends_with(".app")
    {
        CATEGORY_PROGRAM
    } else if name_lower.ends_with(".safetensors") {
        CATEGORY_AI_MODEL
    } else {
        CATEGORY_OTHER
    }
}

pub fn match_rules(rules: &MatchRules, url: &str, filename: &str, size_bytes: Option<u64>) -> bool {
    if rules.is_empty() {
        return false;
    }

    let url_lower = url.to_lowercase();
    let filename_lower = filename.to_lowercase();

    if !rules.domains.is_empty()
        && !rules
            .domains
            .iter()
            .filter(|value| !value.trim().is_empty())
            .any(|domain| url_lower.contains(&domain.trim().to_lowercase()))
    {
        return false;
    }

    if !rules.extensions.is_empty()
        && !rules
            .extensions
            .iter()
            .filter(|value| !value.trim().is_empty())
            .any(|extension| {
                let normalized = extension.trim().trim_start_matches('.').to_lowercase();
                filename_lower.ends_with(&format!(".{normalized}"))
            })
    {
        return false;
    }

    if !rules.name_keywords.is_empty()
        && !rules
            .name_keywords
            .iter()
            .filter(|value| !value.trim().is_empty())
            .any(|keyword| filename_lower.contains(&keyword.trim().to_lowercase()))
    {
        return false;
    }

    if let Some(min_size) = rules.min_size_bytes {
        if size_bytes.unwrap_or(0) < min_size {
            return false;
        }
    }

    if let Some(max_size) = rules.max_size_bytes {
        if size_bytes.unwrap_or(u64::MAX) > max_size {
            return false;
        }
    }

    true
}

pub fn infer_category<'a>(
    categories: &'a [DbCategory],
    url: &str,
    filename: &str,
    size_bytes: Option<u64>,
) -> Option<&'a DbCategory> {
    categories
        .iter()
        .find(|category| match_rules(&category.rules, url, filename, size_bytes))
        .or_else(|| {
            let fallback_name = infer_category_name(filename);
            categories
                .iter()
                .find(|category| category.name == fallback_name)
        })
}

pub fn infer_tags<'a>(
    tags: &'a [DbTag],
    category_id: Option<i64>,
    url: &str,
    filename: &str,
    size_bytes: Option<u64>,
) -> Vec<&'a DbTag> {
    tags.iter()
        .filter(|tag| tag.category_id.is_none() || tag.category_id == category_id)
        .filter(|tag| match_rules(&tag.rules, url, filename, size_bytes))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{infer_category_name, CATEGORY_ARCHIVE, CATEGORY_OTHER, CATEGORY_VIDEO};

    #[test]
    fn infers_known_category_by_extension() {
        assert_eq!(infer_category_name("movie.mp4"), CATEGORY_VIDEO);
        assert_eq!(infer_category_name("bundle.zip"), CATEGORY_ARCHIVE);
    }

    #[test]
    fn falls_back_to_other_for_unknown_extensions() {
        assert_eq!(infer_category_name("notes.unknown"), CATEGORY_OTHER);
    }
}
