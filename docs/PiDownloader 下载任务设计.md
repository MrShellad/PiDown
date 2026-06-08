下面是一份适合 **PiDown 下载器** 的设计文档草案，定位为「下载记录 + 分类标签 + 自动规则引擎」。

# PiDown 下载记录系统设计

## 设计目标

PiDown 不仅负责下载文件，还负责对下载内容进行自动整理与归档。

系统应支持：

* 下载历史记录管理
* 状态管理
* 自动分类
* 标签管理
* 规则引擎
* 快速搜索与筛选
* 后续扩展智能整理能力

---

# 一、核心概念

## 下载任务（Task）

下载任务是系统中的核心实体。

每个任务表示一次完整的下载行为。

例如：

* Ubuntu.iso
* PonyXL.safetensors
* Minecraft-Modpack.zip
* 视频教程.mp4

所有历史记录均基于下载任务进行管理。

---

## 分类（Category）

分类用于描述资源的类型。

分类通常由系统自动识别。

示例：

* 视频
* 音频
* 图片
* 压缩包
* 程序
* 文档
* AI模型
* 其他

特点：

* 一个任务只能属于一个分类
* 支持自动分类
* 支持用户修改和添加分类

---

## 标签组（Tag Group）

标签组用于组织标签。

示例：

AI资源

* SD大模型
* LoRA
* VAE
* ControlNet

Minecraft

* 整合包
* Mod
* 资源包

视频网站

* YouTube
* Twitch
* Bilibili

特点：

* 用于组织标签
* 支持用户自定义

---

## 标签（Tag）

标签用于描述资源属性。

示例：

* PonyXL
* RealVisXL
* PiLauncher
* Civitai
* 收藏
* 工作
* 待整理

特点：

* 一个任务可拥有多个标签
* 标签支持自动添加
* 标签支持手动管理

---

# 二、数据模型

## 下载任务

Task

字段：

* id
* name
* url
* protocol
* save_path
* total_size
* completed_size
* status
* category_id
* created_at
* started_at
* completed_at

---

## 分类

Category

字段：

* id
* name
* icon
* sort_order

---

## 标签组

TagGroup

字段：

* id
* name
* icon
* sort_order

---

## 标签

Tag

字段：

* id
* group_id
* name
* color

---

## 任务标签关联

TaskTag

字段：

* task_id
* tag_id

---

# 三、状态系统

支持以下状态：

Pending

等待下载

Downloading

下载中

Paused

已暂停

Completed

已完成

Failed

失败

Cancelled

已取消

---

# 四、自动分类

系统自动识别文件类型。

规则示例：

mp4
mkv
avi

=> 视频

mp3
wav
flac

=> 音频

png
jpg
webp

=> 图片

zip
rar
7z

=> 压缩包

exe
msi

=> 程序

safetensors

=> AI模型

---

# 五、规则引擎

规则用于自动管理分类与标签。

规则结构：

IF 条件

THEN 执行动作

---

## 支持条件

来源域名

Host

文件名

Filename

扩展名

Extension

保存路径

SavePath

协议

Protocol

分类

Category

来源应用

Source

文件大小

FileSize

---

## 支持动作

设置分类

SetCategory

添加标签

AddTag

移除标签

RemoveTag

设置图标

SetIcon

设置颜色

SetColor

---

# 六、规则示例

## YouTube 视频

IF

Host = youtube.com

THEN

AddTag(YouTube)

SetCategory(视频)

---

## Twitch 视频

IF

Host = twitch.tv

THEN

AddTag(Twitch)

SetCategory(视频)

---

## Civitai 模型

IF

Host = civitai.com

THEN

AddTag(Civitai)

SetCategory(AI模型)

---

## SD大模型

IF

Extension = safetensors

AND

SavePath 包含 checkpoints

THEN

AddTag(SD大模型)

---

## LoRA

IF

Extension = safetensors

AND

SavePath 包含 Lora

THEN

AddTag(LoRA)

---

# 七、导航结构

全部

状态

* 下载中
* 已完成
* 已暂停
* 失败

分类

* 视频
* 音频
* 图片
* 压缩包
* 程序
* AI模型

标签

AI资源

* SD大模型
* LoRA
* VAE

视频网站

* YouTube
* Twitch
* Bilibili

项目

* PiLauncher
* 工作
* 收藏

---

# 八、搜索系统

支持：

关键词搜索

标签搜索

分类搜索

状态搜索

时间搜索

组合搜索

示例：

分类 = AI模型

标签 = LoRA

状态 = 已完成

时间 = 最近30天

---

# 九、未来扩展

支持自动整理目录

支持智能推荐标签

支持规则市场

支持云同步规则

支持导入导出规则

支持 AI 自动分类

支持资源库模式

支持收藏夹与归档系统

支持资源去重与版本管理

