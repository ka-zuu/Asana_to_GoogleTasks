/**
 * @OnlyCurrentDoc
 *
 * Asanaの「今日」という名前のセクションのタスクをGoogle Tasksに同期するスクリプト
 * Googleタスクの期日は本日9時JSTに設定し、Asanaの期日はタイトルに追記します。
 */

// スクリプトプロパティから読み込む設定値
var ASANA_ACCESS_TOKEN;
var ASANA_WORKSPACE_GID;
var GOOGLE_TASK_LIST_ID; // 省略可能なタスクリストID
const ASANA_TODAY_SECTION_NAME = "今日"; // 検索するセクション名

// Asana APIのベースURL
const ASANA_API_BASE_URL = "https://app.asana.com/api/1.0";

/**
 * メイン関数：この関数を実行すると同期処理が開始されます。
 * トリガーに設定することも可能です。
 */
function syncAsanaTodayToGoogleTasks() {
  try {
    loadScriptProperties_();

    if (!ASANA_ACCESS_TOKEN || !ASANA_WORKSPACE_GID) {
      console.error("必要なスクリプトプロパティ (ASANA_ACCESS_TOKEN, ASANA_WORKSPACE_GID) が設定されていません。");
      Logger.log("設定エラー: 必要なスクリプトプロパティ (ASANA_ACCESS_TOKEN, ASANA_WORKSPACE_GID) が設定されていません。スクリプトエディタのプロジェクトの設定を確認してください。");
      return;
    }

    console.log("Asanaの「マイタスク」リストGIDを取得開始...");
    const userTaskListGid = getMyUserTaskListGid_();
    if (!userTaskListGid) {
      console.error("ユーザーの「マイタスク」リストGIDの取得に失敗しました。");
      Logger.log("エラー: ユーザーの「マイタスク」リストGIDの取得に失敗しました。");
      return;
    }
    console.log(`ユーザーの「マイタスク」リストGID: ${userTaskListGid}`);

    console.log(`「マイタスク」内のセクション「${ASANA_TODAY_SECTION_NAME}」からタスクを取得開始...`);
    const asanaTodayTasks = getTasksFromNamedSection_(userTaskListGid, ASANA_TODAY_SECTION_NAME);

    if (!asanaTodayTasks) { // getTasksFromNamedSection_ が null (エラー時) または undefined を返す場合
        console.error(`セクション「${ASANA_TODAY_SECTION_NAME}」からのタスク取得中にエラーが発生しました。`);
        Logger.log(`エラー: セクション「${ASANA_TODAY_SECTION_NAME}」からのタスク取得中にエラーが発生しました。詳細はログを確認してください。`);
        return;
    }

    if (asanaTodayTasks.length === 0) {
      console.log(`Asanaのセクション「${ASANA_TODAY_SECTION_NAME}」に該当するタスクはありませんでした。`);
      Logger.log(`情報: Asanaのセクション「${ASANA_TODAY_SECTION_NAME}」に該当するタスクはありませんでした。`);
      return;
    }
    console.log(`${asanaTodayTasks.length}件のタスクが見つかりました。`);

    console.log("Google Tasksへの登録を開始...");
    addTasksToGoogleTasks_(asanaTodayTasks);
    console.log("Google Tasksへの登録が完了しました。");
    Logger.log(`成功: ${asanaTodayTasks.length}件のタスクをGoogle Tasksに登録しました。`);

  } catch (e) {
    console.error(`エラーが発生しました: ${e.toString()}\nスタックトレース: ${e.stack}`);
    Logger.log(`エラー: 処理中にエラーが発生しました: ${e.message}. スタックトレース: ${e.stack}`);
  }
}

/**
 * スクリプトプロパティを読み込み、グローバル変数に設定します。
 */
function loadScriptProperties_() {
  const scriptProperties = PropertiesService.getScriptProperties();
  ASANA_ACCESS_TOKEN = scriptProperties.getProperty("ASANA_ACCESS_TOKEN");
  ASANA_WORKSPACE_GID = scriptProperties.getProperty("ASANA_WORKSPACE_GID");
  GOOGLE_TASK_LIST_ID = scriptProperties.getProperty("GOOGLE_TASK_LIST_ID");
  console.log(`ASANA_WORKSPACE_GID: ${ASANA_WORKSPACE_GID}`);
  console.log(`GOOGLE_TASK_LIST_ID: ${GOOGLE_TASK_LIST_ID || '(デフォルト)'}`);
}

/**
 * Asana APIにリクエストを送信し、レスポンスを取得する共通関数。
 * @param {string} endpoint APIエンドポイント (例: "/users/me")
 * @param {string} method HTTPメソッド (例: "GET")
 * @param {object} [payload] POSTリクエストの場合のペイロード
 * @return {object|null} APIレスポンスのJSONオブジェクト(dataプロパティ)、またはエラー時にnull
 */
function callAsanaApi_(endpoint, method, payload) {
  const options = {
    method: method,
    headers: {
      "Authorization": `Bearer ${ASANA_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    muteHttpExceptions: true
  };

  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  const url = ASANA_API_BASE_URL + endpoint;
  console.log(`Asana API呼び出し: ${method} ${url}`);
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (responseCode >= 200 && responseCode < 300) {
    try {
      const parsedResponse = JSON.parse(responseBody);
      return parsedResponse.data !== undefined ? parsedResponse.data : parsedResponse;
    } catch (e) {
      console.error(`Asana APIレスポンスのJSONパースに失敗: ${e.toString()}, Response: ${responseBody}`);
      Logger.log(`Asana APIレスポンスのJSONパースに失敗: ${e.toString()}, Response: ${responseBody}`);
      return null;
    }
  } else {
    console.error(`Asana APIリクエスト失敗: ${responseCode} - ${responseBody}`);
    console.error(`URL: ${method} ${url}`);
    console.error(`Options: ${JSON.stringify(options, null, 2)}`);
    Logger.log(`Asana APIリクエスト失敗: ${responseCode} - ${responseBody}. URL: ${method} ${url}`);
    return null;
  }
}

/**
 * ログインユーザーの指定されたワークスペースにおけるユーザータスクリストGIDを取得します。
 * @return {string|null} ユーザータスクリストのGID、またはエラー時にnull
 */
function getMyUserTaskListGid_() {
  const endpoint = `/users/me/user_task_list?workspace=${ASANA_WORKSPACE_GID}&opt_fields=gid`;
  const data = callAsanaApi_(endpoint, "GET");
  if (data && data.gid) {
    console.log(`ユーザータスクリストGID取得成功: ${data.gid}`);
    return data.gid;
  }
  console.error("ユーザータスクリストGIDの取得に失敗しました。レスポンス: ", data);
  Logger.log("ユーザータスクリストGIDの取得に失敗しました。レスポンス: " + JSON.stringify(data));
  return null;
}

/**
 * 指定されたプロジェクト内で、指定された名前のセクションのGIDを取得します。
 * @param {string} projectGid セクションを検索するプロジェクトのGID
 * @param {string} sectionName 検索するセクションの名前
 * @return {string|null} 見つかったセクションのGID、または見つからない/エラー時にnull
 */
function getSectionGidByName_(projectGid, sectionName) {
  console.log(`プロジェクトGID「${projectGid}」内でセクション名「${sectionName}」を検索中...`);
  const endpoint = `/projects/${projectGid}/sections?opt_fields=name,gid`;
  const sections = callAsanaApi_(endpoint, "GET");

  if (sections && Array.isArray(sections)) {
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].name === sectionName) {
        console.log(`セクション「${sectionName}」が見つかりました。GID: ${sections[i].gid}`);
        return sections[i].gid;
      }
    }
    console.log(`プロジェクトGID「${projectGid}」内にセクション名「${sectionName}」は見つかりませんでした。`);
    Logger.log(`情報: プロジェクトGID「${projectGid}」内にセクション名「${sectionName}」は見つかりませんでした。`);
    return null;
  }
  console.error(`プロジェクトGID「${projectGid}」のセクション取得に失敗しました。レスポンス: `, sections);
  Logger.log(`エラー: プロジェクトGID「${projectGid}」のセクション取得に失敗しました。レスポンス: ` + JSON.stringify(sections));
  return null;
}

/**
 * 指定されたユーザータスクリスト内の、指定された名前のセクションから未完了タスクを取得します。
 * @param {string} userTaskListGid ユーザータスクリストのGID
 * @param {string} sectionName 取得対象のセクション名
 * @return {Array<object>|null} タスクオブジェクトの配列。セクションが見つからない場合は空配列、エラー時はnull。
 */
function getTasksFromNamedSection_(userTaskListGid, sectionName) {
  const sectionGid = getSectionGidByName_(userTaskListGid, sectionName);

  if (!sectionGid) {
    console.log(`セクション「${sectionName}」のGIDが取得できなかったため、タスクを取得できません。`);
    return []; // セクションが見つからない場合は空の配列を返す
  }

  console.log(`セクションGID「${sectionGid}」(名前: ${sectionName}) からタスクを取得します。`);
  const taskOptFields = "name,notes,due_on,due_at,permalink_url,gid,completed";
  const endpoint = `/sections/${sectionGid}/tasks?completed=false&opt_fields=${taskOptFields}`;
  const tasksData = callAsanaApi_(endpoint, "GET");

  if (tasksData && Array.isArray(tasksData)) {
    console.log(`セクション「${sectionName}」から ${tasksData.length} 件の未完了タスクを取得しました。`);
    return tasksData;
  }
  console.error(`セクションGID「${sectionGid}」からのタスク取得に失敗しました。レスポンス: `, tasksData);
  Logger.log(`エラー: セクションGID「${sectionGid}」からのタスク取得に失敗しました。レスポンス: ` + JSON.stringify(tasksData));
  return null;
}

/**
 * Asanaの期日情報 (due_on または due_at) をタイトル表示用の文字列 [M/D期限] に変換します。
 * @param {string|null} dueOn YYYY-MM-DD 形式の日付文字列
 * @param {string|null} dueAt ISO8601形式の日時文字列
 * @return {string} フォーマットされた期日文字列、または期日がない場合は空文字列
 */
function formatAsanaDueDateForTitle_(dueOn, dueAt) {
  let dateStrToParse = null;
  if (dueAt) { // due_at (日時指定) があればそれを優先
    dateStrToParse = dueAt;
  } else if (dueOn) { // due_on (日付のみ指定)
    dateStrToParse = dueOn;
  }

  if (dateStrToParse) {
    try {
      let dateObj;
      // YYYY-MM-DD形式の日付文字列の場合、UTCとして解釈するためにT00:00:00Zを付加
      if (dateStrToParse.length === 10 && dateStrToParse.match(/^\d{4}-\d{2}-\d{2}$/)) {
        dateObj = new Date(dateStrToParse + "T00:00:00Z");
      } else {
        dateObj = new Date(dateStrToParse); // ISO8601形式のフル日時文字列と仮定
      }

      const month = dateObj.getUTCMonth() + 1; // getUTCMonthは0から始まるため+1
      const day = dateObj.getUTCDate();
      return `[${month}/${day}期限]`;
    } catch (e) {
      console.warn(`Asana期日のタイトル用フォーマットに失敗: ${dateStrToParse}. Error: ${e.toString()}`);
      Logger.log(`Asana期日のタイトル用フォーマットに失敗: ${dateStrToParse}. Error: ${e.toString()}`);
      return ""; // パース失敗時は空文字
    }
  }
  return ""; // 期日情報なし
}

/**
 * Google Tasksにタスクを追加します。
 * @param {Array<object>} asanaTasks Asanaタスクオブジェクトの配列
 */
function addTasksToGoogleTasks_(asanaTasks) {
  let taskListIdToUse = GOOGLE_TASK_LIST_ID;

  // Googleタスクの期日を「本日 午前9時 JST」に設定
  const now = new Date();
  const todayJSTStr = Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd");
  const nineAmJSTStr = todayJSTStr + "T09:00:00+09:00"; // 日本時間の午前9時
  const nineAmJSTDate = new Date(nineAmJSTStr);
  // Google Tasks APIはUTCを期待するため、UTCに変換
  const googleTaskDueDate = Utilities.formatDate(nineAmJSTDate, "UTC", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  console.log(`Googleタスクの期日を ${googleTaskDueDate} (UTC) に設定します。`);


  if (!taskListIdToUse) {
    try {
      const taskLists = Tasks.Tasklists.list({ maxResults: 1 });
      if (taskLists.items && taskLists.items.length > 0) {
        taskListIdToUse = taskLists.items[0].id;
        console.log(`デフォルトのGoogleタスクリストIDを使用します: ${taskListIdToUse} (${taskLists.items[0].title})`);
      } else {
        console.error("Googleタスクリストが見つかりません。Google Tasksに少なくとも1つのリストを作成してください。");
        Logger.log("エラー: Googleタスクリストが見つかりません。Google Tasksに少なくとも1つのリストを作成してください。");
        return;
      }
    } catch (e) {
      console.error(`Googleタスクリストの取得に失敗しました: ${e.toString()}`);
      Logger.log(`エラー: Googleタスクリストの取得に失敗しました: ${e.message}`);
      return;
    }
  }

  asanaTasks.forEach(asanaTask => {
    let taskTitle = asanaTask.name || '名称未設定タスク';
    const asanaDueDateSuffix = formatAsanaDueDateForTitle_(asanaTask.due_on, asanaTask.due_at);
    if (asanaDueDateSuffix) {
      taskTitle += ` ${asanaDueDateSuffix}`;
    }

    const googleTask = {
      title: taskTitle,
      notes: `Asanaタスク詳細:\n${asanaTask.notes || ''}\n\nAsanaリンク: ${asanaTask.permalink_url || 'N/A'}\nAsanaタスクGID: ${asanaTask.gid}`,
      status: "needsAction",
      due: googleTaskDueDate // 固定された期日を設定
    };

    try {
      const createdTask = Tasks.Tasks.insert(googleTask, taskListIdToUse);
      console.log(`Googleタスクを作成しました: '${createdTask.title}' (ID: ${createdTask.id})`);
    } catch (e) {
      console.error(`Googleタスク '${googleTask.title}' の作成に失敗しました: ${e.toString()}`);
      Logger.log(`Googleタスク '${googleTask.title}' の作成に失敗しました: ${e.toString()}`);
    }
    Utilities.sleep(500); // API制限を避けるための短い待機
  });
}


// --- 以下はテスト用のヘルパー関数 (任意) ---
/**
 * 現在のスクリプトプロパティを表示します。
 */
function showScriptProperties() {
  const props = PropertiesService.getScriptProperties().getProperties();
  console.log(props);
  Logger.log(JSON.stringify(props));
}

/**
 * 指定したタスクリストのタスクをリストアップします（テスト用）。
 */
function listGoogleTasksInDefaultList() {
  loadScriptProperties_();
  let taskListIdToUse = GOOGLE_TASK_LIST_ID;
  if (!taskListIdToUse) {
    try {
      const taskLists = Tasks.Tasklists.list({ maxResults: 1 });
      if (taskLists.items && taskLists.items.length > 0) {
        taskListIdToUse = taskLists.items[0].id;
      } else {
        console.log("タスクリストが見つかりません。");
        Logger.log("タスクリストが見つかりません。");
        return;
      }
    } catch (e) {
        console.error("デフォルトタスクリストの取得中にエラー: " + e.toString());
        Logger.log("デフォルトタスクリストの取得中にエラー: " + e.toString());
        return;
    }
  }
  console.log(`タスクリストID: ${taskListIdToUse} のタスク一覧`);
  Logger.log(`タスクリストID: ${taskListIdToUse} のタスク一覧`);
  try {
    const result = Tasks.Tasks.list(taskListIdToUse); // {showCompleted: false, showHidden: false} などを追加可能
    if (result.items) {
      result.items.forEach(task => {
        const logMessage = `- ${task.title} (期日: ${task.due || 'なし'}, ID: ${task.id}, Notes: ${task.notes})`;
        console.log(logMessage);
        Logger.log(logMessage);
      });
    } else {
      console.log("このリストにタスクはありません。");
      Logger.log("このリストにタスクはありません。");
    }
  } catch (e) {
      console.error(`タスクリスト (${taskListIdToUse}) のタスク取得中にエラー: ${e.toString()}`);
      Logger.log(`タスクリスト (${taskListIdToUse}) のタスク取得中にエラー: ${e.toString()}`);
  }
}
