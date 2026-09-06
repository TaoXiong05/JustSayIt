/**
 * 公开、免登录的隐私政策页——Google OAuth consent screen 配置要求提供一个
 * 可访问的隐私政策链接（发布到 In production 的前置条件之一，见 design
 * spec §11.1、§17.6）。不接入 useSession()/LocaleProvider 的语言切换：
 * 法律文本一份权威版本（英文）+ 一份对照翻译（中文）放在同一个页面，
 * 不做"切换语言看不同内容"的处理——避免两份译文各自漂移、内容对不上。
 *
 * 内容必须逐字为真（design spec §11.3 的原则："对用户的表述，每个字都
 * 必须为真"）：每一条数据处理事实都对照实际代码/已核实的第三方条款写，
 * 不是通用模板拼凑。CONTACT_EMAIL 是占位符，上线前替换成真实联系邮箱。
 */

const CONTACT_EMAIL = 'REPLACE_WITH_REAL_CONTACT_EMAIL';

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-10 lg:pb-10">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-bold text-ink">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated: September 2026</p>
      </header>

      <div className="space-y-6 text-sm leading-relaxed text-ink">
        <p>
          JustSayIt (&quot;the app&quot;, &quot;we&quot;) is a voice-first
          expense-tracking app. This policy explains what data the app
          touches, why, and what it deliberately does not do. If the Chinese
          translation below ever conflicts with this English text, the
          English text controls.
        </p>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            1. Your ledger data never touches our servers
          </h2>
          <p className="mt-2 text-muted">
            Every expense you record — amount, category, merchant, date,
            description — is stored locally on your device and synced
            directly from your browser to your own Google Drive, inside a
            hidden, app-specific storage area (Google&apos;s{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5">
              drive.appdata
            </code>{' '}
            scope). That area is not visible in your regular Drive file
            list, is not shared with any other app, and — just as
            importantly — this app cannot see or touch any other file in
            your Drive. Your ledger content is never sent to, processed by,
            or stored on our own servers.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            2. What we do collect
          </h2>
          <p className="mt-2 text-muted">
            When you sign in with Google, we receive and store your Google
            account&apos;s stable identifier, email address, display name,
            and profile picture URL, plus an encrypted copy of a Google
            refresh token. That token exists for one purpose: exchanging it
            for a short-lived access token when your browser needs to talk
            to your Google Drive. We are technically capable of using that
            token to read your app-data folder ourselves, but we do not —
            the only thing our server does with it is mint a temporary
            access token and hand it back to your browser, which then talks
            to Google Drive directly. The refresh token cannot be used to
            access anything in your Drive outside this app&apos;s own hidden
            folder.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            3. Voice and text processing
          </h2>
          <p className="mt-2 text-muted">
            When you record a voice entry, the audio is sent to Groq
            (speech-to-text) to produce a text transcript. Whatever text
            results — spoken or typed — is then sent to Cerebras to be
            turned into a structured expense entry (amount, category, etc.).
            Neither call includes your name, email, or any other account
            information — only the text or audio needed to answer that one
            request.
          </p>
          <p className="mt-2 text-muted">
            Groq&apos;s Zero Data Retention setting is enabled on our
            account, meaning Groq does not retain your audio or its
            transcript beyond processing the request. Cerebras states, in
            its own published documentation, that it does not retain
            inference prompts, requests, or responses — no user-generated
            content is stored. We rely on each provider&apos;s own published
            policy for these claims and will update this section if either
            provider&apos;s terms change.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            4. Cookies and tracking
          </h2>
          <p className="mt-2 text-muted">
            We set one cookie: a signed, httpOnly session cookie that keeps
            you logged in for up to 30 days. It carries no advertising or
            tracking purpose. We do not run any analytics, advertising, or
            third-party tracking scripts of any kind — nothing on this app
            reports your usage to us or to anyone else beyond the minimal
            server logs described below.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            5. Logs
          </h2>
          <p className="mt-2 text-muted">
            Server logs record which user made a request, which AI model
            was used, how long it took, and whether it succeeded — never
            the actual content of what you said, typed, or recorded.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            6. How long we keep things, and how to delete your data
          </h2>
          <p className="mt-2 text-muted">
            We keep your account record (profile fields and encrypted
            refresh token) for as long as you use the app. You can revoke
            our access at any time from your Google Account&apos;s
            &quot;Third-party apps &amp; services&quot; settings — doing so
            immediately invalidates our stored refresh token. Your ledger
            data is unaffected either way, since it already lives on your
            device and in your own Drive, not with us. To request deletion
            of the account record we hold, email{' '}
            <a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            7. Children
          </h2>
          <p className="mt-2 text-muted">
            This app is not directed at children, and we do not knowingly
            collect information from anyone under 13.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            8. Changes to this policy
          </h2>
          <p className="mt-2 text-muted">
            If we change what we collect or how we use it, we&apos;ll update
            this page and its &quot;Last updated&quot; date.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            9. Contact
          </h2>
          <p className="mt-2 text-muted">
            Questions about this policy:{' '}
            <a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>

      <hr className="my-10 border-border" />

      <div className="space-y-6 text-sm leading-relaxed text-ink">
        <h2 className="font-display text-lg font-bold text-ink">隐私政策（中文对照）</h2>
        <p className="text-muted">
          如中文译文与上方英文原文存在冲突，以英文原文为准。
        </p>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">
            1. 您的账本数据从不经过我们的服务器
          </h3>
          <p className="mt-2 text-muted">
            您记录的每一笔消费——金额、分类、商户、日期、描述——都保存在您的
            设备本地，并由您的浏览器直接同步到您自己的 Google Drive 里一个
            隐藏的、仅本应用专属的存储区域（Google 的{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5">
              drive.appdata
            </code>{' '}
            权限范围）。这个区域不会出现在您常规的 Drive 文件列表里，不与
            任何其它应用共享，同样重要的是——本应用也无法看到或访问您
            Drive 中的任何其它文件。您的账本内容从不会被发送到、处理于，
            或存储在我们自己的服务器上。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">
            2. 我们确实会收集的信息
          </h3>
          <p className="mt-2 text-muted">
            当您使用 Google 登录时，我们会接收并存储您 Google 账号的稳定
            标识符、邮箱地址、显示名称和头像图片链接，以及一份加密保存的
            Google refresh token。这个 token 只有一个用途：在您的浏览器需要
            访问 Google Drive 时，兑换出一个短期有效的 access token。我们
            在技术上有能力用这个 token 自己读取您的应用数据文件夹，但我们
            不这么做——我们的服务器唯一会用它做的事，就是兑换出一个临时
            access token 交还给您的浏览器，之后由浏览器直接和 Google Drive
            通信。这个 refresh token 无法用来访问本应用专属隐藏文件夹以外
            的任何 Drive 内容。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">
            3. 语音与文本处理
          </h3>
          <p className="mt-2 text-muted">
            当您录制一条语音记录时，音频会被发送给 Groq 做语音转文字。
            无论是转写出来的文字还是您直接打字输入的文字，随后都会被发送给
            Cerebras，用于把它整理成一条结构化的消费记录（金额、分类等）。
            这两次调用都不包含您的姓名、邮箱或任何其它账号信息——只有
            回答这一次请求所需要的文字或音频本身。
          </p>
          <p className="mt-2 text-muted">
            我们的账号已开启 Groq 的 Zero Data Retention（零数据保留）设置，
            意味着 Groq 不会在处理完请求之后保留您的音频或转写内容。
            Cerebras 在其官方文档中声明，它不会保留推理请求的 prompt、
            请求或响应内容——不存储任何用户生成的内容。以上表述均依据两家
            服务商各自公开发布的政策，如任何一方条款发生变化，我们会更新
            这一节内容。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">4. Cookie 与追踪</h3>
          <p className="mt-2 text-muted">
            我们只设置一个 Cookie：一个经过签名的 httpOnly 会话 Cookie，
            让您的登录状态保持最长 30 天，不带任何广告或追踪用途。我们不
            运行任何形式的数据分析、广告或第三方追踪脚本——除了下面说明的
            最小化服务器日志之外，本应用不会向我们或任何第三方上报您的
            使用行为。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">5. 日志</h3>
          <p className="mt-2 text-muted">
            服务器日志只记录是哪个用户发起了请求、用了哪个 AI 模型、耗时
            多久、成功与否——绝不记录您说过、输入或录制的实际内容。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">
            6. 我们保留数据多久，以及如何删除您的数据
          </h3>
          <p className="mt-2 text-muted">
            只要您还在使用本应用，我们就会保留您的账号记录（个人资料字段和
            加密的 refresh token）。您可以随时在 Google 账号的"第三方应用和
            服务"设置里撤销我们的访问权限，这样做会立即让我们保存的
            refresh token 失效。无论如何，您的账本数据都不受影响——它本来
            就保存在您自己的设备和您自己的 Drive 里，不在我们这儿。如需
            请求删除我们持有的账号记录，请发邮件至{' '}
            <a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">7. 儿童隐私</h3>
          <p className="mt-2 text-muted">
            本应用不面向儿童，我们不会在明知的情况下收集 13 岁以下用户的
            信息。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">8. 政策变更</h3>
          <p className="mt-2 text-muted">
            如果我们收集或使用信息的方式发生变化，我们会更新这个页面以及
            页面顶部的"最后更新"日期。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">9. 联系方式</h3>
          <p className="mt-2 text-muted">
            如对本政策有任何疑问，请联系：{' '}
            <a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            。
          </p>
        </section>
      </div>
    </main>
  );
}
