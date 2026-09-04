# JustSayIt — 设计文档

日期：2026-09-04
状态：已确认，待转实现计划

---

## 1. 产品定义

一个 Privacy-first、Local-first 的 AI 记账 Web App。用户通过语音或自然语言描述收入和支出，AI 完成信息提取、分类和结构化。账单数据保存在用户本地设备，并同步到用户自己的 Google Drive 应用数据空间。后端仅负责身份认证、AI 请求代理、令牌兑换以及用户账户与用量管理。

**一句话体验目标**：记一笔账应该比发一条微信更简单。

---

## 2. 核心原则

1. **Zero-friction** — 打开、说话、完成。不要求用户选分类、填日期、选支付方式。
2. **Natural Language First** — 用户负责表达事实，AI 负责理解事实。不要求任何固定格式。
3. **AI Handles the Structure** — NLP → 分类 → 抽取 → 结构化 JSON，全部由 AI 完成。
4. **Local-first** — 数据默认在用户设备上。本地读写不因登录状态或网络状态而阻塞。
5. **Privacy-first** — 账本内容**永远不流经后端**。后端只知道"用户是谁"，不知道"用户花了什么钱"。

---

## 3. 范围

### MVP 包含

- Google 登录（强制，一次性请求全部 scope）
- 文本输入
- 语音输入（录音 → 后端 STT → 回填输入框 → 用户确认后提交）
- 后端 AI Gateway（仅 Groq，不做 fallback）
- JSON Schema 强约束的结构化输出
- 本地事件日志（IndexedDB）
- 账单列表
- **按周 / 按月的分类统计**（各分类金额、可展开看明细、总支出）
- **账目编辑**（改分类、金额等）——统计功能的前提，见 §6.5
- Google Drive appDataFolder 同步（默认开启）
- 同步状态可见 + 分级风险预警
- 一键导出备份
- PWA 安装引导
- 离线输入队列（联网后自动补跑 AI）
- 每用户 AI 调用配额

### MVP 明确不做

预算、财务分析与预测、跨周期趋势图、自定义日期区间、多级分类、复杂搜索、社交功能、家庭共享、银行 API、OCR、后台管理、Web Push、付费/订阅系统、按成本智能路由 AI provider。

> **统计功能的边界**：做的是"本周/本月各分类花了多少、展开看明细、总共多少"。不做的是趋势、预算对比、任意区间、图表分析。这条线的意义在于——前者是一次对内存数组的 reduce，后者会引出时间序列、预算模型、图表库等一整套东西。

**MVP 要验证的核心假设**：用户是否真的愿意通过自然语言/语音持续记录每一笔账。功能多寡不是这一阶段的问题。

---

## 4. 架构总览

```
浏览器（PWA）
  ├── 录音 ──→ 后端 /api/stt ──→ Groq whisper-large-v3-turbo ──→ 文字回填输入框
  ├── 用户确认后提交 ──→ 后端 /api/structure ──→ Groq qwen3.8-27b ──→ Transaction[]
  ├── 事件写入 IndexedDB（唯一真相来源）
  ├── 内存重放出账本状态 ──→ UI
  └── 直连 Google Drive appDataFolder（账本内容不经过后端）
          ↑
      短期 access token（向后端 /api/drive-token 兑换）

后端（Next.js API Routes，Docker on Oracle VM）
  ├── Google OAuth（authorization code flow）
  ├── Postgres（Prisma）：用户身份、加密 refresh token、AI 用量配额
  ├── AI Gateway：STT 代理 + 结构化代理
  └── 令牌兑换：refresh token → 短期 access token
```

**后端永远看不到的东西**：账单内容。它经手的是原始输入文本（在传输和调用 AI 的过程中）和令牌，但从不存储账单，也从不接触 Drive 上的账本文件。

> 措辞纪律：对外表述必须是"服务器不留存账单"，而不是"服务器不知道你花了什么钱"。原始自然语言在结构化过程中确实经过后端。这个区别在信任问题上是实质性的，不能含糊。

---

## 5. 数据模型

### 5.1 事件日志（唯一真相来源）

账本状态不直接存储，而是由不可变事件序列重放得出。

事件类型：

| 类型 | 含义 |
|---|---|
| `transaction_created` | 一笔账目产生 |
| `transaction_amended` | 修改某笔账目的字段 |
| `transaction_deleted` | 删除某笔账目 |
| `raw_input_queued` | 离线时的原始输入，等待 AI 结构化 |
| `raw_input_resolved` | 该原始输入已结构化，关联到产生的 transaction |

事件公共字段：`eventId`（UUID）、`deviceId`、`createdAt`（ISO 8601，含时区偏移）、`schemaVersion`、`payload`。

**为什么用事件日志**：记账在语义上天然是追加的——"我花了 25 块"是既成事实，不是可被并发修改的字段。删除和编辑同样表达为追加事件。这使得多设备同步在结构上不存在冲突（见 §7）。

**Schema 演进**通过事件里的 `schemaVersion` 处理，不改表结构。旧事件永远按其写入时的版本解读。

### 5.2 Transaction 数据契约

AI 结构化输出的目标结构：

```
Transaction {
  type:        "EXPENSE" | "INCOME"
  amount:      number        // 永远为正，单位「元」
  currency:    string | null // AI 仅在用户明确说了币种时填写，否则返回 null；
                             // 入库前由客户端以用户档案的 defaultCurrency 补齐，
                             // 事件日志中落盘的 currency 永不为 null
  date:        string        // "YYYY-MM-DD"
  category:    CategoryKey   // 见下方枚举
  merchant:    string | null // "McDonald's"、"Woolworths"
  description: string        // "早餐"、"和同事吃越南粉"
}

Response { records: Transaction[] }   // 允许空数组
```

**分类枚举**（存储用稳定英文 key，显示时映射本地化文案）：

- 支出专用：`FOOD` `TRANSPORT` `SHOPPING` `HOUSING` `DAILY` `ENTERTAINMENT` `MEDICAL` `EDUCATION` `SOCIAL` `SUBSCRIPTION` `TRAVEL`
- 收入专用：`SALARY` `SIDE_INCOME` `INVESTMENT` `REFUND` `GIFT`
- 收支共用：`OTHER`（只有一个 key，方向由 `type` 字段区分）

共 17 个 key。schema 中 `category` 为单一 enum 包含全部 17 项；`type` 与 `category` 的合法组合由运行时校验（Zod）约束，不在 schema 层表达。

### 5.3 四条不可违反的数据规则

**规则一：分类必须是枚举，且在 JSON Schema 的 `enum` 里强制约束，而不是在提示词里请求。**

自由字符串分类会在数月内产生「餐饮 / 食物 / food / 吃饭 / 用餐」这类同义分类爆炸，任何按分类汇总的功能当场报废，且无法回溯修复——无法判断历史数据里的 `food` 和 `餐饮` 是否同一件事。structured output 在解码层面强制枚举，枚举外的值在生成时就不可能出现——这是"结构上不可能出错"，而非"提示它不要出错"。实测 12 条用例、跨 4 个模型均无枚举违规。

> 注意：**枚举保证的是值合法，不保证值正确**。分类选错仍会发生，那由提示词中的分类释义解决（§10.2a）。两者是不同层次的防线，缺一不可。

枚举总数控制在 17 个。过多会降低模型选择准确率。特殊语义由 `merchant` 和 `description` 两个自由文本字段承载。未来支持自定义分类时，把用户自定义项动态注入 enum 即可——这条路不会被当前设计堵死。

**规则二：方向的唯一来源是 `type` 字段，`amount` 永远为正。**

不使用正负号表达收支方向。符号与 `type` 并存会产生两套互相冲突的表达（`type: INCOME` 且 `amount` 为正时下游无法判断信哪个），这类不一致会在数月后变成对不上账的历史数据。

**规则三：金额以整数分存储，绝不以浮点数存储。**

`0.1 + 0.2 !== 0.3`。汇总数百笔后会产生 `$1234.5600000000002`。

AI 返回「元」的数值，入库前立刻 `Math.round(x * 100)` 转整数分。对恰好两位小数的金额此转换可证明正确（经典的 `1.005` 反例是三位小数，不在取值域内），但**必须在 Zod 层校验小数位不超过两位**，越界值拒绝入库并触发重试。

**规则四：`merchant` 必须在客户端归一化后才能入库。**

**实测确认的问题**（2026-09-04）：同一商户会得到不同写法。

```
gemini-3.1-flash-lite:
  「今天早上吃麦当劳花了25块」 → merchant: "McDonald's"
  「早餐麦当劳25」             → merchant: "麦当劳"      ← 同一商户两种写法

gemini-3.5-flash-lite:
  「今天早上吃麦当劳花了25块」 → merchant: "麦当劳"
  「早餐麦当劳25」             → merchant: "麦当劳"      ← 写法一致

qwen/qwen3.8-27b（已选，见 §10.2）:
  「今天早上吃麦当劳花了25块」 → merchant: "麦当劳"
  「早餐麦当劳25」             → merchant: "麦当劳"      ← 写法一致
```

这与规则一的分类同义爆炸是同一类问题，但 `merchant` 是开放集合，无法用枚举约束。不处理的话，"我在麦当劳花了多少钱"这类查询会系统性漏掉一部分记录。

**已选模型表现较好但不能依赖。** Qwen 与 Gemini 3.5 在测试中写法均一致（虽为中文而非官方英文名）——**可预测的偏差比不可预测的正确更容易处理**：一致的中文可用映射表批量规范化，不一致的中英混杂只能靠模糊匹配。但一致性是观察结果而非保证，且更换模型时行为可能不同，**归一化层仍然必需**。

两层解法：

1. **提示词层**：明确要求"有官方英文名的品牌一律使用官方英文写法"。缓解，但不保证。
2. **客户端归一化（必需）**：维护该用户历史出现过的 merchant 列表，新值入库前做模糊匹配并归并到已有值。

第 2 层与 §16 的 STT 偏置词表**共用同一份数据**——用户历史 merchant 列表既用于提升语音听写准确率，也用于保证写法统一。天然个性化，越用越准。

### 5.4 请求上下文注入

每次结构化请求必须携带：

- `localTime` — 用户本地时间（ISO 8601）
- `timeZone` — IANA 时区，取自 `Intl.DateTimeFormat().resolvedOptions().timeZone`
- `defaultCurrency` — 用户档案默认币种（按浏览器 locale 推断，可设置）

**不注入时区会导致跨日边界的账系统性地记错日期**（服务器 UTC，用户在澳洲）。"昨天"、"上周五"、"今天早上"这类相对表达占实际输入的很大比例，没有时间基准无法解析。

---

## 6. 本地存储与读模型

**技术选型：IndexedDB，通过 `idb`（约 1KB 的 Promise 薄封装）访问，只存一个 append-only 的事件 object store。UI 读取的是启动时全量重放出的内存状态。**

### 6.1 依据

事件日志模型把存储需求压缩到只剩两个操作：追加事件、读取全部事件。没有条件查询、没有索引、没有 schema 迁移。

量级测算：一天 10 笔 → 一年 3650 条 → 五年 18250 条，每条事件 JSON 约 200 字节，合计约 3.6 MB。IndexedDB 全量读出 + 内存重放在此规模下 50ms 以内。**在本产品可预见的整个生命周期内，"全部数据放内存"都成立。** 这消除了索引设计、查询优化，以及"物化视图与事件日志不一致"这一整类 bug——UI 永远读到刚从唯一真相源算出的结果。

### 6.2 落选方案

- **Dexie.js** — 价值在查询能力（复合索引、链式过滤、live query），本设计一个查询都不发。25KB 加一套 API 学习成本买一个用不上的功能。未来真需要按索引查询时可平滑切换，数据在 IndexedDB 中原地不动。
- **SQLite WASM + OPFS** — 能力过剩，约 1MB wasm 拖慢首屏，OPFS 在 iOS 上历史行为有反复，且本设计没有任何需要 SQL 的场景。
- **localStorage** — 同步阻塞主线程、5–10MB 上限、只能存字符串，且同样在 ITP 清除名单内。

### 6.3 附加要求

- 启动时调用 `navigator.storage.persist()` 申请持久化存储，避免磁盘压力下被驱逐。
- 调用 `navigator.storage.estimate()`，在设置页显示"本地已用 X MB / 配额 Y MB"。这类产品的用户会想知道自己的数据在哪、有多大。

### 6.4 统计视图

**按周 / 按月，展示各分类金额、可展开看明细、以及总支出。**

**实现上是对内存状态的一次 reduce，不需要任何新基础设施。** 这正是 §6 全量内存重放设计的回报——统计不引入索引、不引入查询层、不引入与事件日志不一致的物化视图。数据量测算见上（五年约 18000 条），按分类聚合在毫秒级。

**四条必须定死的规则：**

1. **按币种分组，绝不跨币种求和。** 单币种用户视觉上就是一个总计，多币种时自然分列。把 AUD 和 USD 加在一起是静默产出错误数字，比不显示更糟。
2. **周与月的边界按用户时区计算**，不按 UTC。时区已在 §5.4 注入链路中可得。周起始日按 locale 推断（`zh` / `en-AU` 均为周一）。
3. **统计只对 `EXPENSE` 求"总支出"**，`INCOME` 单独展示，不做净额抵扣。记账场景中"这个月花了多少"与"净流入多少"是两个问题，混在一个数字里两个都答不好。
4. **统计口径以 `date` 字段为准，不以事件 `createdAt` 为准。** 用户今天补记昨天的账，应计入昨天。二者在离线补录和跨日记账时会分叉。

### 6.6 状态管理：模块级 store + `useSyncExternalStore`

**账本状态本来就活在 React 之外**——它是 IndexedDB 事件日志重放出来的结果。把它塞进 Context 是让 React 托管一份它并不拥有的状态，反而别扭。

```
lib/ledger/store.ts
  let events: Event[]                    // 事件日志（内存副本）
  let ledger: Ledger                     // 重放结果，引用仅在变更时更换
  subscribe(fn)  →  取消订阅函数
  getSnapshot()  →  ledger               // 始终返回同一引用，直到下次 append
  append(event)  →  写 IndexedDB → 重放 → 换引用 → 通知 → 推 Drive
```

组件侧：`const ledger = useSyncExternalStore(subscribe, getSnapshot)`

**零依赖。** `useSyncExternalStore` 正是 React 为"外部状态源"提供的官方接口，这个场景是它的原型用例。

**一条必须遵守的规则：`getSnapshot` 只返回整个 `ledger`，任何派生（筛选、分组、统计）都在组件里用 `useMemo` 做。**

若在 `getSnapshot` 里返回 `ledger.transactions.filter(...)`，每次调用都会产生新数组引用，React 判定状态一直在变，直接进入无限重渲染。这是本模式唯一的坑，但踩上去的表现是页面卡死而非报错，排查成本高——所以写成规则。

> 落选：**Zustand**（本质是同一模式的封装，1.2KB 换掉一条规则，但多一个依赖）；**Context + useReducer**（大状态下重渲染范围难控，需要到处 memo）；**Redux / Jotai**（能力远超所需）。若将来 `useMemo` 派生成为性能瓶颈，切到 Zustand 的 selector 是局部改动，不影响数据层。

### 6.5 账目编辑（统计功能的前提）

**统计使分类错误第一次变得可见且有代价。** 在此之前，错误分类只是列表中一个不起眼的标签；有了分类汇总后，一笔错分类会直接扭曲用户看到的数字——而"分类交给 AI"正是本产品的核心承诺。**用户看到可疑数字却无法查明和修正，信任崩塌得比没有统计更快。**

因此编辑能力不是附加功能，是统计功能成立的前提：

- 最小范围：**修改分类、金额、日期、商户、描述**；删除。
- 数据层已支持——`transaction_amended` / `transaction_deleted` 事件（§5.1），无需改动事件模型。
- 编辑经由**追加事件**表达，不修改历史事件。这保持了 §7 的同步模型不变：编辑同样是各设备写各自的日志文件，仍然无冲突。
- 明细展开处应可直达编辑——用户发现异常数字的位置，就是他要修正的位置。

> **修改分类同时应更新该用户的 merchant 归一化词表**（§5.3 规则四）——用户的手动修正是最高质量的个性化信号，比任何自动推断都准。

---

## 7. 同步

**方案：追加式事件日志，每设备一个独立文件。**

### 机制

每台设备在 Google Drive 的 `appDataFolder` 中写入**仅属于自己的**日志文件 `events-<deviceId>.jsonl`，只追加不修改。同步过程为：下载所有设备的日志文件 → 按 `eventId` 去重合并 → 重放得到当前账本状态。

**设备之间永不写入同一个文件，因此在结构上不存在写冲突，无需任何冲突合并逻辑。** 这是用设计消灭整类 bug，而不是依赖正确实现冲突合并来避免它们。

### 落选方案

- **整库快照 + 时间戳覆盖** — 手机记 3 笔、电脑记 2 笔时，后同步者覆盖先同步者，**静默丢账**。记账应用丢账不可接受，且用户往往数周后才发现。
- **每笔账一个文件** — 概念干净，但 Drive API 调用量随记录数线性增长，配额与延迟都会出问题。

### 已知待办（不影响正确性，可延后）

日志会无限增长，需要压缩机制：超过 N 条时将旧事件折叠为一个 snapshot 事件。延后到实际需要时再做。

### 同步时机

事件写入本地后**尽快**推送到 Drive，不做批量攒批。Drive 上的副本是唯一的数据安全网（见 §8）。

---

## 8. 同步状态与风险预警

### 8.1 平台约束（已查证）

**Safari ITP 的 7 天清除**：iOS/iPadOS 13.4 与 Safari 13.1 起，对所有 script-writable storage 设七天上限。WebKit 官方列出受影响的存储包括 "Indexed DB, LocalStorage, Media keys, SessionStorage, Service Worker registrations and cache"。用户七天未访问该站点，数据被清除。

**主屏幕 PWA 豁免**：官方措辞为 "Web applications added to the home screen are not part of Safari and thus have their own counter of days of use... We do not expect the first-party in such a web application to have its website data deleted."

**主屏幕 PWA 拥有独立存储容器**，与 Safari 不共享。用户先在 Safari 使用、后添加到主屏幕时，PWA 容器初始为空。

**iOS Web Push 必须先安装到主屏幕**（iOS 16.4+），Safari 内不支持。

### 8.2 由约束推出的结论

因为同步默认开启且自动执行，Safari 容器被清空或切换到 PWA 空容器时，重新登录后可从 Drive 拉回数据。**因此 PWA 安装从"数据安全的前提条件"降级为"体验优化"**（优先级 P1，仍然要做）。

**残留风险窗口**：尚未同步成功的事件不受保护。具体路径为「iOS + 未安装 + 离线记账 + 之后 7 天内未在联网状态下打开」。四个条件需同时满足，概率不高，但"出国关漫游记账、回国后十天没打开"是真实场景。

**推送通知在此场景下结构性失效**：受威胁的用户是「iOS + 未安装」，而 Web Push 要求已安装。**能收到丢失预警的用户，恰好是不太需要该预警的用户。** 因此 MVP 不做 Web Push（见 §8.5）。

### 8.3 两类同步失败，紧急度不同

- **A 类 · 授权或 API 失败**（token 失效、用户撤销授权、Drive 配额满、接口错误）。特征是用户完全不知情且不会自愈。**不设时间阈值，立刻显眼提示并引导重新授权。**
- **B 类 · 网络不可用**。用户多半知情，且联网后自愈。按时间分级，不要一断网就报警。

### 8.4 B 类分级

| 未同步时长 | 表现 |
|---|---|
| < 24h | 状态点显示"N 笔待同步"，不打扰 |
| 24–72h | 持久横幅，非模态、不阻塞操作，不可关闭 |
| > 72h | 进入应用弹一次模态，提供两个动作：**重试同步** / **导出备份** |

阈值留足余量（ITP 窗口为 7 个 Safari 使用日），因为用户看到警告后不会立刻行动。

### 8.5 每次记账的状态告知

要求：用户每次记账都清晰知道该笔是否已同步。同时避免警告疲劳——重复且无法行动的警告会被自动过滤，最终等于没有警告，且违背零摩擦原则。

因此把"告知"与"警告"分开，两者都做但形式不同：

1. **每条未同步记录带持久视觉标记** — 账目列表中未同步条目显示空心圆点（已同步为实心）。零打扰，永久可见。
2. **提交后的 toast 内嵌状态** — "已记录 3 笔 · **待同步** · 撤销"。同一个 toast 多一个词，每次记账都明确告知，不增加任何额外打扰。
3. **完整风险说明只在首次进入未同步状态时出现一次**，同一离线会话内不再重复，恢复同步后重置。

### 8.6 文案必须按平台分支

"可能被删除"仅在 **iOS + 未安装** 上为真。已安装的 iOS PWA 有 ITP 豁免；Chrome/Firefox 桌面在 `persist()` 后基本不会被驱逐。

- iOS 未安装 → "可能被 Safari 清除" + 安装引导
- 其他平台 → "尚未备份到云端"

在低风险平台上说"可能被删除"是不准确的，会制造不必要的焦虑，长期会让用户不再相信产品的提示。

### 8.7 逃生舱：一键导出

同步长时间失败时提供"立即导出备份"，下载 JSON 文件到本机。不依赖授权、网络或平台特性。**这是整套预警机制中唯一在最坏情况下仍然有效的部分。**

### 8.8 安装引导时机

检测到「iOS + 未安装 + 有未同步数据」时，将安装引导提升为高优先级——此刻安装可一次性解决 ITP 清除与无法推送两个问题，且用户正处在能听进去的情境中。

---

## 9. 输入管线

```
① 语音：录音（MediaRecorder，WebM/Opus 原样上传）→ POST /api/stt
        → Groq whisper-large-v3-turbo → 文字回填输入框
② 文本：用户直接输入
        ↓
   用户在输入框中确认/编辑
        ↓
   点击提交（按钮立即进入 submitting 状态：disabled + spinner）
        ↓
   在线 → POST /api/structure → Transaction[] → 写入事件日志 → 同步 Drive
   离线 → 写入 raw_input_queued 事件 → 显示"待处理" → 联网后自动补跑
        ↓
   乐观插入 + 可撤销："已记录 3 笔 · 撤销"，数秒后淡出
```

### 音频格式：直传 WebM/Opus，不做任何转换

MediaRecorder 的原生输出直接上传。Groq 接受 `flac / mp3 / mp4 / mpeg / mpga / m4a / ogg / wav / webm`，无需客户端转码。

**15 秒录音：WebM/Opus 约 45KB，16kHz WAV 约 480KB——差 10 倍。** Groq 文档建议转 wav 以降低延迟，但该收益远小于 10 倍上传时间的代价：手机网络上传 480KB 约需 2 秒，而这 2 秒恰好落在**用户必须等待的那一段**（STT 不可被乐观 UI 遮蔽）。

同时省掉了客户端转码代码、CPU 与电量消耗。

> **计费注意：Groq 最低计费时长为 10 秒。** 3 秒录音按 10 秒计费。影响配额测算（§10.7a），不影响成本量级。

> **客户端必须限制录音时长**（建议 60 秒）——见 §10.3a。

### 关键决定

**语音结果回填输入框、由用户确认后提交。** 这使语音降级为"一种快速填写输入框的方式"，而非独立处理管线——语音与文本汇入同一提交入口，AI 侧只需处理一种输入。架构上少了一整条分支。

**不做 debounce，提交即发送。** 原设计的 1 分钟批处理窗口被移除，理由：

- 其原始动机是节省 AI 调用成本，但单次结构化成本实测约 $0.00065（§10.7），本就近乎免费；真正的成本项是 STT，而 debounce 对它毫无帮助（录音已经发生）。
- 已经存在"用户确认后提交"这一显式动作，批处理窗口冗余。
- 默认等待 60 秒直接违背零摩擦第一原则。

**防重复提交用按钮 `submitting` 状态解决**（disabled + spinner），纯前端，无需队列、持久化或崩溃恢复。

**离线队列保留**，但性质不同：debounce 是人为延迟一个本可立即处理的请求（自找的复杂度），离线队列是网络真正不可用时的降级路径（真实约束的应对）。它复用已有事件基础设施，增量很小。

**AI 提取错误的处理：乐观插入 + 可撤销，不强制逐条确认。** 用户说三笔而 AI 提取两笔的情况会发生。强制确认能保证准确但直接违背零摩擦。错误率低时不打扰，出错时一键退回。

---

## 10. AI Gateway

### 10.1 Grounding with Google Search 必须关闭

**已查证的定价**（Gemini API）：

- Gemini 3.1 Flash-Lite：输入 $0.25 / 1M tokens，输出 $1.50 / 1M tokens
- Grounding with Google Search：每月 5,000 次免费（Gemini 3.x 各模型共享），之后 **$14 / 1,000 次**

**若将来切换到 Gemini，必须显式关闭 Grounding。** 单次记账开启后约 $0.0142、关闭约 $0.0002——**34 倍成本换零收益**：把「今天麦当劳25块」变成 JSON 不需要联网搜索任何事实。此外它增加一次搜索往返延迟，并**会把用户的消费描述变成搜索查询发送出去**，与隐私定位正面冲突。

注：Gemini 3 已支持 structured output 与 grounding 共存（早期版本返回 400 `Search Grounding can't be used with JSON/YAML/XML mode`），所以这不是技术限制，是成本与隐私决定。

> 当前选定的 Groq 不存在此开关，本节仅为更换 provider 时的检查项。

### 10.2 结构化模型：Groq `qwen/qwen3.8-27b`

**选定：Groq `qwen/qwen3.8-27b`，`temperature=0`，`reasoning_effort='none'`，strict 结构化输出。**

实测对比（2026-09-04，同一组 12 条用例）：

| 模型 | 平均延迟 | 结果 | 备注 |
|---|---|---|---|
| **`qwen/qwen3.8-27b`（Groq，含分类释义）** | **250ms** | **12/12** | 选定 |
| `gemini-3.5-flash-lite` | 1035ms | 10/12 | currency 多填、merchant 中文 |
| `openai/gpt-oss-120b`（Groq） | 1084ms | 分类全对 | `7.5刀`→USD 错、description 混英文、token 消耗 5 倍 |
| `openai/gpt-oss-20b`（Groq） | 858ms | 分类全对 | 同上，且「上周五」算成 08-26（错） |
| `gemini-3.1-flash-lite` + `thinkingLevel: LOW` | 2372ms | — | 起点基线 |

**Qwen 有两处优于 Gemini**：`今天 Uber Eats 花了32` 的 currency 正确留空（Gemini 自作主张填 AUD）；一句两笔房租的 description 有区分（「上个月房租」/「这个月房租」）。稳定性经三次重跑确认。

**gpt-oss 系列慢的原因**：它们是推理模型，out=354 tokens 而实际 JSON 仅约 60——近 290 token 花在思考上。

**收益不只是延迟。** 供应商收敛到 Groq 一家（STT 与结构化共用一个 key、一份数据条款、一处配额），且 Groq 的数据条款优于 Gemini 免费层（见 §10.4b）。

### 10.2a 分类释义是必需的，不是可选优化

**未提供分类释义时 Qwen 出现分类错误：**

```
Woolworths 买菜五十四块三  →  category: GIFT    ❌
昨晚和John吃饭，一共86     →  category: DAILY   ⚠️
```

补入分类释义后两条均修正为 `FOOD`，且延迟未增加（233ms → 250ms，在噪声范围内），代价仅为 input token 从 327 增至 497。

**分类错误是这一层最严重的失败类型**——产品的核心承诺是"分类交给 AI"，把买菜归入"礼金"是用户一眼可见的荒谬，直接击穿该承诺。相较之下 Gemini 的 currency 多填（用户不可见）和 merchant 中文（一致、可批量规范化）都是无害的。

系统提示词必须包含全部 17 个分类的简短中文释义。**这不是调优，是正确性要求。**

> 注：Gemini 不需要释义即可正确分类（能从英文 key 名推断）。此差异是模型相关的——**更换结构化模型时必须重跑分类用例**，不能假定释义可省略。

### 10.2b Groq strict 模式的 schema 要求

与 Gemini 的 `responseSchema` 不同，Groq 的 `response_format: {type:'json_schema', json_schema:{strict:true}}` 要求：

- **所有字段必须列入 `required`**（包括可空字段）
- **所有对象必须 `additionalProperties: false`**
- **可空字段用联合类型** `{"type": ["string", "null"]}`，不能用 `nullable`
- **不支持流式**（本设计不需要）

同一份 Zod 定义派生两套 schema 时，这些差异必须由适配器吸收（见 §10.3）。

### 10.2c 网络地板

澳洲到海外推理端点的 RTT 中位约 244ms（实测 Google 端点）。**这意味着 250ms 的实测延迟已接近网络下限**——结构化这一层几乎没有进一步优化空间，除非供应商在澳洲有机房。

### 10.3 Provider 抽象

**抽象的核心价值不是"支持多个 provider"，而是"账目结构只有一处定义"。**

用 Zod 定义一次 `Transaction`，由它派生：Groq 的 `json_schema`、将来其他 provider 的等价格式、以及入库前的运行时校验。加一个 provider 只需写一个适配器，而**分类枚举、字段、约束永远不会在两处漂移**。

接口：

```
structure(text: string, ctx: { localTime, timeZone, defaultCurrency }) → Transaction[]
```

**MVP 不做 fallback，只接 Groq 一家。** 失败时向用户报错并允许重试。

**接受的代价**：Groq 故障时记账功能不可用（查看历史仍然可用——本地优先，见 §11.4）。10 用户规模下容错要求低，且少一套适配器与降级逻辑。此取舍记入 §15。

**但可替换性必须在第一天就做对——这与"只接一家"不矛盾。**

抽象的价值不在于预置多个实现，而在于**接缝的位置**。第二个适配器在需要时是半天的工作量，**前提是第一个没有把 provider 细节漏到业务层**。反过来，现在就为假想中的 N 个 provider 建插件系统，是拿真实的复杂度换猜测中的灵活性。

**四条使换 provider 保持廉价的规则：**

1. **单一 Zod 定义是唯一真相源。** `Transaction`、分类枚举、校验规则只定义一次，各 provider 的 schema 格式由它派生。这是抽象真正买到的东西——分类枚举永远不会在两处漂移。
2. **业务层只见两个窄接口：**
   ```
   transcribe(audio: Blob, vocab: string[]) → { text: string }
   structure(text: string, ctx: Context)    → Transaction[]
   ```
   不见 provider 名、不见 HTTP、不见 schema 格式差异。
3. **provider 特有参数全部封在适配器内。** `language=zh`、`prompt` 词表、`strict: true`、`additionalProperties: false`、`reasoning_effort` —— 这些是 Groq 的实现细节，不是接口的一部分。
4. **提示词是共享资产，不属于任何适配器。** 分类释义（§10.2a）、上下文注入格式（§5.4）对所有 provider 相同。适配器只做格式转换，不改语义。

**可执行的判据**（比"要有良好的抽象"有用）：

> **`grep -ri "groq" src/` 的结果应当只出现在 `lib/ai/providers/groq.ts` 一个文件中。**
> 若 provider 名、模型 ID 或任何 provider 特有参数出现在别处，接缝就漏了。

**运行时校验必须在适配器之外**（§10.4）——无论换成哪个 provider，返回值都过同一个 Zod 校验。这样更换 provider 不会连带降低数据质量保障。

> 已知的 provider 差异（供将来写第二个适配器时参考）：Groq 用 `response_format: {type:'json_schema', strict:true}` 且要求全字段 `required` + `additionalProperties:false` + 联合类型表达可空（§10.2b）；Gemini 用 `responseSchema` 且支持 `nullable`。分类释义对 Groq 必需、对 Gemini 可省（§10.2a）——**换模型时必须重跑分类用例**。

### 10.3a 用户量增长的可扩展性

**最大的结构性优势已经在设计里：账本数据不存后端。**

用户量增长**不增加后端存储**——后端每个用户只有一行记录（§11.5），账本全部在用户设备与其自有 Drive 中。10 万用户 = 10 万行 Postgres。这是本设计相对传统记账 SaaS 的根本差异，也意味着**存储永远不会是瓶颈**。

**真正的瓶颈是 AI 配额与成本，不是服务器。**

后端只做认证、代理、令牌兑换，极轻，2 OCPU 绰绰有余。而 AI 成本随调用量**线性增长且无规模效应**——因此：

> **per-user 配额不是可选功能，是成本控制的唯一手段。** 单个失控用户（脚本、误用、恶意）即可吃掉全部预算。

**必须为增长准备的三件事**（不是过度设计，是必然会遇到的）：

1. **429 重试与指数退避。** Groq 的 TPM 限流是常态而非异常——免费层 8000 TPM，12 条连跑即触发（§10.7a）。适配器内必须处理，不能让限流冒泡成用户可见的失败。
2. **客户端录音时长上限**（建议 60 秒）。Groq 免费层单文件上限 25MB，但真正要防的是用户录十分钟把音频秒数配额一次吃光。**在客户端限制比在服务端拒绝更省带宽。**
3. **后端保持无状态。** Session 用 JWT 或 Postgres，**不要用内存 session、本地文件缓存或任何绑定单实例的状态**。单 VM 当前不需要水平扩展，但引入实例状态会在需要时堵死这条路——而这类耦合事后拆除的代价远高于一开始就避免。

**先出现的物理瓶颈是出口带宽（音频上传），不是 CPU。** 这也是 §9 选择直传 WebM/Opus 而非转 WAV 的另一重理由。

### 10.4 运行时校验是必需的

即使使用 structured output，返回值仍必须通过 Zod 校验才能入库。原因：适配器可能有 bug、provider 可能变更行为、将来更换的模型能力可能不同。这是数据质量的最后防线，成本几乎为零。

### 10.4b 各 provider 的数据条款（已查证）

用户的消费描述与语音会经过本服务发送给 AI provider（见 §4 措辞纪律）。因此**每接入一个 provider 都必须单独确认其数据条款，不可假定一致**。

**Groq（STT + 结构化，主用）：**

> "Groq does not access, use, store, or retain Inputs or Outputs except as necessary to provide the Cloud Services, in accordance with the Customer's permission or instruction, comply with applicable law, ensure the reliable operation of the Cloud Services, or confirm Customer's compliance with the AUP."
>
> "By default, Groq does not retain customer data for inference requests."
>
> "All customers may enable Zero Data Retention (ZDR) in Data Controls settings."

默认不保留推理数据；为可靠性与滥用监控可保留至多 30 天；**ZDR 对所有客户开放**。

> **生产必做动作：在 Groq 控制台 Data Controls 中开启 Zero Data Retention。** 与「OAuth 应用发布到 In production」「Oracle 账号升级 PAYG」同属"不是写代码、但漏掉就出事"的一类。

**Gemini（已评估，未采用——供将来更换 provider 时参考）：**

免费层明确将内容用于训练且人工可读——"Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services"，以及 "Human reviewers may read, annotate, and process your API input and output"。付费层则为 "Google doesn't use your prompts...or responses to improve our products"。

> **若将来切换到 Gemini，必须同时绑定付费账单。** 免费层不可用于本产品——一次调用就足以把用户的消费记录送进训练集。

**结论：Groq（开启 ZDR）的隐私姿态优于 Gemini 免费层，与 Gemini 付费层相当或更好。** 这与延迟、供应商收敛一并支持 §10.2 的选型。

**接入任何新 provider 前，必须先完成同等的条款查证。** 这是 §10.3 换 provider 流程中不可省略的一步——技术适配只要半天，条款不合规则整条路走不通。

### 10.5 零内容日志（隐私承诺的技术落实）

日志只记录 `userId`、模型名、token 数、耗时、成功/失败、错误类型。**永不记录 prompt 与 response 的内容。**

需在代码中显式实现——默认的 HTTP 日志中间件会记录 request body。这是最容易在某次调试时被临时打开、然后忘记关掉的东西，因此列为硬性要求。

### 10.6 提示词纪律

系统提示词**只讲抽取规则，不讲输出格式**。格式由 structured output 的 schema 单独负责（Groq 为 `response_format.json_schema`）。

在 structured output 模式下，提示词中关于"输出 JSON 数组"、"不要包含 markdown 标记"等描述不仅多余，而且若与 schema 不一致会形成互相冲突的指令，实测会降低抽取准确率——这是一种不报错、只是悄悄变差的降级。

提示词必须明确说明：**输入中不含账目信息时返回空数组**，不得凭空编造账目。

**提示词必须包含全部 17 个分类的简短中文释义**，理由与实测见 §10.2a——这是正确性要求而非调优。释义对 Qwen 必需；实测 Gemini 不需要即可正确分类，但**更换模型时必须重跑分类用例**，不可假定可省。

### 10.7 成本预估

**单次结构化成本实测**（2026-09-04，12 条用例）：

| | token 用量 | 单价（每 1M） | 单次成本 | 45,000 次/月 |
|---|---|---|---|---|
| **Groq `qwen3.8-27b`（选定）** | in 497 / out 63 | $0.80 / $4.00 | **$0.000650** | **$29** |
| `gemini-3.5-flash-lite`（已评估未采用，仅作对照） | in 328 / out 81 | $0.25 / $1.50 | $0.000203 | $9 |

Groq 贵 3.2 倍，月度绝对差额约 $20——换来延迟 1035ms → 250ms、供应商收敛、更优的数据条款。在这个量级上不构成决策因素。

**300 用户规模合计**：结构化约 $29/月 + STT 约 $4.5/月（$0.04/小时 × 112.5 小时）= **约 $34/月**，VM 为免费额度。运营成本基本可忽略。

### 10.7a 小规模阶段（约 10 用户）的额度与条款

**实测的 Groq 免费层限额**（读自响应头，非文档推测）：

| 模型 | 请求上限 | 其他 |
|---|---|---|
| `qwen/qwen3.8-27b` | 1000 | 8000 TPM |
| `whisper-large-v3-turbo` | 2000 | 7200 音频秒 |

10 用户 × 5 次/天的实际占用：结构化 50 次（**5%**）、STT 750 音频秒（**10%**）。

**免费额度绰绰有余。** 瓶颈是 STT 音频秒数，按此用法约 **96 个用户**才会撑满。

**但配额不是这一阶段的决定因素，数据条款才是。**

- **Groq 免费层大概率可用**——默认不保留推理数据、不用于训练。待确认：ZDR 是否覆盖免费层（文档称 "All customers may enable ZDR"，但未明示层级，需在控制台核实）。
- **Gemini 免费层不可用，"用户少"不构成豁免。** 它明确将内容用于训练且人工可读。早期用户多为熟人，把他们的消费记录送入训练集属于必须事先告知并取得同意的事项，与规模无关。

**已决定：不接 Gemini，不做 fallback**（§10.3）。Groq 失败时直接报错并允许重试。这同时消除了上述风险——不存在"某次调用悄悄走到了会训练数据的 provider"这种情况。

**规模上去后免费额度不够**：STT 的 7200 音频秒是先撞上的天花板，约 96 用户即满（按每人每天 5 次 × 15 秒计）。结构化的 1000 请求/天约在 200 用户处撞线。**届时需绑定付费账单**——这与 ZDR 无关，ZDR 在免费层同样可用（待 §17 第 2 项确认）。

---

## 11. 认证与令牌流

### 11.1 已查证的约束

**`drive.appdata` 是非敏感（non-sensitive）scope**，与 `drive.file` 同列于 Drive API 文档的 "Non-sensitive scopes" 表。不需要敏感/受限 scope 的审核流程，不需要演示视频，不需要 CASA 第三方安全评估（官方明确安全评估 "For restricted scopes only"）。

**未验证也可服务无限用户。** 官方 app state 表：Published + External + Unverified 状态下 "Any Google user can access"，仅"应用名与 Logo 不在同意页显示"；100 人硬上限与危险警告 UI **仅适用于请求敏感或受限 scope 的应用**。本应用全部 scope 为非敏感，不受此限。

**真正的陷阱是停留在 Testing 状态**：Testing 有 100 人硬上限，且**每个用户的授权 7 天后过期**——对记账应用意味着用户每周被踢出登录一次。

> **必须执行的动作**：在 Google Cloud 控制台将应用 Publish 到 In production。这不是"通过审核"，是一个按钮。

Brand verification（仅在希望同意页显示应用名与 Logo 时需要）要求：自有已验证域名上的主页、主页说明功能（不能只是登录页）、隐私政策链接、Search Console 域名所有权验证、符合 Google 品牌规范。

### 11.2 Scope 与授权方式

**一次性请求全部 scope**（`openid` `email` `profile` `drive.appdata`），不使用增量授权。

理由：同步默认开启且为必需功能，增量授权会凭空制造"已登录但未授权 Drive"的中间状态——用户拒绝后应用能否使用？数据存哪？能否再次询问？这一整类边界情况在本产品中本不应存在。一次性请求等于删除一整个状态机。（原本推荐增量授权是为规避 OAuth 审核风险，查证后该风险不存在。）

### 11.3 令牌流

**不变的地基：账本内容永远由浏览器直接发往 Google Drive，绝不流经后端。**

**已选方案：后端持有 refresh token，仅做令牌兑换。**

```
后端完成 authorization code flow → 加密存储 refresh token（Postgres）
前端需要同步时 → POST /api/drive-token → 后端用 refresh token 换取短期 access token
前端拿 access token → 直接调用 Drive API
```

**落选方案：纯前端令牌。** GIS 的 token model 不向浏览器提供 refresh token，官方文档说明续期方式是 "obtain a new token by calling `requestAccessToken()` from a user-driven event such as a button press"。access token 一小时过期，静默续期依赖 Google 在第三方上下文中的 cookie，而 Safari ITP 恰好封锁此路径——**最需要自动同步兜底的 iOS 用户，正是静默续期最易失败的那批**。后台自动同步会不定期中断，与 §8 论证的"自动同步是数据安全唯一兜底"直接冲突。

**必须诚实披露的代价**：后端**有能力**读取用户的 appDataFolder，只是不这么做。该能力边界明确且有限——`drive.appdata` scope 只能访问本应用自己创建的数据，**无法触碰用户 Drive 中的任何其他文件**。

对用户的表述（每个字都必须为真）：

> 我们持有一把只能打开本应用自己数据格子的钥匙，但从不使用它；你的账单从不经过我们的服务器。

此表述须写入隐私政策。

### 11.4 降级策略

**本地读写永不因登录或网络状态而阻塞。** 登录仅用于两件事：调用 AI、同步 Drive。

- 离线时：可查看全部历史记录；新输入存为 `raw_input_queued` 事件并显示"待处理"，联网后自动补跑 AI 结构化。
- 授权失效时：本地功能继续可用，显眼提示重新授权（A 类失败，见 §8.3）。

**固有约束**：结构化依赖 AI，AI 依赖网络，因此离线时无法产生结构化账目。离线队列是对此约束的缓解，不是消除。

### 11.5 用户表与配额

后端存储的全部内容（Prisma schema，见 §12.5）：

```
User
  id
  googleSub         @unique  -- 身份主键：稳定的 Google subject identifier
  email                      -- 仅供展示与联系，可空，无 @unique
  refreshTokenEnc            -- 加密存储
  createdAt
  lastLoginAt
  aiCallsToday
  lastResetDate
```

**`googleSub` 是唯一的身份依据，`email` 不是。** Google 账户的邮箱可以变更，`sub` 不会。所有"这是哪个用户"的判断一律走 `googleSub`。

关于 `email` 字段的两条硬性要求：

1. **绝不加 `@unique` 约束。** 邮箱地址可以在 Google 账户之间转移（企业账户回收、域名变更等），加唯一约束会在某天造成登录失败——而那时故障现象会指向登录流程，很难联想到是一条几年前加的约束。
2. **每次登录时用 ID token 里的值覆盖写入**，而不是首次创建时写一次。否则用户改了 Google 邮箱之后，你库里存的是个过期地址——而这个字段的用途恰恰是联系用户。

用途限定为展示（"当前登录为 xxx"）与必要时的联系。**它不参与任何鉴权判断。**

> 如果将来还需要显示名或头像，它们来自同一个 ID token（`name` / `picture`），按同样的规则处理：每次登录刷新、不做唯一约束、不参与鉴权。

每次 AI 调用前检查配额，超限返回明确错误而非静默失败。这是唯一需要在服务端保存的行为相关数据。

---

## 12. 部署

### 12.1 目标环境

Oracle Cloud VM（`158.179.25.78`），ARM64 Ampere A1，Ubuntu，23GB RAM / 97GB 磁盘。Docker + Compose。已运行 roster-creator、portfolio、AI_LLM_RAG 三个应用。

> **必须执行的动作**：将 Oracle 账号升级为 Pay As You Go。Always Free 实例在连续 7 天内 CPU 95 分位 <20%、网络 <20%、内存 <20%（A1 机型）三条同时满足时**可能被回收**——本应用的低频负载几乎必然满足该条件。升级后 Always Free 资源仍不收费（仅对超出部分计费），且回收政策不再适用。这是一步操作、$0 成本，但不做的后果是应用某天凭空消失。

### 12.2 服务命名（规避已知雷区）

服务名 **`justsayit-web`**，并在 `edge` 网络上显式声明 `aliases: [justsayit-web]`。**不使用任何通用名。**

背景：现有 roster-creator 的 `frontend` / `backend` 是共享 `edge` 网络上的通用别名，此前已被标记为"landmine, not a live bug"，结论是"在第四个 app 加入前值得改名"。**JustSayIt 就是第四个 app。** 本项目不引爆该雷；roster-creator 自身的改名建议单独处理，不并入本项目范围。

### 12.3 接入现有边缘代理

沿用现有模式，不新增反向代理：

1. 仓库内 `deploy/justsayit.caddy`：`reverse_proxy justsayit-web:3000`
2. CI 将其 SCP 到 `/opt/edge-proxy/sites-enabled/justsayit.caddy`
3. SSH 执行：`caddy validate` → 通过则 `git add` 该单个文件 → 条件 commit → `docker exec edge-proxy caddy reload`
4. 校验失败则回滚该片段并让本仓库 CI 报错

应用容器加入外部 `edge` 网络。**不得绑定宿主机 80/443**——该端口由 `/opt/edge-proxy` 独占。

域名：`justsayit.taoxiong.site`。根域 `taoxiong.site` 继续保留。

### 12.4 CI/CD

沿用现有三个仓库的模式：GitHub Actions → 构建 arm64 镜像 → 推送 `ghcr.io/taoxiong05/justsayit` → SSH 到 VM 执行 `docker compose pull && up -d`。

**arm64 硬性要求**：GitHub 托管 runner 为 amd64，镜像构建必须包含 `docker/setup-qemu-action` 且指定 `platforms: linux/arm64`，否则服务器 `docker compose pull` 失败并报 `no matching manifest for linux/arm64/v8`。

新建独立的 `justsayit_deploy_key`，**不复用其他仓库的 key**（一个仓库的 CI key 泄露不应波及其他项目）。部署用户为 `deploy`（docker 组、无 sudo、拥有 `/opt/*`）。

Next.js 使用 `output: 'standalone'` 压缩镜像体积。

### 12.5 数据库：Postgres + Prisma（Rust-free 客户端）

**ORM 为 Prisma**，schema 即代码、迁移可追溯，且与本机器上 roster-creator 已验证的模式一致（容器启动时执行 `prisma migrate deploy`）。

**必须使用 Rust-free 的 Prisma 客户端**，即通过驱动适配器（`@prisma/adapter-pg`）而非 Rust 查询引擎。官方已宣布该模式生产就绪，可从 `previewFeatures` 中移除 `queryCompiler` / `driverAdapter` 标志，并**删除 `binaryTargets` 配置**。

这一选择消除了两个在 arm64 + Next.js standalone 组合下极常见的部署故障：

1. `Error: Prisma Client could not locate the Query Engine for runtime "linux-arm64-openssl-3.0.x"` —— 引擎二进制平台不匹配。Rust-free 客户端根本不存在引擎二进制。
2. Next.js `output: 'standalone'` 不会自动把 Prisma 引擎与 `schema.prisma` 复制进产物，需要在 Dockerfile 里手动 copy。同样随引擎消失而消失。

**为什么是 Postgres 而不是 SQLite。** 数据量本身（见 §11.5，几百行、单写入者）用 SQLite 完全够。但在 Rust-free Prisma 的前提下权衡发生了翻转：`@prisma/adapter-pg` 依赖的 `pg` 是纯 JavaScript，**Postgres 路径在整个构建过程中零原生模块**；而 SQLite 路径仍需 `better-sqlite3` 这个原生模块（虽有 arm64 预编译包，但在 QEMU 交叉构建下仍是风险点）。"多一个容器"在 23GB 内存的机器上是无关紧要的成本，而"构建时不需要编译任何东西"是实打实的可靠性收益。

Postgres 数据挂载 volume 持久化。

> 待补：本机器上现有 Postgres 实例均无备份（已知缺口）。本项目应配置 `pg_dump` 定时备份，不要沿袭这个缺口。

### 12.6 密钥

`GROQ_API_KEY`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`DATABASE_URL`、session 密钥、refresh token 加密密钥。经 GitHub Actions secrets 注入，VM 上以 `deploy` 拥有、权限 600 的 `.env` 文件保存。

**refresh token 加密密钥与 `DATABASE_URL` 必须分离管理**——两者同时泄露才能解出用户的 Drive 凭证。

---

## 13. 前端架构与信息架构

本节确定的是**屏幕划分、导航、目录结构与 Service Worker 策略**——它们会渗透进每个文件，事后调整成本高。**视觉设计（配色、字体、间距、动效）刻意不在此确定**，留到有可运行版本、能对着真实数据调整时再做。

### 13.1 屏幕清单与导航

MVP 的八项功能收敛为**四个屏幕**：

```
┌─ 登录页 ───────────────────────────────┐
│  Google 登录（唯一入口，强制）           │
└────────────────────────────────────────┘
              ↓ 首次授权后不再出现

┌─ 主屏「记账」 ─────────────────────────┐   ┌─ 统计 ──────────────┐
│  [同步状态点]              [头像]→设置  │   │  ◀ 本周 / 本月 ▶     │
│                                        │   │                     │
│  ── 今天 ──────────────                │   │  餐饮      $186  ▸  │
│  ○ McDonald's   早餐      -$25         │   │  交通       $95  ▸  │
│  ● Woolworths   买菜      -$54.30      │   │  医疗       $19  ▸  │
│  ── 昨天 ──────────────                │   │  ─────────────────  │
│  ● Uber Eats    外卖      -$32         │   │  总支出    $300     │
│                                        │   │  收入     $5000     │
│  ┌────────────────────────────────┐    │   └─────────────────────┘
│  │ 说点什么…            🎙️  提交 │    │
│  └────────────────────────────────┘    │   ┌─ 设置 ──────────────┐
└────────────────────────────────────────┘   │  账号 / 登出         │
   ┌──────────┬──────────┐                   │  本地已用 X MB       │
   │  记账 ●  │   统计   │  ← 底部两个 tab    │  导出备份            │
   └──────────┴──────────┘                   │  安装到主屏幕        │
                                             └─────────────────────┘
```

**四条决定及其理由：**

1. **输入区固定在主屏底部，不是独立页面、不是弹窗。** 核心原则是"打开即可记账"（§2）。任何需要先点一下才出现输入框的设计都违背它。底部同时是拇指可达区。

2. **底部只有两个 tab（记账 / 统计），设置从头像进。** 设置里全是低频操作（登出、看存储、导出、安装引导），不值得占据一个永久 tab。三 tab 会让主操作的视觉权重被稀释。

3. **同步状态点在主屏左上角，全局唯一一处。** §8.5 要求状态永久可见但零打扰——一个点加一个数字（"3 笔待同步"）足够，不需要横幅常驻。分级预警（§8.4）在超过阈值时才叠加横幅或模态。

4. **统计是独立页而非主屏下拉。** 二者的时间尺度不同：主屏看的是"刚才记的"，统计看的是"这一周/月"。混在一个滚动流里，用户每次记完账都要滚过统计区才看到历史，而记账后最想确认的是"刚才那笔对不对"。

### 13.2 编辑交互：行内展开，不用模态

点击任意账目行，**在原位展开为可编辑表单**，不弹出模态。

- **保持上下文。** 用户是在扫视列表时发现异常的（"这笔怎么在娱乐里"），模态会遮住让他产生怀疑的那些相邻行。
- **移动端上，为改一个分类而全屏接管是过重的交互。**
- **统计页展开的明细行与主屏列表行是同一个组件**，编辑行为完全一致。用户从统计发现异常 → 展开明细 → 就地修正，全程不跳转、不失去上下文。这条链路是统计功能价值的核心（§6.5）。

可编辑字段：分类、金额、日期、商户、描述；以及删除。

### 13.3 目录结构

结构本身要能支撑 §10.3 那条可执行判据——`grep -ri "groq" src/` 只应命中一个文件。

```
src/
  app/                          Next.js App Router
    page.tsx                    主屏「记账」
    stats/page.tsx              统计
    settings/page.tsx           设置
    login/page.tsx              登录
    api/
      auth/[...nextauth]/       Google OAuth
      stt/route.ts              → lib/ai.transcribe()
      structure/route.ts        → lib/ai.structure()
      drive-token/route.ts      refresh token → 短期 access token

  lib/
    ai/
      schema.ts                 ★ Zod 唯一真相源：Transaction、17 个分类枚举
      prompt.ts                 系统提示词（含分类释义）—— 共享资产，不属于任何 provider
      index.ts                  ★ 两个窄接口：transcribe() / structure()
      providers/
        groq.ts                 ★ 唯一允许出现 "groq"、模型 ID、provider 参数的文件

    ledger/
      events.ts                 事件类型与 schemaVersion
      db.ts                     IndexedDB（idb）—— 只做 append / readAll
      replay.ts                 事件序列 → 账本状态
      store.ts                  内存 store + useSyncExternalStore（§6.6）
      normalize.ts              merchant 归一化（§5.3 规则四）
      stats.ts                  按周/月分类聚合（§6.4）

    sync/
      drive.ts                  appDataFolder 读写（浏览器直连 Google）
      status.ts                 同步状态机与分级预警（§8.3–8.4）

    server/                     仅服务端，永不进客户端 bundle
      db.ts                     Prisma client
      quota.ts                  per-user AI 配额
      crypto.ts                 refresh token 加解密

  components/                   列表行、输入区、统计卡片等
```

**三条结构性约束：**

- **`lib/ai/schema.ts` 是分类枚举与 `Transaction` 的唯一定义处。** 前端校验、provider schema、Prisma（若将来需要）全部由它派生。
- **`lib/server/` 下的模块永不被客户端代码 import。** 越界会把 Prisma 和加密密钥打进浏览器 bundle。
- **API route 只做三件事**：鉴权、配额检查、调用 `lib/ai` 的窄接口。**不含任何 provider 细节**。

### 13.4 Service Worker：只缓存外壳，绝不碰数据

**硬性规则：Service Worker 不缓存任何 API 响应或账本数据。**

数据层已经有完整的离线能力——IndexedDB 事件日志 + 离线队列（§9、§11.4）。SW 若再缓存一层 `/api/*`，就会出现**两个互相不知道对方存在的真相源**，而这类 bug 表现为"数据时有时无"，极难排查。

职责边界：

| | SW 负责 | 数据层负责 |
|---|---|---|
| 应用外壳（HTML/JS/CSS/图标） | ✅ 预缓存 | — |
| 账本数据 | ❌ 绝不接触 | IndexedDB + 事件日志 |
| `/api/*` | ❌ network-only，不缓存 | 离线队列 |

**为什么仍然需要 SW**：Chrome/Android 的可安装性判定要求存在带 fetch 处理器的 SW。而 PWA 安装是 §8.8 的既定要求（iOS 上还额外解决 ITP 清除问题）。

实现用 **Serwist**（`next-pwa` 的维护继任者，支持 App Router），配置仅需：预缓存构建产物、导航请求 network-first 回退到缓存的外壳、`/api/*` 排除在外。

> 手写 SW 也可行（逻辑只有约 30 行），但 App Router 的产物哈希使预缓存清单需要构建期生成，这正是 Serwist 提供的部分。

---

## 14. 平台约束查证记录

本设计中若干决定依赖以下已核实的外部事实。这些事实由第三方控制，可能变更，重新评估相关决定时应先复核。

| 事实 | 来源 |
|---|---|
| `drive.appdata` 为非敏感 scope；安全评估仅适用于受限 scope | [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) · [Verification requirements](https://support.google.com/cloud/answer/13464321) |
| Published+Unverified 无用户上限（非敏感 scope）；Testing 有 100 人上限且授权 7 天过期 | [OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) · [Manage App Audience](https://support.google.com/cloud/answer/15549945) |
| GIS token model 不提供浏览器端 refresh token，续期需用户交互 | [Use the token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model) |
| Safari ITP 7 天清除 script-writable storage；主屏幕 PWA 豁免 | [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) · [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/) |
| iOS Web Push 要求已安装到主屏幕（16.4+），Safari 内不支持 | [Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) |
| Gemini 3.1 Flash-Lite 与 Grounding 定价 | [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Gemini 3 支持 structured output 与 grounding 共存 | [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) |
| Gemini API 免费层将内容用于训练且人工可读；付费层不用于训练 | [Gemini API 附加条款](https://ai.google.dev/gemini-api/terms) |
| Gemini 音频按 32 tokens/秒计费（1 分钟 = 1,920 tokens） | [Audio understanding](https://ai.google.dev/gemini-api/docs/audio) |
| Oracle Always Free 闲置回收阈值；升级 PAYG 后不适用 | [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) |
| Rust-free Prisma ORM 已生产就绪，不再需要 `binaryTargets` 与引擎二进制 | [Rust-free Prisma ORM is Ready for Production](https://www.prisma.io/blog/rust-free-prisma-orm-is-ready-for-production) · [v6.9.0 changelog](https://www.prisma.io/changelog/2025-06-05) |

---

## 15. 已知取舍与延后事项

**有意接受的取舍：**

- **不做 AI provider fallback**（仅接 Groq）。Groq 故障时无法记新账，查看历史不受影响。换取少一套适配器与降级逻辑。可替换性由 §10.3 的接缝规则保证，而非由预置多个实现保证。

- 后端在技术上有能力读取用户 appDataFolder（换取可靠的后台自动同步）。边界有限，须在隐私政策中如实披露。
- 离线时无法产生结构化账目（AI 依赖网络）。以离线队列缓解。
- 分类为固定枚举，用户暂无法自定义。特殊语义由 `merchant` / `description` 承载。
- 「iOS + 未安装 + 离线记账 + 7 天未联网打开」时未同步事件可能丢失。以分级预警与一键导出缓解。

**明确延后：**

- 事件日志压缩（snapshot 折叠）——延后到日志规模实际造成问题时
- Web Push——延后到有真实用户反馈需要时
- 自定义分类（动态注入 enum，路径已预留）
- AI provider 按成本智能路由——需先有真实成本与质量数据
- 付费/订阅系统

**不属于本项目但已记录：**

- roster-creator 的 `frontend` / `backend` 通用服务别名建议改名（本项目已通过命名规避，未引爆）

---

## 16. STT 选型与验证记录

### 16.1 候选方案（2026-09-04 查证）

| 方案 | $/小时音频 | 关键能力 |
|---|---|---|
| Deepgram Nova-3 | 待确认 | **已实测（§16.5b）**。必须用 `language=zh`，`multi` 对中文不可用。keyterm 偏置最多 100 词 / 500 tokens。返回置信度。商户名错拼但可恢复 |
| **Groq Whisper Large V3 Turbo（选定）** | **$0.04** | **已实测选定（§16.5c）**。`language=zh` + `prompt` 词表，实测 ~180ms，准确率/延迟/成本三项最优 |
| Gemini 3.1 Flash-Lite 音频 | ~$0.058 | 32 tokens/秒 × $0.50/1M。已在技术栈内，无需新增 provider |
| **`gemini-3.5-transcribe`（REST）** | 待确认 | **专用转写模型，已初步验证（见 §16.5）**。普通 `generateContent` 调用，无需 WebSocket。`languageCodes: []` 自动语言检测，官方声明支持 code-switching。免费层 3 RPM / 25 RPD，仅够冒烟测试 |
| `gemini-3.5-transcribe-live`（WebSocket） | 待确认 | 输出与 REST 版逐字相同，但支持边说边出字。**不进 MVP**，列为后续升级项 |
| ~~`gemini-3.1-flash-live-preview`~~ | — | **已排除**：不支持 TEXT 响应模态，只输出音频 |
| Groq Whisper Large V3 | $0.111 | 189x 实时，WER 10.3% |
| Speechmatics Melia 1 | $0.129 | **原生 code-switching**，无需指定语言；仅批处理；$100 免费额度 |
| ElevenLabs Scribe v2 | $0.22（+$0.05 keyterm） | 多语种准确率领先 |

**自建 whisper.cpp 已排除**：VM 为 2 OCPU ARM，large-v3 仅 1–2 倍实时（15 秒录音需等 10–20 秒），换小模型则中英混说准确率不可接受。

**Omni 多模态模型（音频→JSON 一步到位）已排除。** 以 `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` 为例——"用一个模型同时完成转写与结构化"在架构上很诱人，会反复被提起，故记录排除理由：

1. **音频仅支持英语**（官方模型卡 "English only"，音频编码器 Parakeet-TDT-0.6B-v2）。本产品核心场景为中英混说且中文为主体。
2. **不支持 `response_format`**，仅有 tool calling，JSON 输出无强制。这摧毁 §5.3 规则一的地基——分类枚举必须在解码层约束。
3. **数据条款禁止本用法**：NVIDIA 要求 "avoid uploading confidential information or personal data (such as voices or faces of people)"，并记录会话数据用于产品改进。

评估任何 omni 方案时，这三点是必查项。此类模型的强项在文档理解与 OCR，**真正对口的是未来的票据拍照记账功能**（当前 MVP 明确不做）。

### 16.2 核心难点：中英混说 + 澳洲商户名

真实输入形如「Woolworths 买菜五十四块三」「今天 Uber Eats 花了32」。Whisper 系模型需指定语言或自动检测，而自动检测面对 code-switching 时倾向于**将整段判定为单一语言**，再把另一语言的词音译过去——这正是商户名变谐音乱码的机制。属架构层面限制，prompt 偏置可缓解不可根治。Speechmatics Melia 的"无需选择语言"即针对此点设计。

### 16.3 偏置词表（已实测有效，且是选型的决定性因素）

注入澳洲常见商户词表（Woolworths、Coles、Aldi、IGA、Bunnings、Uber Eats、Chemist Warehouse、JB Hi-Fi、Kmart 等）。

**实测效果显著**（§16.5）：同一段音频，无词表时 Woolworths 被听成「我」「午餐」，加词表后正确识别。音频中本就含有发音信息，模型缺的是先验而非信号。

**因此"是否支持词表偏置"上升为 STT 选型的一等标准**，而非加分项。各方案支持情况：

| 方案 | 偏置机制 |
|---|---|
| Groq Whisper | `prompt` 参数，限 224 tokens |
| ElevenLabs Scribe v2 | keyterm prompting，额外 $0.05/小时 |
| `gemini-3.5-flash-lite`（通用） | 直接写入 prompt，无额外费用 |
| `gemini-3.5-transcribe`（专用） | **不支持**——提示被静默忽略，systemInstruction 报 400 |
| Speechmatics Melia | 原生 code-switching，理论上不依赖词表 |

**进一步个性化**：以用户自身历史 merchant 列表作为偏置词表，与 §5.3 规则四的归一化共用同一份数据。越用越准。

### 16.4 文本 → 结构化：Gemini 轮次记录（2026-09-04）

> **此节为历史记录。** 结构化模型最终选定为 Groq `qwen/qwen3.8-27b`（见 §10.2）。Gemini 已评估但未采用（不做 fallback，见 §10.3）。保留本节是因为此处发现的数据规则（§5.3）与提示词纪律（§10.6）与 provider 无关，对任何模型都适用；同时它是将来更换 provider 时的对照基线。

12 条用例，两轮：`gemini-3.1-flash-lite` + `thinkingLevel: LOW`，以及 **`gemini-3.5-flash-lite` + thinking 关闭（最终选定）**。均关闭 Grounding。

**两轮对比**：关键字段（金额、日期、type、category）12/12 完全一致，**准确率无回退**。差异仅两处——merchant 一致性 3.5 更优（见 §5.3 规则四）；currency 自作主张倾向 3.5 更强（下方缺陷 2）。延迟 2372ms → 1035ms。

以下结果两轮均成立：

**通过（10/12 完全符合预期）**，其中难点项均通过：

- 口语化数字：「五十四块三」→ `54.30`
- 干扰项排除：「昨晚和John吃饭」中 John 未被误判为 merchant
- 相对日期：「上周五」→ `2026-08-28`（基准日 09-04 为周五，正确）
- 鲁棒性：「今天天气不错」「买了个东西」均返回空数组，未编造账目
- 一句多笔且日期不同：「上个月的房租2400，这个月的也交了」→ 两笔，日期分属 08 与 09

**12 条均无 schema 违规**——无枚举外分类、无负数金额、无格式错误。验证了规则一"约束放在 schema 层而非提示词层"的判断。

**发现的缺陷：**

1. **merchant 写法不一致** —— 已升级为 §5.3 规则四。
2. **currency 自作主张填默认值**，违反"仅在明确说出币种时填写"。3.1 在「7.5刀」上填了 AUD；**3.5 更进一步**，在完全未提币种的「今天 Uber Eats 花了32」上也填了 AUD。实际影响为零（客户端本会补默认值），但用户若指美元则错。提示词需明确列举何为"明确说出币种"，并强调未提及时必须留空。
3. **`description` 与 `merchant` 内容重复**（「Uber Eats」）。提示词加一句"description 不要重复 merchant"。

**性能实测**：选定配置平均 1035ms（864–1407ms）。仍是可感知的等待，**确认乐观 UI 为必需而非优化**——提交瞬间即插入占位行，不可让用户等待 spinner。延迟拆解与进一步优化路径见 §10.2 / §10.2b。

### 16.5 语音 → 文本：初步验证（2026-09-04，未完成）

用 `gemini-3.1-flash-tts-preview` 合成 4 条测试音频（24kHz PCM，重采样至 16kHz），跑过三条路径。

**结论一：`gemini-3.1-flash-live-preview` 出局。** 返回 `response modalities (TEXT) is not supported by the model`——原生音频对话模型只输出音频，无法用于转写。

**结论二：REST 与 WebSocket 输出逐字相同，因此选 REST。**

```
a1   REST: 我买菜 54 块 3。            LIVE: 我买菜 54 块 3。
a2   REST: 今天 Uber Eats 花了 32 块。  LIVE: 今天 Uber Eats 花了 32 块。
```

`gemini-3.5-transcribe`（REST，`generateContent`）与 `gemini-3.5-transcribe-live`（WebSocket，`bidiGenerateContent`）结果一致。既然如此，**没有理由承担 WebSocket 的复杂度**——后端无需维持两条连接（一条连浏览器、一条连 Google），无需处理连接状态、重连与超时。

> **Live API 的唯一优势是边说边出字**：实测说话过程中推送 4–5 次 `interimInputTranscription`，首次约 1.1–1.4 秒。UX 确实更好，但代价是整套 WebSocket 代理。**列为 MVP 后的升级项**，不进 MVP。

**结论三（实现陷阱）：转写结果在 `parts[0].audioTranscription.text`，不是标准的 `parts[0].text`。** 按标准字段解析会静默得到空字符串且 HTTP 200，极易误判为"模型不可用"。本次验证即先踩了此坑。

**观察：中文数字自动转为阿拉伯数字**（「五十四块三」→「54 块 3」，「二十五」→「25」）。对下游结构化有利。

**观察：音频计费约 25 tokens/秒**（3.4 秒音频 = 85 prompt tokens）。

**交叉验证与归因（同一音频，换模型 / 加词表）：**

```
a1「Woolworths 买菜五十四块三」
  gemini-3.5-transcribe            我买菜 54 块 3            ❌
  gemini-3.5-flash-lite 无偏置      午餐买菜54块3             ❌
  gemini-3.5-flash-lite 带词表      Woolworths 买菜 54块3     ✅

a3「Chemist Warehouse 买药十八块九」
  gemini-3.5-transcribe            chemist warehouse 买药 10 块 9
  gemini-3.5-flash-lite 无偏置      chemist warehouse 买 药 十 包 快 九
  gemini-3.5-flash-lite 带词表      Chemist Warehouse买药十块九

a2「今天 Uber Eats 花了三十二块」（对照组）
  gemini-3.5-transcribe            今天 Uber Eats 花了 32 块。   ✅ 干净
  gemini-3.5-flash-lite 无偏置      今天Uber Eats 花 了 32 元 。  「块」→「元」，乱空格
  gemini-3.5-flash-lite 带词表      今天 Uber Eats 花了 32 快。   「块」→「快」同音错字
```

**归因结论：**

1. **a1 是模型问题，且词表偏置可解决。** 音频中确实含 Woolworths 的发音信息——无先验时被归入中文音节（「我」「午餐」），给出词表后正确识别。**词表偏置的效果比预期显著。**
2. **a3 是音频质量问题，不计入模型缺陷。** 三个独立配置一致未能听出「十八」，最可能是输入信号本身不清晰（人耳复核确认合成音频「有些模糊」）。
3. **专用转写模型基础质量明显更好。** 通用模型存在同音错字（「块」→「元」/「快」）与乱空格，专用模型输出干净。

**硬约束：`gemini-3.5-transcribe` 无法被引导。** 实测三种注入方式：

```
词表置于音频前        → 输出与无提示时一字不差
词表置于音频后        → 输出与无提示时一字不差
systemInstruction    → HTTP 400 "Developer instruction is not enabled for this model"
```

它是纯粹的音频→文本函数，文字提示被静默忽略。

**由此形成 Gemini 家族内部的非此即彼取舍：**

| | 基础转写质量 | 词表偏置 | a1 商户名 |
|---|---|---|---|
| `gemini-3.5-transcribe` | 好 | **不支持** | ❌ |
| `gemini-3.5-flash-lite` | 差 | 支持且有效 | ✅ |

**对 Gemini 而言两阶段兜底不成立**：若 STT 已将 Woolworths 转成「我」，后续结构化步骤拿到的文本中不存在任何痕迹，无法恢复。

> 此结论仅适用于 Gemini。Deepgram 的失败模式不同，兜底对它成立——见 §16.5b。

**本轮的方法论边界**：TTS 音频发音标准、无噪音、语速均匀，而真实场景难点恰是中式英语口音、环境噪音与连读吞音。**此测试只能证伪不能证实**——通过不代表真实可用。

### 16.5b Deepgram Nova-3 实测（2026-09-04，同一批音频）

**陷阱一：`language=multi` 对中文不可用。** Nova-3 的多语种集合大概率不含中文——用 `multi` 时输出日文片假名与拼音罗马化：

```
a1  language=multi   ウォーターズ・マイ・チャイ・ウォシュシクアイシャン   置信 0.43
a1  language=zh      wowers买菜五十4块3                                置信 0.96
a4  language=multi   迅tien想上路迷談了hua你亜你亜你亜你亜你亜           置信 0.44
```

**必须显式指定 `language=zh`。** 这个坑代价高且不报错，只是静默地输出垃圾。

**`language=zh` 下的结果（keyterm 开启）：**

| | 原文 | Deepgram zh + keyterm | 置信度 |
|---|---|---|---|
| a1 | **Woolworths** 买菜五十四块三 | **woworths**买菜五十4块3 | 0.977 |
| a2 | 今天 Uber Eats 花了三十二块 | 今天ubereats花了 **32块** | 0.997 |
| a3 | Chemist Warehouse 买药**十八块九** | chemistwrehouse买药 **10包快酒** | 0.982 |
| a4 | 今天早上…二十五…十五 | 完整正确 | 1.000 |

**关键结论：Deepgram 与 Gemini 的失败模式性质不同，而性质比失败率更重要。**

```
Woolworths →  Gemini:   「我」        信息湮灭，不可恢复
              Deepgram: 「woworths」  英文 token 保留，编辑距离小，可恢复
```

**因此对 Deepgram，商户名纠错可以推迟到结构化阶段完成**——该步骤本就要跑 LLM、本就要抽取 merchant 字段，把商户词表一并注入即可完成 `woworths → Woolworths` 的匹配。这是 Gemini 路径做不到的。

**keyterm 有效但不充分**：`wowers` → `woworths`（更接近但仍错）；意外修正了 a2 的数字格式（`3十二块` → `32块`）。

**Deepgram 返回置信度，Gemini 不返回。** 实测 0.810–1.000，且与实际错误率吻合（表现最差的 a3 为最低值）。**这是 Gemini 完全不具备的能力**，可用于在低置信度时提示用户重点核对该条记录——对记账场景有实际价值。

**各项对比小结：**

| 维度 | Deepgram nova-3 (zh) | gemini-3.5-transcribe |
|---|---|---|
| 中文主体 | 持平（a4 均完美） | 持平 |
| 英文商户名 | **更优**（错拼但可恢复） | 更差（丢失） |
| 数字 | 更差（`块九`→`包快酒`） | 更优（`块 9`） |
| 词表偏置 | 支持且有效 | **不支持** |
| 置信度输出 | **有** | 无 |
| 延迟 | 300–1900ms（波动大） | ~2000ms |

### 16.5c Groq Whisper 实测（2026-09-04，同一批音频）

**三方横向对比（各自最优配置）：**

| | a1 商户名 | a2 | a3 商户名 | a3 金额 | a4 | 延迟 |
|---|---|---|---|---|---|---|
| **Groq Turbo + prompt 词表** | ✅ `Woolworths` | ✅ `Uber Eats` | ✅ `Chemist Warehouse` | ❌ 十包块九 | ✅ | **~180ms** |
| Deepgram Nova-3 zh + keyterm | ⚠️ `woworths` | ⚠️ `ubereats` | ⚠️ `chemistwrehouse` | ❌ 10包快酒 | ✅ | 300–1900ms |
| `gemini-3.5-transcribe` | ❌ `我`（丢失） | ✅ `Uber Eats` | ⚠️ 全小写 | ⚠️ 10 块 9 | ✅ | ~2000ms |

**Groq 在每个维度上赢或持平**，唯一例外是 a3 金额——该条已确定为音频缺陷（见下）。

**词表偏置的第三次独立验证**：turbo 无 prompt 时 a1 为 `Walworth`（接近但错），加词表后完全正确。

**延迟快一个数量级**，且作用点关键：STT 是整条链路中**唯一无法被乐观 UI 遮蔽**的等待——用户必须看到文字才能确认提交。

**成本同时最优**：$0.04/小时，为所有候选中最低。准确率、延迟、成本三项同时最优。

**turbo vs 非 turbo**：`whisper-large-v3` 在 a1 上**不带词表即正确**（turbo 需词表），但 a3 表现相同，延迟略高（~220ms vs ~180ms），单价 2.8 倍（$0.111 vs $0.04）。**选 turbo**——词表是本设计的固有组成部分，二者带词表后质量等同。

> 但 v3 更强的基础能力在**词表未覆盖的商户名**上可能仍有优势。词表无法穷举用户遇到的每一个商户，此项需在真人录音上验证（§16.7）。

**Whisper prompt 的已知副作用**：它会模仿 prompt 的标点风格。词表用逗号分隔时，输出出现多余逗号（`Woolworths,买菜, 54块3。`）。影响轻微，下游结构化可吸收，但编写 prompt 时应注意其风格会被继承。

**a3「十八块九」已完成归因。** 六个独立配置全部未能识别（Gemini 三种配置、Deepgram、Groq turbo、Groq v3）。六次一致失败 → **确定为合成音频本身发音不清**，非任何模型的缺陷。此条不计入任何供应商的评分。

### 16.6 当前选型状态

**选定：Groq `whisper-large-v3-turbo` + `language=zh` + `prompt` 词表偏置。**

依据见 §16.5c——准确率、延迟、成本三项同时最优，在合成音频上是干净的胜出，无需权衡取舍。

**关键参数：**

- `model=whisper-large-v3-turbo`
- `language=zh` —— 显式指定。参考 Deepgram 的教训（§16.5b），语言参数配错会静默产出垃圾
- `prompt` —— 商户词表，上限 224 tokens。注意其标点风格会被输出继承
- `temperature=0`
- `response_format=verbose_json` —— 附带检测语言与音频时长

**落选记录：**

- **Deepgram Nova-3** —— 商户名错拼（`woworths`）、`ubereats` 无空格分词，延迟波动大。唯一独有优势是**返回置信度**（0.810–1.000，与实际错误率吻合），可驱动"此条可能不准，请核对"的提示。Groq 的 `verbose_json` 不含等价字段。若日后需要该能力，此项值得重新评估。
- **`gemini-3.5-transcribe`** —— 商户名丢失且不可恢复，且**不支持任何形式的偏置**（§16.5），与 §16.3 的一等标准直接冲突。

**尚未评估**（当前无需评估，除非真人录音推翻上述结论）：ElevenLabs Scribe v2、Speechmatics Melia。

**此结论建立在 TTS 合成音频上，不足以定稿。** 见 §16.7。

### 16.7 仍需完成的验证

**真人录音测试。** 录 10–15 条反映真实说话方式的音频，跑过各候选，每个再跑一次带偏置词表的版本。

**评分按字段重要性加权：金额 > 商户名 > 日期 > 描述。** 通用 WER 会把选型引向错误方向——转录错误只在影响最终账目时才重要（「越南粉」错成「越南分」无害，金额或商户名出错则致命）。

**免费额度不足以完成验证**：`gemini-3.5-transcribe` 免费层为 3 RPM / 25 RPD，本轮 8 次调用即触发 429。完整验证需先绑定付费账单。

---

## 17. 实现前需确认的开放项

按紧急度排列。

1. **真人录音验证 STT**（见 §16.7）——**当前唯一的重大未决项**。所有 STT 结论均建立在 TTS 合成音频上，未覆盖中式英语口音、环境噪音、连读吞音三个真实难点。重点验证两项：
   - **词表未覆盖的商户名**——实测中 turbo 需词表才能听对 `Woolworths`，非 turbo 版无词表即正确。真实使用中词表不可能穷举，若 turbo 的基础能力短板被放大，需换非 turbo（贵 2.8 倍，$4.5 → $12.5/月，仍可忽略）
   - **金额识别**——金额错误比商户名错误严重得多

2. **Groq ZDR 是否覆盖免费层**（见 §10.7a）——在控制台 Data Controls 中核实。决定小规模阶段能否直接用免费层。

3. **Groq 付费层的 TPM 额度**——免费层实测 8000 TPM（12 条连跑即触发 429）。300 用户规模需确认付费层是否充足。

4. **Prisma 稳定版中 Rust-free 客户端的启用方式与最低版本号**——GA 后配置已简化，实现时以官方文档为准。

5. **分类枚举的中文显示文案**——17 个 key 的界面文案（存储值为英文 key，见 §5.2）。

6. **隐私政策与主页文案**——brand verification 的前置条件（§11.1）。隐私政策须包含 §11.3 那句关于后端持有 refresh token 的如实表述。
