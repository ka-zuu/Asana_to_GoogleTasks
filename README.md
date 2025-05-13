# Asana to Google Tasks 同期ツール

このGoogle Apps Scriptは、Asanaの「今日」セクションのタスクをGoogle Tasksに自動的に同期するツールです。

## 機能

- Asanaの「今日」セクションの未完了タスクを取得
- 取得したタスクをGoogle Tasksに自動登録
- タスクの期日を日本時間の午前9時に設定
- Asanaの期日情報をタスクタイトルに追記
- タスクの詳細情報（メモ、Asanaリンク）を保持

## 前提条件

- Googleアカウント
- Asanaアカウント
- Asanaのパーソナルアクセストークン
- AsanaのワークスペースGID

## セットアップ方法

1. Google Apps Scriptプロジェクトを新規作成
2. このスクリプトをコピー＆ペースト
3. スクリプトプロパティに以下の値を設定：
   - `ASANA_ACCESS_TOKEN`: Asanaのパーソナルアクセストークン
   - `ASANA_WORKSPACE_GID`: AsanaのワークスペースGID
   - `GOOGLE_TASK_LIST_ID`: （オプション）Google TasksのリストID

## 使用方法

1. スクリプトエディタで`syncAsanaTodayToGoogleTasks`関数を実行
2. または、トリガーを設定して自動実行することも可能

## 注意事項

- Asanaの「今日」セクションが存在する必要があります
- Google Tasksに少なくとも1つのタスクリストが必要です
- API制限を考慮して、タスク作成時に500ミリ秒の待機時間を設定しています

## トラブルシューティング

エラーが発生した場合は、以下の点を確認してください：

1. スクリプトプロパティが正しく設定されているか
2. Asanaのアクセストークンが有効か
3. ワークスペースGIDが正しいか
4. Google Tasksにタスクリストが存在するか

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。