/**
 * 公开、免登录的服务条款页——跟 privacy/page.tsx 同样的理由和同样的
 * "英文权威 + 中文对照"结构（见 privacy/page.tsx 顶部注释）。
 */

const CONTACT_EMAIL = 'REPLACE_WITH_REAL_CONTACT_EMAIL';

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-10 lg:pb-10">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-bold text-ink">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Last updated: September 2026</p>
      </header>

      <div className="space-y-6 text-sm leading-relaxed text-ink">
        <p>
          These terms govern your use of JustSayIt (&quot;the app&quot;,
          &quot;we&quot;). By signing in and using the app, you agree to
          them. If the Chinese translation below ever conflicts with this
          English text, the English text controls.
        </p>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            1. What the app does
          </h2>
          <p className="mt-2 text-muted">
            JustSayIt lets you record expenses by voice or text. Your entries
            are stored on your device and synced to your own Google Drive —
            see our{' '}
            <a className="text-brand underline" href="/privacy">
              Privacy Policy
            </a>{' '}
            for exactly what that means and what data we do and don&apos;t
            handle.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            2. Your account and your data
          </h2>
          <p className="mt-2 text-muted">
            You need a Google account to use the app. Your ledger data
            belongs to you — it lives on your device and in your own Drive,
            not on our servers, so we cannot restore it for you if your
            device is lost, your browser storage is cleared, or your Drive
            data is deleted. The app includes an export/backup feature;
            using it periodically is your responsibility if you want a
            standalone copy of your data.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            3. AI-assisted entries can be wrong
          </h2>
          <p className="mt-2 text-muted">
            Voice transcription and automatic categorization are performed
            by third-party AI services (see our Privacy Policy for which
            ones). They can mishear, mis-transcribe, or mis-categorize an
            entry. Review what the app records before relying on it —
            especially amounts. You can edit or delete any entry at any
            time.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            4. Acceptable use
          </h2>
          <p className="mt-2 text-muted">
            Don&apos;t use the app for anything illegal, don&apos;t try to
            circumvent its usage limits (for example, by scripting requests
            to exceed the daily AI quota), and don&apos;t attempt to access
            another user&apos;s account or data.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            5. No warranty
          </h2>
          <p className="mt-2 text-muted">
            This is a personal project, provided &quot;as is&quot; and
            &quot;as available&quot;, with no uptime guarantee and no
            warranty of any kind, express or implied — including
            merchantability, fitness for a particular purpose, or accuracy
            of AI-generated content.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            6. Limitation of liability
          </h2>
          <p className="mt-2 text-muted">
            To the fullest extent permitted by law, we are not liable for
            any indirect, incidental, or consequential damages arising from
            your use of the app, including loss of data, loss of profits,
            or financial decisions made based on entries the app recorded.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            7. Suspension and termination
          </h2>
          <p className="mt-2 text-muted">
            We may suspend or terminate access for anyone who violates
            section 4. You can stop using the app at any time by
            disconnecting it from your Google Account&apos;s &quot;Third-party
            apps &amp; services&quot; settings.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            8. Changes to these terms
          </h2>
          <p className="mt-2 text-muted">
            If we change these terms, we&apos;ll update this page and its
            &quot;Last updated&quot; date. Continuing to use the app after a
            change means you accept the updated terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            9. Governing law
          </h2>
          <p className="mt-2 text-muted">
            These terms are governed by the laws of Australia, without
            regard to conflict-of-law principles.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-ink">
            10. Contact
          </h2>
          <p className="mt-2 text-muted">
            Questions about these terms:{' '}
            <a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>

      <hr className="my-10 border-border" />

      <div className="space-y-6 text-sm leading-relaxed text-ink">
        <h2 className="font-display text-lg font-bold text-ink">服务条款（中文对照）</h2>
        <p className="text-muted">
          如中文译文与上方英文原文存在冲突，以英文原文为准。
        </p>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">1. 本应用提供什么服务</h3>
          <p className="mt-2 text-muted">
            JustSayIt 让您用语音或文字记录消费。您的记录保存在您的设备上，
            并同步到您自己的 Google Drive——具体是什么、我们处理和不处理
            哪些数据，请参见我们的{' '}
            <a className="text-brand underline" href="/privacy">
              隐私政策
            </a>
            。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">2. 您的账号与您的数据</h3>
          <p className="mt-2 text-muted">
            使用本应用需要一个 Google 账号。您的账本数据归您所有——它保存
            在您的设备和您自己的 Drive 里，不在我们的服务器上，因此如果
            您的设备丢失、浏览器存储被清除，或者 Drive 数据被删除，我们
            无法帮您恢复。本应用提供导出/备份功能；是否定期使用它来保留
            一份独立副本，由您自行决定和负责。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">
            3. AI 辅助生成的记录可能出错
          </h3>
          <p className="mt-2 text-muted">
            语音转写和自动分类由第三方 AI 服务完成（具体是哪些，见我们的
            隐私政策）。它们可能听错、转写错，或分类错。在依赖某条记录之前
            请先自行核对，尤其是金额。您可以随时编辑或删除任意一条记录。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">4. 可接受使用范围</h3>
          <p className="mt-2 text-muted">
            请勿将本应用用于任何违法用途，请勿试图绕过其使用限制（例如
            通过脚本化请求超出每日 AI 配额），也请勿试图访问其他用户的
            账号或数据。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">5. 不提供担保</h3>
          <p className="mt-2 text-muted">
            这是一个个人项目，按"现状"和"可用"提供，不保证正常运行时间，
            也不作任何明示或暗示的担保——包括适销性、特定用途适用性，或
            AI 生成内容的准确性。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">6. 责任限制</h3>
          <p className="mt-2 text-muted">
            在法律允许的最大范围内，我们对因使用本应用而产生的任何间接、
            附带或衍生损害不承担责任，包括数据丢失、利润损失，或基于本
            应用记录的内容做出的财务决策所造成的损失。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">7. 暂停与终止</h3>
          <p className="mt-2 text-muted">
            对于违反第 4 条的用户，我们可能暂停或终止其访问权限。您可以
            随时在 Google 账号的"第三方应用和服务"设置里断开本应用，
            从而停止使用。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">8. 条款变更</h3>
          <p className="mt-2 text-muted">
            如果我们变更这些条款，会更新本页面以及页面顶部的"最后更新"
            日期。变更后继续使用本应用即表示您接受更新后的条款。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">9. 适用法律</h3>
          <p className="mt-2 text-muted">
            本条款适用澳大利亚法律，不考虑法律冲突原则。
          </p>
        </section>

        <section>
          <h3 className="font-display text-base font-semibold text-ink">10. 联系方式</h3>
          <p className="mt-2 text-muted">
            如对本条款有任何疑问，请联系：{' '}
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
