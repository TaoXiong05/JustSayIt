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
  | 'appTitle'
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
  | 'editCategoryLabel'
  | 'editAmountLabel'
  | 'editDateLabel'
  | 'editMerchantLabel'
  | 'editDescriptionLabel'
  | 'editAmountInvalid'
  | 'statsTabWeek'
  | 'statsTabMonth'
  | 'statsPrev'
  | 'statsNext'
  | 'statsTotalExpense'
  | 'statsTotalIncome'
  | 'statsEmpty'
  | 'navLedger'
  | 'navStats'
  | 'settingsTitle'
  | 'settingsAccount'
  | 'settingsStorageUsage'
  | 'settingsExport'
  | 'settingsAvatarLabel'
  | 'installTitle'
  | 'installActionAndroid'
  | 'installInstructionsIOS'
  | 'installAlreadyInstalled';

const en: Record<DictKey, DictValue> = {
  appTitle: 'JustSayIt',
  logOut: 'Log out',
  logInPrompt: 'Log in to start tracking',
  logInDescription: 'Log in to use AI expense tracking and voice input.',
  logInAction: 'Continue with Google',
  backToLedger: 'Back (view local ledger)',
  localeToggleLabel: '中文',
  composerPlaceholder: "What's on your mind…",
  submit: 'Submit',
  submitting: 'Submitting…',
  voiceStart: '🎤 Record',
  voiceStop: 'Stop',
  voiceCancel: 'Cancel',
  voiceRecording: 'Recording…',
  voiceTranscribing: 'Transcribing…',
  voiceUnsupported: 'Voice recording is not supported in this browser',
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
  editCategoryLabel: 'Category',
  editAmountLabel: 'Amount',
  editDateLabel: 'Date',
  editMerchantLabel: 'Merchant',
  editDescriptionLabel: 'Description',
  editAmountInvalid: 'Enter a positive amount with at most 2 decimals',
  statsTabWeek: 'Week',
  statsTabMonth: 'Month',
  statsPrev: '◀',
  statsNext: '▶',
  statsTotalExpense: 'Total spent',
  statsTotalIncome: 'Income',
  statsEmpty: 'Nothing recorded in this period.',
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
  settingsStorageUsage: ({ used, quota }) => `Local storage: ${used} MB / ${quota} MB`,
  settingsExport: 'Export backup',
  settingsAvatarLabel: 'Settings',
  installTitle: 'Install JustSayIt',
  installActionAndroid: 'Install',
  installInstructionsIOS: 'Tap the Share button, then "Add to Home Screen".',
  installAlreadyInstalled: 'Already installed to your home screen.',
};

const zh: Record<DictKey, DictValue> = {
  appTitle: 'JustSayIt',
  logOut: '退出',
  logInPrompt: '登录后开始记账',
  logInDescription: '登录后即可使用 AI 记账与语音输入。',
  logInAction: '使用 Google 登录',
  backToLedger: '返回（可查看本地账本）',
  localeToggleLabel: 'English',
  composerPlaceholder: '说点什么…',
  submit: '提交',
  submitting: '提交中…',
  voiceStart: '🎤 录音',
  voiceStop: '停止',
  voiceCancel: '取消',
  voiceRecording: '录音中…',
  voiceTranscribing: '转写中…',
  voiceUnsupported: '当前浏览器不支持录音',
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
  editCategoryLabel: '分类',
  editAmountLabel: '金额',
  editDateLabel: '日期',
  editMerchantLabel: '商户',
  editDescriptionLabel: '描述',
  editAmountInvalid: '请输入正数金额，最多两位小数',
  statsTabWeek: '本周',
  statsTabMonth: '本月',
  statsPrev: '◀',
  statsNext: '▶',
  statsTotalExpense: '总支出',
  statsTotalIncome: '收入',
  statsEmpty: '这段时间还没有记录。',
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
  settingsStorageUsage: ({ used, quota }) => `本地已用 ${used} MB / 配额 ${quota} MB`,
  settingsExport: '导出备份',
  settingsAvatarLabel: '设置',
  installTitle: '安装 JustSayIt',
  installActionAndroid: '安装',
  installInstructionsIOS: '点击分享按钮，选择"添加到主屏幕"。',
  installAlreadyInstalled: '已经安装到主屏幕了。',
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
