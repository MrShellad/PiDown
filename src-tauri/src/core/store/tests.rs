use super::*;
use crate::core::categories::{CATEGORY_DOCUMENT, CATEGORY_VIDEO};
use crate::core::models::{CategoryInput, DbTask, MatchRules, TagInput};
use rusqlite::{params, Connection};
use std::path::PathBuf;
use uuid::Uuid;

fn path_text(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

fn index_exists(store: &DbStore, name: &str) -> bool {
    let conn = store.conn.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?1")
        .unwrap();
    stmt.exists(params![name]).unwrap()
}

#[test]
fn test_db_store_initialization() {
    let store = DbStore::new(":memory:").unwrap();
    let categories = store.get_categories().unwrap();
    assert_eq!(categories.len(), 8);
    assert_eq!(categories[0].name, "视频");
    assert!(categories
        .iter()
        .any(|category| category.name == CATEGORY_DOCUMENT));
}

#[test]
fn test_db_store_creates_query_indexes() {
    let store = DbStore::new(":memory:").unwrap();

    for index in [
        "idx_categories_sort_order",
        "idx_tag_groups_sort_order",
        "idx_tags_category_id",
        "idx_tasks_engine_id",
        "idx_tasks_created_at",
        "idx_tasks_status_created_at",
        "idx_tasks_category_created_at",
        "idx_task_tags_tag_id",
    ] {
        assert!(
            index_exists(&store, index),
            "missing database index: {index}"
        );
    }
}

#[test]
fn test_default_category_configs_fill_rules_and_paths() {
    let store = DbStore::new(":memory:").unwrap();
    let default_dir = PathBuf::from("D:\\Downloads");

    store
        .ensure_default_category_configs(&default_dir, None)
        .unwrap();

    let categories = store.get_categories().unwrap();
    let document = categories
        .iter()
        .find(|category| category.name == CATEGORY_DOCUMENT)
        .unwrap();
    let video = categories
        .iter()
        .find(|category| category.name == CATEGORY_VIDEO)
        .unwrap();

    assert!(document.rules.extensions.contains(&"pdf".to_string()));
    assert_eq!(
        document.save_path.as_deref(),
        Some(path_text(default_dir.join("Documents")).as_str())
    );
    assert!(video.rules.extensions.contains(&"mp4".to_string()));
    assert_eq!(
        video.save_path.as_deref(),
        Some(path_text(default_dir.join("Videos")).as_str())
    );
}

#[test]
fn test_default_category_configs_preserve_user_customizations_after_initial_fill() {
    let store = DbStore::new(":memory:").unwrap();
    let first_dir = PathBuf::from("D:\\Downloads");
    let next_dir = PathBuf::from("E:\\Downloads");

    store
        .ensure_default_category_configs(&first_dir, None)
        .unwrap();
    let video = store
        .get_categories()
        .unwrap()
        .into_iter()
        .find(|category| category.name == CATEGORY_VIDEO)
        .unwrap();

    store
        .update_category(
            video.id,
            &CategoryInput {
                name: video.name,
                icon: video.icon,
                color: video.color,
                sort_order: video.sort_order,
                rules: MatchRules::default(),
                save_path: Some("X:\\Custom\\Videos".to_string()),
            },
        )
        .unwrap();

    store
        .ensure_default_category_configs(&next_dir, Some(&first_dir))
        .unwrap();

    let video = store
        .get_categories()
        .unwrap()
        .into_iter()
        .find(|category| category.name == CATEGORY_VIDEO)
        .unwrap();
    assert!(video.rules.is_empty());
    assert_eq!(video.save_path.as_deref(), Some("X:\\Custom\\Videos"));
}

#[test]
fn test_default_category_configs_migrate_unchanged_default_paths() {
    let store = DbStore::new(":memory:").unwrap();
    let first_dir = PathBuf::from("D:\\Downloads");
    let next_dir = PathBuf::from("E:\\Downloads");

    store
        .ensure_default_category_configs(&first_dir, None)
        .unwrap();
    store
        .ensure_default_category_configs(&next_dir, Some(&first_dir))
        .unwrap();

    let document = store
        .get_categories()
        .unwrap()
        .into_iter()
        .find(|category| category.name == CATEGORY_DOCUMENT)
        .unwrap();
    assert_eq!(
        document.save_path.as_deref(),
        Some(path_text(next_dir.join("Documents")).as_str())
    );
}

#[test]
fn test_settings_crud() {
    let store = DbStore::new(":memory:").unwrap();
    store.set_setting("my_key", "my_value").unwrap();
    let val = store.get_setting("my_key").unwrap();
    assert_eq!(val, Some("my_value".to_string()));

    let val_missing = store.get_setting("non_existent").unwrap();
    assert_eq!(val_missing, None);
}

#[test]
fn test_task_crud() {
    let store = DbStore::new(":memory:").unwrap();

    let task = DbTask {
        id: "test_gid_12345678".to_string(),
        engine_id: Some("00000000-0000-0000-0000-000000000001".to_string()),
        name: "test.mp4".to_string(),
        url: "http://example.com/test.mp4".to_string(),
        protocol: "http".to_string(),
        save_path: "/downloads".to_string(),
        total_size: 1000,
        completed_size: 100,
        status: "Downloading".to_string(),
        category_id: None,
        created_at: 123456,
        started_at: Some(123456),
        completed_at: None,
        error_message: None,
    };

    store.insert_task(&task).unwrap();

    let fetched = store.get_task("test_gid_12345678").unwrap().unwrap();
    assert_eq!(fetched.name, "test.mp4");
    assert_eq!(fetched.status, "Downloading");
    assert_eq!(
        fetched.engine_id.as_deref(),
        Some("00000000-0000-0000-0000-000000000001")
    );

    let by_engine_id = store
        .get_task_by_engine_id("00000000-0000-0000-0000-000000000001")
        .unwrap()
        .unwrap();
    assert_eq!(by_engine_id.id, "test_gid_12345678");

    store
        .update_task_engine_id(
            "test_gid_12345678",
            Some("00000000-0000-0000-0000-000000000002"),
        )
        .unwrap();
    assert!(store
        .get_task_by_engine_id("00000000-0000-0000-0000-000000000001")
        .unwrap()
        .is_none());
    assert!(store
        .get_task_by_engine_id("00000000-0000-0000-0000-000000000002")
        .unwrap()
        .is_some());

    store
        .update_task_engine_id("test_gid_12345678", None)
        .unwrap();
    let fetched = store.get_task("test_gid_12345678").unwrap().unwrap();
    assert!(fetched.engine_id.is_none());

    store
        .update_task_progress("test_gid_12345678", 500, 1000)
        .unwrap();
    let fetched = store.get_task("test_gid_12345678").unwrap().unwrap();
    assert_eq!(fetched.completed_size, 500);

    store
        .update_task_status("test_gid_12345678", "Completed", Some(123457))
        .unwrap();
    let fetched = store.get_task("test_gid_12345678").unwrap().unwrap();
    assert_eq!(fetched.status, "Completed");
    assert_eq!(fetched.completed_at, Some(123457));

    store
        .update_task_status("test_gid_12345678", "Completed", None)
        .unwrap();
    let fetched = store.get_task("test_gid_12345678").unwrap().unwrap();
    assert_eq!(fetched.completed_at, Some(123457));

    let all = store.get_all_tasks().unwrap();
    assert_eq!(all.len(), 1);

    store.delete_task("test_gid_12345678").unwrap();
    let fetched = store.get_task("test_gid_12345678").unwrap();
    assert!(fetched.is_none());
}

#[test]
fn test_existing_task_table_migrates_engine_id() {
    let db_path = std::env::temp_dir().join(format!("pidown-test-{}.db", Uuid::new_v4()));

    {
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                protocol TEXT NOT NULL,
                save_path TEXT NOT NULL,
                total_size INTEGER NOT NULL DEFAULT 0,
                completed_size INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL CHECK (status IN ('Pending', 'Downloading', 'Paused', 'Completed', 'Failed', 'Cancelled')),
                category_id INTEGER,
                created_at INTEGER NOT NULL,
                started_at INTEGER,
                completed_at INTEGER
            );
            INSERT INTO tasks (
                id, name, url, protocol, save_path, total_size, completed_size, status, category_id, created_at, started_at, completed_at
            ) VALUES (
                'legacy_gid_123456', 'legacy.bin', 'http://example.com/legacy.bin', 'http', '/downloads', 0, 0, 'Paused', NULL, 123456, NULL, NULL
            );",
        )
        .unwrap();
    }

    let store = DbStore::new(&db_path).unwrap();
    let legacy_task = store.get_task("legacy_gid_123456").unwrap().unwrap();
    assert!(legacy_task.engine_id.is_none());

    store
        .update_task_engine_id(
            "legacy_gid_123456",
            Some("00000000-0000-0000-0000-000000000003"),
        )
        .unwrap();
    let migrated = store
        .get_task_by_engine_id("00000000-0000-0000-0000-000000000003")
        .unwrap()
        .unwrap();
    assert_eq!(migrated.id, "legacy_gid_123456");

    drop(store);
    let _ = std::fs::remove_file(&db_path);
}

#[test]
fn test_delete_completed_tasks() {
    let store = DbStore::new(":memory:").unwrap();

    for (id, status) in [("task_done", "Completed"), ("task_active", "Downloading")] {
        store
            .insert_task(&DbTask {
                id: id.to_string(),
                engine_id: None,
                name: format!("{id}.bin"),
                url: format!("http://example.com/{id}.bin"),
                protocol: "http".to_string(),
                save_path: "/downloads".to_string(),
                total_size: 1000,
                completed_size: if status == "Completed" { 1000 } else { 100 },
                status: status.to_string(),
                category_id: None,
                created_at: 123456,
                started_at: Some(123456),
                completed_at: None,
                error_message: None,
            })
            .unwrap();
    }

    let deleted = store.delete_completed_tasks().unwrap();
    assert_eq!(deleted, 1);
    assert!(store.get_task("task_done").unwrap().is_none());
    assert!(store.get_task("task_active").unwrap().is_some());
}

#[test]
fn test_category_crud() {
    let store = DbStore::new(":memory:").unwrap();
    let cat_id = store
        .insert_category(&CategoryInput {
            name: "CustomCat".to_string(),
            icon: Some("custom-icon".to_string()),
            color: Some("#8c8c8c".to_string()),
            sort_order: 10,
            rules: MatchRules::default(),
            save_path: None,
        })
        .unwrap();

    let categories = store.get_categories().unwrap();
    assert!(categories.iter().any(|c| c.name == "CustomCat"));

    store.delete_category(cat_id).unwrap();
    let categories = store.get_categories().unwrap();
    assert!(!categories.iter().any(|c| c.name == "CustomCat"));
}

#[test]
fn test_tag_crud() {
    let store = DbStore::new(":memory:").unwrap();
    let category_id = store.get_categories().unwrap()[0].id;

    let tag_id = store
        .insert_tag(&TagInput {
            category_id: Some(category_id),
            name: "Tag1".to_string(),
            icon: Some("tag".to_string()),
            color: Some("blue".to_string()),
            rules: MatchRules::default(),
            save_path: None,
        })
        .unwrap();
    let tags = store.get_tags().unwrap();
    let tag = tags.iter().find(|t| t.id == tag_id).unwrap();
    assert_eq!(tag.name, "Tag1");
    assert_eq!(tag.category_id, Some(category_id));

    store.delete_tag(tag_id).unwrap();
    let tags = store.get_tags().unwrap();
    assert!(!tags.iter().any(|t| t.id == tag_id));
}

#[test]
fn test_task_tag_relationships() {
    let store = DbStore::new(":memory:").unwrap();

    let task = DbTask {
        id: "task_1".to_string(),
        engine_id: None,
        name: "test.mp4".to_string(),
        url: "http://example.com/test.mp4".to_string(),
        protocol: "http".to_string(),
        save_path: "/downloads".to_string(),
        total_size: 1000,
        completed_size: 100,
        status: "Downloading".to_string(),
        category_id: None,
        created_at: 123456,
        started_at: Some(123456),
        completed_at: None,
        error_message: None,
    };
    store.insert_task(&task).unwrap();

    let tag_id = store
        .insert_tag(&TagInput {
            category_id: None,
            name: "Tag1".to_string(),
            icon: None,
            color: Some("blue".to_string()),
            rules: MatchRules::default(),
            save_path: None,
        })
        .unwrap();
    store.add_task_tag("task_1", tag_id).unwrap();

    let task_tags = store.get_task_tags("task_1").unwrap();
    assert_eq!(task_tags.len(), 1);
    assert_eq!(task_tags[0].name, "Tag1");

    let mappings = store.get_all_task_tags_mappings().unwrap();
    assert_eq!(mappings.len(), 1);
    assert_eq!(mappings[0], ("task_1".to_string(), tag_id));

    store.remove_task_tag("task_1", tag_id).unwrap();
    let task_tags = store.get_task_tags("task_1").unwrap();
    assert_eq!(task_tags.len(), 0);
}

#[test]
fn test_foreign_keys_cleanup_task_tags() {
    let store = DbStore::new(":memory:").unwrap();

    store
        .insert_task(&DbTask {
            id: "task_1".to_string(),
            engine_id: None,
            name: "test.mp4".to_string(),
            url: "http://example.com/test.mp4".to_string(),
            protocol: "http".to_string(),
            save_path: "/downloads".to_string(),
            total_size: 1000,
            completed_size: 100,
            status: "Downloading".to_string(),
            category_id: None,
            created_at: 123456,
            started_at: Some(123456),
            completed_at: None,
            error_message: None,
        })
        .unwrap();

    let tag_id = store
        .insert_tag(&TagInput {
            category_id: None,
            name: "TagCleanup".to_string(),
            icon: None,
            color: None,
            rules: MatchRules::default(),
            save_path: None,
        })
        .unwrap();
    store.add_task_tag("task_1", tag_id).unwrap();

    store.delete_tag(tag_id).unwrap();
    assert!(store.get_task_tags("task_1").unwrap().is_empty());

    let tag_id = store
        .insert_tag(&TagInput {
            category_id: None,
            name: "TagCleanupByTask".to_string(),
            icon: None,
            color: None,
            rules: MatchRules::default(),
            save_path: None,
        })
        .unwrap();
    store.add_task_tag("task_1", tag_id).unwrap();
    store.delete_task("task_1").unwrap();
    assert!(store.get_all_task_tags_mappings().unwrap().is_empty());
}
