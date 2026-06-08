use super::*;
use crate::core::models::{CategoryInput, DbTask, MatchRules, TagInput};

#[test]
fn test_db_store_initialization() {
    let store = DbStore::new(":memory:").unwrap();
    let categories = store.get_categories().unwrap();
    assert_eq!(categories.len(), 7);
    assert_eq!(categories[0].name, "视频");
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
    };

    store.insert_task(&task).unwrap();

    let fetched = store.get_task("test_gid_12345678").unwrap().unwrap();
    assert_eq!(fetched.name, "test.mp4");
    assert_eq!(fetched.status, "Downloading");

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

    let all = store.get_all_tasks().unwrap();
    assert_eq!(all.len(), 1);

    store.delete_task("test_gid_12345678").unwrap();
    let fetched = store.get_task("test_gid_12345678").unwrap();
    assert!(fetched.is_none());
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

    let conn = store.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO tag_groups (name, icon, sort_order) VALUES ('Group1', 'icon1', 1)",
        [],
    )
    .unwrap();
    let group_id = conn.last_insert_rowid();
    drop(conn);

    let tag_id = store
        .insert_tag(&TagInput {
            category_id: Some(group_id),
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
    assert_eq!(tag.category_id, Some(group_id));

    store.delete_tag(tag_id).unwrap();
    let tags = store.get_tags().unwrap();
    assert!(!tags.iter().any(|t| t.id == tag_id));
}

#[test]
fn test_task_tag_relationships() {
    let store = DbStore::new(":memory:").unwrap();

    let task = DbTask {
        id: "task_1".to_string(),
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
