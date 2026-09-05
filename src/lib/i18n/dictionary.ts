import type { CategoryKey } from '@/lib/ai/schema';

export type Locale = 'en' | 'zh';

export const LOCALES: Locale[] = ['en', 'zh'];

/** 面向澳洲用户，默认英文；中文是可切换的选项，不是自动探测（spec 要求） */
export const DEFAULT_LOCALE: Locale = 'en';

type Interpolate = (params: Record<string, string | number>) => string;
type DictValue = string | Interpolate;

/**
 * UI 展示层字典。key 集合与语言无关，值随 locale 变化。
 * 不含任何账本数据/AI 输出——那些字段（type/amount/category enum/merchant/description）
 * 本身就是稳定的、不随 UI locale 变化（见任务文档 §5-§7）。
 */
export type DictKey =
  | 'logOut'
  | 'logInPrompt'
  | 'logInDescription'
  | 'logInAction'
  | 'backToLedger'
  | 'localeToggleLabel'
  | 'composerPlaceholder'
  | 'submit'
  | 'submitting'
  | 'voiceStart'
  | 'voiceStop'
  | 'voiceCancel'
  | 'voiceRecording'
  | 'voiceTranscribing'
  | 'voiceUnsupported'
  | 'voiceInsecureContext'
  | 'voicePermissionDenied'
  | 'pendingLabel'
  | 'emptyLedger'
  | 'undoneCount'
  | 'undo'
  | 'errorUnauthenticated'
  | 'errorQuotaExceeded'
  | 'errorInvalidRequest'
  | 'errorStructureFailed'
  | 'errorTranscribeFailed'
  | 'errorGeneric'
  | 'queuedOffline'
  | 'syncPendingCount'
  | 'syncedUpToDate'
  | 'syncWarningBanner'
  | 'syncWarningBannerIOS'
  | 'syncWarningModalTitle'
  | 'syncRetry'
  | 'exportBackup'
  | 'editSave'
  | 'editCancel'
  | 'editDelete'
  | 'editDialogTitle'
  | 'editCategoryLabel'
  | 'editAmountLabel'
  | 'editDateLabel'
  | 'editMerchantLabel'
  | 'editDescriptionLabel'
  | 'editAmountInvalid'
  | 'editDateInvalid'
  | 'statsTotalExpense'
  | 'statsTotalIncome'
  | 'statsEmpty'
  | 'statsMonthSummary'
  | 'navLedger'
  | 'navStats'
  | 'settingsTitle'
  | 'settingsAccount'
  | 'settingsStorageUsage'
  | 'settingsStorageTitle'
  | 'settingsDataTitle'
  | 'settingsExport'
  | 'settingsAvatarLabel'
  | 'installTitle'
  | 'installActionAndroid'
  | 'installInstructionsIOS'
  | 'installAlreadyInstalled'
  | 'installNudgeUnsynced'
  | 'toastDismiss'
  | 'toastRegion'
  | 'monthPrev'
  | 'monthNext'
  | 'navHistory'
  | 'historySearchLabel'
  | 'historyMoreFilters'
  | 'historyDateFrom'
  | 'historyDateTo'
  | 'historyKeywordPlaceholder'
  | 'historyClearFilter'
  | 'historyNoResults'
  | 'historySummaryTitle'
  | 'loginHeroTitle'
  | 'loginHeroSubhead'
  | 'heroSecondaryCta'
  | 'statSpeedNumber'
  | 'statSpeedLabel'
  | 'statLocalNumber'
  | 'statLocalLabel'
  | 'statZeroNumber'
  | 'statZeroLabel'
  | 'featureVoiceTitle'
  | 'featureVoiceDesc'
  | 'featureAutoTitle'
  | 'featureAutoDesc'
  | 'featureOfflineTitle'
  | 'featureOfflineDesc'
  | 'featurePrivacyTitle'
  | 'featurePrivacyDesc';

const en: Record<DictKey, DictValue> = {
  logOut: 'Log out',
  logInPrompt: 'Log in to get started',
  // 原文写的是"Google 云"，这里按项目实际架构改成 Google Drive——同步
  // 走的具体是 Drive 的 appDataFolder（见 sync/drive.ts），不是笼统的
  // "Google 云"，跟营销首页 Hero 已经在用的说法（"syncs to your own
  // Drive"）保持一致的技术表述。
  logInDescription: 'Your data stays on this device — sync runs through your own Google Drive.',
  logInAction: 'Continue with Google',
  backToLedger: 'Back (view local ledger)',
  localeToggleLabel: '中文',
  composerPlaceholder: "What's on your mind…",
  submit: 'Submit',
  submitting: 'Submitting…',
  voiceStart: 'Record',
  voiceStop: 'Stop',
  voiceCancel: 'Cancel',
  voiceRecording: 'Recording…',
  voiceTranscribing: 'Transcribing…',
  voiceUnsupported: 'Voice recording is not supported in this browser',
  voiceInsecureContext:
    'Voice recording needs a secure connection (HTTPS). This page was opened over plain HTTP.',
  voicePermissionDenied:
    'Microphone access was denied. Allow it in your browser settings and try again.',
  pendingLabel: 'Processing…',
  emptyLedger: 'No records yet — try saying something.',
  undoneCount: ({ count, unsynced }) =>
    `Recorded ${count} item${count === 1 ? '' : 's'}${Number(unsynced) > 0 ? ' · pending sync' : ''}`,
  undo: 'Undo',
  syncPendingCount: ({ count }) => `${count} pending sync`,
  syncedUpToDate: 'Synced',
  syncWarningBanner: 'Not backed up to the cloud yet — check your connection.',
  syncWarningBannerIOS:
    'Not synced yet — Safari may clear this data after 7 days. Add to Home Screen to keep it safe.',
  syncWarningModalTitle: 'Some entries have been unsynced for a while.',
  syncRetry: 'Retry sync',
  exportBackup: 'Export backup',
  editSave: 'Save',
  editCancel: 'Cancel',
  editDelete: 'Delete',
  editDialogTitle: 'Edit transaction',
  editCategoryLabel: 'Category',
  editAmountLabel: 'Amount',
  editDateLabel: 'Date',
  editMerchantLabel: 'Merchant',
  editDescriptionLabel: 'Description',
  editAmountInvalid: 'Enter a positive amount with at most 2 decimals',
  editDateInvalid: 'Enter a valid date (YYYY-MM-DD)',
  statsTotalExpense: 'Total spent',
  statsTotalIncome: 'Income',
  statsEmpty: 'Nothing recorded in this period.',
  statsMonthSummary: 'Monthly overview',
  navLedger: 'Ledger',
  navStats: 'Stats',
  errorUnauthenticated: 'Please log in first',
  errorQuotaExceeded: 'Daily AI usage limit reached, please try again tomorrow',
  errorInvalidRequest: 'Request was invalid, please try again',
  errorStructureFailed: 'Failed to save, please retry',
  errorTranscribeFailed: 'Transcription failed, please retry',
  errorGeneric: 'Something went wrong, please retry',
  queuedOffline: 'Queued offline — will record once back online',
  settingsTitle: 'Settings',
  settingsAccount: 'Account',
  settingsStorageUsage: ({ used, quota }) => `${used} MB / ${quota} MB`,
  settingsStorageTitle: 'Local storage',
  settingsDataTitle: 'Data',
  settingsExport: 'Export backup',
  settingsAvatarLabel: 'Settings',
  installTitle: 'Install JustSayIt',
  installActionAndroid: 'Install',
  installInstructionsIOS: 'Tap the Share button, then "Add to Home Screen".',
  installAlreadyInstalled: 'Already installed to your home screen.',
  installNudgeUnsynced: "Add to Home Screen to keep this device's data safe.",
  toastDismiss: 'Dismiss',
  toastRegion: 'Notifications',
  monthPrev: 'Previous month',
  monthNext: 'Next month',
  navHistory: 'History',
  historySearchLabel: 'Search',
  historyMoreFilters: 'More filters (date range)',
  historyDateFrom: 'From',
  historyDateTo: 'To',
  historyKeywordPlaceholder: 'Search transactions, merchant, or notes…',
  historyClearFilter: 'Clear filter',
  historyNoResults: 'No matching records — try a different date range or keyword.',
  historySummaryTitle: 'Net by currency',
  loginHeroTitle: 'Just say it.',
  loginHeroSubhead:
    'Record expenses by voice in seconds — auto-categorized, local-first, always yours.',
  heroSecondaryCta: 'See how it works',
  statSpeedNumber: '<3s',
  statSpeedLabel: 'from voice to record',
  statLocalNumber: '100%',
  statLocalLabel: 'processed on your device',
  statZeroNumber: '0',
  statZeroLabel: 'copies held on our servers',
  featureVoiceTitle: 'Voice-first input',
  featureVoiceDesc: 'Tap once, say it, done — no forms to fill.',
  featureAutoTitle: 'Smart categorization',
  featureAutoDesc: 'AI sorts every entry into the right category.',
  featureOfflineTitle: 'Works offline',
  featureOfflineDesc: 'Entries queue up and sync when you are back online.',
  featurePrivacyTitle: 'Local-first & private',
  featurePrivacyDesc: 'Your data lives on your device — the cloud is just backup.',
};

const zh: Record<DictKey, DictValue> = {
  logOut: '退出',
  logInPrompt: '登录开始使用',
  logInDescription: '数据都存在您的设备上，同步功能通过您自己的 Google Drive 实现。',
  logInAction: '使用 Google 登录',
  backToLedger: '返回（可查看本地账本）',
  localeToggleLabel: 'English',
  composerPlaceholder: '说点什么…',
  submit: '提交',
  submitting: '提交中…',
  voiceStart: '录音',
  voiceStop: '停止',
  voiceCancel: '取消',
  voiceRecording: '录音中…',
  voiceTranscribing: '转写中…',
  voiceUnsupported: '当前浏览器不支持录音',
  voiceInsecureContext: '语音录制需要安全连接（HTTPS）——当前页面是通过普通 HTTP 打开的。',
  voicePermissionDenied: '麦克风权限被拒绝，请在浏览器设置里允许后重试。',
  pendingLabel: '处理中…',
  emptyLedger: '还没有记录，说点什么试试。',
  undoneCount: ({ count, unsynced }) =>
    `已记录 ${count} 笔${Number(unsynced) > 0 ? ' · 待同步' : ''}`,
  undo: '撤销',
  syncPendingCount: ({ count }) => `${count} 笔待同步`,
  syncedUpToDate: '已同步',
  syncWarningBanner: '尚未备份到云端，检查一下网络。',
  syncWarningBannerIOS: '尚未同步——Safari 可能在 7 天后清除这些数据，添加到主屏幕可以避免。',
  syncWarningModalTitle: '有些账目已经很久没同步了。',
  syncRetry: '重试同步',
  exportBackup: '导出备份',
  editSave: '保存',
  editCancel: '取消',
  editDelete: '删除',
  editDialogTitle: '编辑账目',
  editCategoryLabel: '分类',
  editAmountLabel: '金额',
  editDateLabel: '日期',
  editMerchantLabel: '商户',
  editDescriptionLabel: '描述',
  editAmountInvalid: '请输入正数金额，最多两位小数',
  editDateInvalid: '请输入有效日期（YYYY-MM-DD）',
  statsTotalExpense: '总支出',
  statsTotalIncome: '收入',
  statsEmpty: '这段时间还没有记录。',
  statsMonthSummary: '本月总览',
  navLedger: '记账',
  navStats: '统计',
  errorUnauthenticated: '请先登录',
  errorQuotaExceeded: '今日 AI 调用次数已达上限，请明天再试',
  errorInvalidRequest: '请求参数不合法，请重试',
  errorStructureFailed: '记账失败，请重试',
  errorTranscribeFailed: '转写失败，请重试',
  errorGeneric: '出了点问题，请重试',
  queuedOffline: '离线待处理，联网后自动记账',
  settingsTitle: '设置',
  settingsAccount: '账号',
  settingsStorageUsage: ({ used, quota }) => `${used} MB / ${quota} MB`,
  settingsStorageTitle: '本地存储',
  settingsDataTitle: '数据',
  settingsExport: '导出备份',
  settingsAvatarLabel: '设置',
  installTitle: '安装 JustSayIt',
  installActionAndroid: '安装',
  installInstructionsIOS: '点击分享按钮，选择"添加到主屏幕"。',
  installAlreadyInstalled: '已经安装到主屏幕了。',
  installNudgeUnsynced: '添加到主屏幕以保护这台设备上的数据。',
  toastDismiss: '关闭',
  toastRegion: '通知',
  monthPrev: '上月',
  monthNext: '下月',
  navHistory: '历史',
  historySearchLabel: '搜索',
  historyMoreFilters: '更多筛选（日期范围）',
  historyDateFrom: '从',
  historyDateTo: '至',
  historyKeywordPlaceholder: '搜索交易、商户或备注…',
  historyClearFilter: '清除筛选',
  historyNoResults: '没有匹配的记录，试试换个日期范围或关键词。',
  historySummaryTitle: '按币种净额',
  loginHeroTitle: '说一句，账就记好了',
  loginHeroSubhead: '用一句话记下一笔——自动分类、本地优先、数据永远属于你。',
  heroSecondaryCta: '看看它是怎么记的',
  statSpeedNumber: '<3s',
  statSpeedLabel: '从说出口到记好账',
  statLocalNumber: '100%',
  statLocalLabel: '全部在你的设备上处理',
  statZeroNumber: '0',
  statZeroLabel: '服务器上零副本',
  featureVoiceTitle: '语音输入为主',
  featureVoiceDesc: '点一下，说出来，就记好了——不用填表。',
  featureAutoTitle: '智能分类',
  featureAutoDesc: 'AI 把每笔消费自动归到正确的分类。',
  featureOfflineTitle: '离线也能记',
  featureOfflineDesc: '离线时记账自动排队，联网后自动同步。',
  featurePrivacyTitle: '本地优先、隐私安全',
  featurePrivacyDesc: '数据存留在你的设备上——云端只作备份。',
};

export const dictionaries: Record<Locale, Record<DictKey, DictValue>> = { en, zh };

/**
 * Category 的本地化 label——稳定英文 key（数据库/AI schema/事件日志用）
 * 到展示文案的唯一映射入口。新增分类时 TS 会因为 Record<CategoryKey, ...>
 * 穷尽性检查在这里报错，不会静默漏译（同 prompt.ts 的 CATEGORY_GLOSS_MAP 手法）。
 */
export const CATEGORY_LABELS: Record<Locale, Record<CategoryKey, string>> = {
  en: {
    FOOD: 'Food',
    TRANSPORT: 'Transport',
    SHOPPING: 'Shopping',
    HOUSING: 'Housing',
    DAILY: 'Daily',
    ENTERTAINMENT: 'Entertainment',
    MEDICAL: 'Medical',
    EDUCATION: 'Education',
    SOCIAL: 'Social',
    SUBSCRIPTION: 'Subscription',
    TRAVEL: 'Travel',
    SALARY: 'Salary',
    SIDE_INCOME: 'Side income',
    INVESTMENT: 'Investment',
    REFUND: 'Refund',
    GIFT: 'Gift',
    OTHER: 'Other',
  },
  zh: {
    FOOD: '餐饮',
    TRANSPORT: '交通',
    SHOPPING: '购物',
    HOUSING: '住房',
    DAILY: '日用',
    ENTERTAINMENT: '娱乐',
    MEDICAL: '医疗',
    EDUCATION: '教育',
    SOCIAL: '社交',
    SUBSCRIPTION: '订阅',
    TRAVEL: '旅行',
    SALARY: '工资',
    SIDE_INCOME: '副业',
    INVESTMENT: '投资',
    REFUND: '退款',
    GIFT: '礼金',
    OTHER: '其他',
  },
};

/** 服务端 error code → 字典 key。未知/缺失 code 一律落到 errorGeneric。 */
const ERROR_CODE_TO_KEY: Record<string, DictKey> = {
  UNAUTHENTICATED: 'errorUnauthenticated',
  QUOTA_EXCEEDED: 'errorQuotaExceeded',
  INVALID_REQUEST: 'errorInvalidRequest',
};

export function errorCodeToKey(code: string | undefined, fallback: DictKey): DictKey {
  if (!code) return fallback;
  return ERROR_CODE_TO_KEY[code] ?? fallback;
}
