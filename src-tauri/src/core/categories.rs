use crate::core::models::{CategoryInput, DbCategory, DbTag, MatchRules};
use std::path::Path;

pub const CATEGORY_VIDEO: &str = "视频";
pub const CATEGORY_AUDIO: &str = "音频";
pub const CATEGORY_IMAGE: &str = "图片";
pub const CATEGORY_DOCUMENT: &str = "文档";
pub const CATEGORY_ARCHIVE: &str = "压缩包";
pub const CATEGORY_PROGRAM: &str = "程序";
pub const CATEGORY_AI_MODEL: &str = "AI模型";
pub const CATEGORY_OTHER: &str = "其他";

const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "flv", "wmv", "webm", "m4v", "ts",
];
const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "flac", "ogg", "m4a", "wma", "aac", "opus"];
const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "avif", "heic",
];
const DOCUMENT_EXTENSIONS: &[&str] = &[
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "rtf", "epub",
];
const ARCHIVE_EXTENSIONS: &[&str] = &["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "iso"];
const PROGRAM_EXTENSIONS: &[&str] = &[
    "exe", "msi", "dmg", "pkg", "sh", "bat", "app", "deb", "rpm", "apk",
];
const AI_MODEL_EXTENSIONS: &[&str] = &["safetensors", "ckpt", "pt", "pth", "onnx", "gguf"];

#[derive(Debug, Clone, Copy)]
pub struct DefaultCategory {
    pub name: &'static str,
    pub icon: &'static str,
    pub sort_order: i32,
    pub directory: &'static str,
    pub extensions: &'static [&'static str],
}

impl DefaultCategory {
    pub fn rules(&self) -> MatchRules {
        MatchRules {
            extensions: self
                .extensions
                .iter()
                .map(|extension| (*extension).to_string())
                .collect(),
            ..MatchRules::default()
        }
    }

    pub fn save_path(&self, default_save_dir: &Path) -> String {
        default_save_dir
            .join(self.directory)
            .to_string_lossy()
            .to_string()
    }

    pub fn input(&self, default_save_dir: &Path) -> CategoryInput {
        CategoryInput {
            name: self.name.to_string(),
            icon: Some(self.icon.to_string()),
            color: None,
            sort_order: self.sort_order,
            rules: self.rules(),
            save_path: Some(self.save_path(default_save_dir)),
        }
    }
}

const DEFAULT_CATEGORIES: [DefaultCategory; 8] = [
    DefaultCategory {
        name: CATEGORY_VIDEO,
        icon: "film",
        sort_order: 1,
        directory: "Videos",
        extensions: VIDEO_EXTENSIONS,
    },
    DefaultCategory {
        name: CATEGORY_AUDIO,
        icon: "music",
        sort_order: 2,
        directory: "Audio",
        extensions: AUDIO_EXTENSIONS,
    },
    DefaultCategory {
        name: CATEGORY_IMAGE,
        icon: "image",
        sort_order: 3,
        directory: "Images",
        extensions: IMAGE_EXTENSIONS,
    },
    DefaultCategory {
        name: CATEGORY_DOCUMENT,
        icon: "file-text",
        sort_order: 4,
        directory: "Documents",
        extensions: DOCUMENT_EXTENSIONS,
    },
    DefaultCategory {
        name: CATEGORY_ARCHIVE,
        icon: "archive",
        sort_order: 5,
        directory: "Archives",
        extensions: ARCHIVE_EXTENSIONS,
    },
    DefaultCategory {
        name: CATEGORY_PROGRAM,
        icon: "cpu",
        sort_order: 6,
        directory: "Programs",
        extensions: PROGRAM_EXTENSIONS,
    },
    DefaultCategory {
        name: CATEGORY_AI_MODEL,
        icon: "box",
        sort_order: 7,
        directory: "AI-Models",
        extensions: AI_MODEL_EXTENSIONS,
    },
    DefaultCategory {
        name: CATEGORY_OTHER,
        icon: "file",
        sort_order: 8,
        directory: "Others",
        extensions: &[],
    },
];

pub fn default_categories() -> &'static [DefaultCategory] {
    &DEFAULT_CATEGORIES
}

fn has_known_extension(filename_lower: &str, extensions: &[&str]) -> bool {
    extensions
        .iter()
        .any(|extension| filename_lower.ends_with(&format!(".{extension}")))
}

pub fn infer_category_name(filename: &str) -> &'static str {
    let name_lower = filename.to_lowercase();

    if has_known_extension(&name_lower, VIDEO_EXTENSIONS) {
        CATEGORY_VIDEO
    } else if has_known_extension(&name_lower, AUDIO_EXTENSIONS) {
        CATEGORY_AUDIO
    } else if has_known_extension(&name_lower, IMAGE_EXTENSIONS) {
        CATEGORY_IMAGE
    } else if has_known_extension(&name_lower, DOCUMENT_EXTENSIONS) {
        CATEGORY_DOCUMENT
    } else if has_known_extension(&name_lower, ARCHIVE_EXTENSIONS) {
        CATEGORY_ARCHIVE
    } else if has_known_extension(&name_lower, PROGRAM_EXTENSIONS) {
        CATEGORY_PROGRAM
    } else if has_known_extension(&name_lower, AI_MODEL_EXTENSIONS) {
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

    let size = size_bytes.unwrap_or(0);
    if size > 0 {
        if let Some(min_size) = rules.min_size_bytes {
            if size < min_size {
                return false;
            }
        }

        if let Some(max_size) = rules.max_size_bytes {
            if size > max_size {
                return false;
            }
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
    use super::{
        default_categories, infer_category_name, CATEGORY_ARCHIVE, CATEGORY_DOCUMENT,
        CATEGORY_OTHER, CATEGORY_VIDEO,
    };

    #[test]
    fn infers_known_category_by_extension() {
        assert_eq!(infer_category_name("movie.mp4"), CATEGORY_VIDEO);
        assert_eq!(infer_category_name("bundle.zip"), CATEGORY_ARCHIVE);
        assert_eq!(infer_category_name("report.pdf"), CATEGORY_DOCUMENT);
    }

    #[test]
    fn falls_back_to_other_for_unknown_extensions() {
        assert_eq!(infer_category_name("notes.unknown"), CATEGORY_OTHER);
    }

    #[test]
    fn default_categories_include_rules_and_directories() {
        let document = default_categories()
            .iter()
            .find(|category| category.name == CATEGORY_DOCUMENT)
            .unwrap();

        assert_eq!(document.directory, "Documents");
        assert!(document.extensions.contains(&"pdf"));
    }

    #[test]
    fn match_rules_ignores_size_limits_when_size_is_zero_or_none() {
        use super::{match_rules, MatchRules};

        let rules = MatchRules {
            domains: vec![],
            extensions: vec!["zip".to_string()],
            name_keywords: vec![],
            min_size_bytes: Some(1024),
            max_size_bytes: Some(2048),
        };

        // File size is 0: limits ignored, should match (true)
        assert!(match_rules(&rules, "http://example.com/file.zip", "file.zip", Some(0)));

        // File size is None (unknown): limits ignored, should match (true)
        assert!(match_rules(&rules, "http://example.com/file.zip", "file.zip", None));

        // File size is within limits: should match (true)
        assert!(match_rules(&rules, "http://example.com/file.zip", "file.zip", Some(1500)));

        // File size is too small: should not match (false)
        assert!(!match_rules(&rules, "http://example.com/file.zip", "file.zip", Some(500)));

        // File size is too large: should not match (false)
        assert!(!match_rules(&rules, "http://example.com/file.zip", "file.zip", Some(3000)));
    }
}
