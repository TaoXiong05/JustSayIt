import type { CategoryKey } from '@/lib/ai/schema';

export type Locale = 'en' | 'zh';

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
  | 'logInOfflineDescription'
  | 'logInAction'
  | 'backToLedger'
  | 'composerOfflineTitle'
  | 'composerOfflineDescription'
  | 'footerPrivacyPolicy'
  | 'footerTermsOfService'
  | 'localeToggleLabel'
  | 'composerTitle'
  | 'composerSubtitle'
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
  | 'voiceNoSoundDetected'
  | 'pendingLabel'
  | 'pageLoading'
  | 'emptyLedger'
  | 'recentTransactionsTitle'
  | 'viewAllHistory'
  | 'undoneCount'
  | 'errorUnauthenticated'
  | 'errorQuotaExceeded'
  | 'errorInvalidRequest'
  | 'errorStructureFailed'
  | 'errorNoTransactionsFound'
  | 'errorMissingAmount'
  | 'errorTranscribeFailed'
  | 'errorNetworkFailed'
  | 'errorGeneric'
  | 'accountSwitchTitle'
  | 'accountSwitchBodySafe'
  | 'accountSwitchBodyUnsynced'
  | 'accountSwitchClear'
  | 'accountSwitchKeep'
  | 'syncPendingCount'
  | 'syncedUpToDate'
  | 'rowUnsynced'
  | 'syncLastError'
  | 'syncWarningModalTitle'
  | 'syncRetry'
  | 'syncReconnect'
  | 'syncing'
  | 'syncFailedShort'
  | 'syncDismiss'
  | 'exportBackup'
  | 'editSave'
  | 'editCancel'
  | 'editDelete'
  | 'editDeleteConfirm'
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
  | 'statsBalance'
  | 'statsEmpty'
  | 'statsMonthSummary'
  | 'navLedger'
  | 'navStats'
  | 'historyTagline'
  | 'statsTagline'
  | 'settingsTitle'
  | 'settingsAccount'
  | 'settingsStorageUsage'
  | 'settingsStorageTitle'
  | 'settingsDataTitle'
  | 'settingsExport'
  | 'settingsAvatarLabel'
  | 'installTitle'
  | 'installNavButton'
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
  | 'dataFlowTitle'
  | 'dataFlowInput'
  | 'dataFlowAI'
  | 'dataFlowLedger'
  | 'dataFlowSync'
  | 'dataFlowNote'
  | 'settingsStorageDescription'
  | 'settingsDataDescription'
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
  // 访客且离线时替换上面那条——登录本身要走 Google OAuth，没有网络这一步
  // 连开始都开始不了，说"数据存在本地"这句在这个状态下答非所问。
  logInOfflineDescription: 'Signing in needs a connection — reconnect, then continue with Google.',
  logInAction: 'Continue with Google',
  backToLedger: 'Back (view local ledger)',
  // 已登录但离线时，输入区换成这张卡片（跟访客引导卡同一套视觉，见
  // ledger/page.tsx）——历史账目仍可查看/编辑，只是记不了新的一笔。
  composerOfflineTitle: 'You need a connection to record',
  composerOfflineDescription:
    'Your existing entries are still here to view and edit. Reconnect to add a new one.',
  footerPrivacyPolicy: 'Privacy Policy',
  footerTermsOfService: 'Terms of Service',
  localeToggleLabel: '中文',
  composerTitle: 'Record anytime, anywhere',
  composerSubtitle: 'Say it or type it — e.g. "spent 15 at KFC for lunch"',
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
  voiceNoSoundDetected: 'No sound detected, please try again',
  pendingLabel: 'Processing…',
  pageLoading: 'Loading…',
  emptyLedger: 'No records yet — try saying something.',
  recentTransactionsTitle: 'Recent transactions',
  viewAllHistory: 'View all history',
  undoneCount: ({ count, unsynced }) =>
    `Recorded ${count} item${count === 1 ? '' : 's'}${Number(unsynced) > 0 ? ' · pending sync' : ''}`,
  syncPendingCount: ({ count }) => `${count} pending sync`,
  syncedUpToDate: 'Synced',
  rowUnsynced: 'Not synced yet',
  syncLastError: ({ message }) => `Last sync failed: ${message}`,
  syncWarningModalTitle: 'Some entries have been unsynced for a while.',
  syncRetry: 'Retry sync',
  syncReconnect: 'Reconnect Google Drive',
  syncing: 'Syncing…',
  syncFailedShort: 'Sync failed',
  syncDismiss: 'Got it',
  exportBackup: 'Export backup',
  editSave: 'Save',
  editCancel: 'Cancel',
  editDelete: 'Delete',
  editDeleteConfirm: 'Delete this record?',
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
  statsBalance: 'Balance',
  statsEmpty: 'Nothing recorded in this period.',
  statsMonthSummary: 'Monthly overview',
  navLedger: 'Ledger',
  navStats: 'Stats',
  historyTagline: 'Effortless tracking for a clearer financial future.',
  statsTagline: "Let's see what's been stealing your money…",
  errorUnauthenticated: 'Please log in first',
  errorQuotaExceeded: 'Daily AI usage limit reached, please try again tomorrow',
  errorInvalidRequest: 'Request was invalid, please try again',
  errorStructureFailed: 'Failed to save, please retry',
  errorNoTransactionsFound: "Couldn't find anything to record — try rephrasing",
  errorMissingAmount: 'Add an amount, e.g. "lunch 15"',
  errorTranscribeFailed: 'Transcription failed, please retry',
  // 客户端本地判定（见 ledger/page.tsx、VoiceButton.tsx）：fetch() 本身
  // 因为网络层面失败而 reject（不是服务器返回了错误状态码）时用这条，
  // 跟"结构化失败"/"转写失败"区分开——那两条暗示的是"服务出了问题"，
  // 这条讲的是"请求根本没送到"，用户该做的事不一样（检查网络 vs 换个说法重试）。
  errorNetworkFailed: 'Network connection failed — check your connection and try again',
  errorGeneric: 'Something went wrong, please retry',
  accountSwitchTitle: 'Different Google account detected',
  accountSwitchBodySafe:
    "This device's local ledger belongs to a different account, and everything in it is already synced. Clear it to start fresh with this account?",
  accountSwitchBodyUnsynced: ({ count }) =>
    `This device's local ledger belongs to a different account, and ${count} of its entries have never synced anywhere. Clearing will permanently delete them; keeping them means your next sync could push them into this account's Google Drive.`,
  accountSwitchClear: 'Clear local data',
  accountSwitchKeep: 'Keep as is',
  settingsTitle: 'Settings',
  settingsAccount: 'Account',
  settingsStorageUsage: ({ used, quota }) => `${used} MB / ${quota} MB`,
  settingsStorageTitle: 'Local storage',
  settingsDataTitle: 'Data',
  settingsExport: 'Export backup',
  settingsAvatarLabel: 'Settings',
  installTitle: 'Install JustSayIt',
  installNavButton: 'Install',
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
  loginHeroTitle: 'Just say it. Your ledger stays on your device.',
  loginHeroSubhead:
    'Record expenses by voice in seconds — auto-categorized, local-first, with your device as the ledger’s primary home.',
  heroSecondaryCta: 'See how it works',
  dataFlowTitle: 'Where your data goes',
  dataFlowInput: 'You say it',
  dataFlowAI: 'AI understands it',
  dataFlowLedger: 'Your ledger stays on your device',
  dataFlowSync: 'Optional sync to your own Google Drive',
  dataFlowNote:
    'AI helps understand each entry. JustSayIt does not keep a cloud copy of your complete ledger.',
  settingsStorageDescription:
    'Your device holds the primary copy of your ledger. Keep a backup or enable sync if you need to recover after losing or clearing this device.',
  settingsDataDescription: 'Export a copy whenever you want. Optional sync goes to your own Google Drive, not a JustSayIt cloud ledger.',
  statSpeedNumber: '<3s',
  statSpeedLabel: 'from voice to record',
  statLocalNumber: 'LOCAL',
  statLocalLabel: 'primary ledger copy on your device',
  statZeroNumber: '0',
  statZeroLabel: 'copies held on our servers',
  featureVoiceTitle: 'Voice-first input',
  featureVoiceDesc: 'Tap once, say it, done — no forms to fill.',
  featureAutoTitle: 'Smart categorization',
  featureAutoDesc: 'AI sorts every entry into the right category.',
  featureOfflineTitle: 'Local-first storage',
  featureOfflineDesc: 'View and edit your history anytime — even offline. Recording a new entry needs a connection.',
  featurePrivacyTitle: 'Local-first & private',
  featurePrivacyDesc: 'Your data lives on your device — the cloud is just backup.',
};

const zh: Record<DictKey, DictValue> = {
  logOut: '退出',
  logInPrompt: '登录开始使用',
  logInDescription: '数据都存在您的设备上，同步功能通过您自己的 Google Drive 实现。',
  logInOfflineDescription: '登录需要联网——请先连接网络，再用 Google 账号继续。',
  logInAction: '使用 Google 登录',
  backToLedger: '返回（可查看本地账本）',
  composerOfflineTitle: '需要联网才能记账',
  composerOfflineDescription: '已经记好的账目仍然可以查看和编辑，联网后即可记新的一笔。',
  footerPrivacyPolicy: '隐私政策',
  footerTermsOfService: '服务条款',
  localeToggleLabel: 'English',
  composerTitle: '随时随地，语音记账',
  composerSubtitle: '直接说出或输入消费，例如："中午吃肯德基花费15块"',
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
  voiceNoSoundDetected: '没有检测到声音，请重试',
  pendingLabel: '处理中…',
  pageLoading: '加载中…',
  emptyLedger: '还没有记录，说点什么试试。',
  recentTransactionsTitle: '近期账单',
  viewAllHistory: '查看全部历史',
  undoneCount: ({ count, unsynced }) =>
    `已记录 ${count} 笔${Number(unsynced) > 0 ? ' · 待同步' : ''}`,
  syncPendingCount: ({ count }) => `${count} 笔待同步`,
  syncedUpToDate: '已同步',
  rowUnsynced: '尚未同步',
  syncLastError: ({ message }) => `上次同步失败：${message}`,
  syncWarningModalTitle: '有些账目已经很久没同步了。',
  syncRetry: '重试同步',
  syncReconnect: '重新连接 Google Drive',
  syncing: '同步中…',
  syncFailedShort: '同步失败',
  syncDismiss: '已了解',
  exportBackup: '导出备份',
  editSave: '保存',
  editCancel: '取消',
  editDelete: '删除',
  editDeleteConfirm: '确定删除这笔记录？',
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
  statsBalance: '结余',
  statsEmpty: '这段时间还没有记录。',
  statsMonthSummary: '本月总览',
  navLedger: '记账',
  navStats: '统计',
  historyTagline: '轻松记录每一笔，让财务未来更清晰。',
  statsTagline: '我们来看看，是什么抢走了你的财富~',
  errorUnauthenticated: '请先登录',
  errorQuotaExceeded: '今日 AI 调用次数已达上限，请明天再试',
  errorInvalidRequest: '请求参数不合法，请重试',
  errorStructureFailed: '记账失败，请重试',
  errorNoTransactionsFound: '没有识别到可记录的账目，换个说法再试试',
  errorMissingAmount: '请包含具体金额，比如"午饭 15"',
  errorTranscribeFailed: '转写失败，请重试',
  errorNetworkFailed: '网络连接失败，请检查网络后重试',
  errorGeneric: '出了点问题，请重试',
  accountSwitchTitle: '检测到不同的 Google 账号',
  accountSwitchBodySafe: '这台设备本地的账本属于另一个账号，且已经全部同步过。要清空本机数据、以这个账号重新开始吗？',
  accountSwitchBodyUnsynced: ({ count }) =>
    `这台设备本地的账本属于另一个账号，其中有 ${count} 条从未同步到任何地方。清空会永久删除这些记录；保留则可能在下次同步时被推送进当前账号的 Google Drive。`,
  accountSwitchClear: '清空本机数据',
  accountSwitchKeep: '保留不变',
  settingsTitle: '设置',
  settingsAccount: '账号',
  settingsStorageUsage: ({ used, quota }) => `${used} MB / ${quota} MB`,
  settingsStorageTitle: '本地存储',
  settingsDataTitle: '数据',
  settingsExport: '导出备份',
  settingsAvatarLabel: '设置',
  installTitle: '安装 JustSayIt',
  installNavButton: '安装',
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
  loginHeroTitle: '说一句，账就记好了。账本留在你的设备。',
  loginHeroSubhead: '用一句话记下一笔——自动分类、本地优先，账本主副本由你的设备掌控。',
  heroSecondaryCta: '看看它是怎么记的',
  dataFlowTitle: '数据去哪了？',
  dataFlowInput: '你说一句',
  dataFlowAI: 'AI 帮你理解',
  dataFlowLedger: '账本留在你的设备',
  dataFlowSync: '可选：同步到你自己的 Google Drive',
  dataFlowNote: 'AI 只负责理解当次输入。JustSayIt 不保存你的完整账本副本。',
  settingsStorageDescription: '账本主副本保存在你的设备上。如果设备丢失或存储被清理，请开启同步或定期导出备份，以便恢复。',
  settingsDataDescription: '随时导出一份副本。可选同步会写入你自己的 Google Drive，而不是 JustSayIt 的云端账本。',
  statSpeedNumber: '<3s',
  statSpeedLabel: '从说出口到记好账',
  statLocalNumber: '本地',
  statLocalLabel: '账本主副本在你的设备上',
  statZeroNumber: '0',
  statZeroLabel: '服务器上零副本',
  featureVoiceTitle: '语音输入为主',
  featureVoiceDesc: '点一下，说出来，就记好了——不用填表。',
  featureAutoTitle: '智能分类',
  featureAutoDesc: 'AI 把每笔消费自动归到正确的分类。',
  featureOfflineTitle: '数据本地优先',
  featureOfflineDesc: '离线也能随时查看、编辑历史账目；记新的一笔需要联网。',
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
  // 客户端本地抛出（见 ledger/page.tsx），不是服务端 code——AI 成功返回但
  // 一条账目都没识别出来时（比如提交了一串无意义字符），跟"请求失败"是
  // 两回事，需要一条不同的文案，不能落进 errorStructureFailed 那句
  // "记账失败"（这次调用其实没有失败）。
  NO_TRANSACTIONS: 'errorNoTransactionsFound',
  // 客户端本地抛出（见 ledger/page.tsx、VoiceButton.tsx）：fetch() 因网络
  // 层面失败而 reject（不是服务器给了个错误状态码）时用这条，见
  // errorNetworkFailed 定义处的说明。
  NETWORK_ERROR: 'errorNetworkFailed',
};

export function errorCodeToKey(code: string | undefined, fallback: DictKey): DictKey {
  if (!code) return fallback;
  return ERROR_CODE_TO_KEY[code] ?? fallback;
}
