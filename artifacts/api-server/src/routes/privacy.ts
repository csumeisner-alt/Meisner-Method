import { Router } from "express";

const router = Router();

const PRIVACY_POLICY_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Privacy Policy for Meisner Method." />
    <title>Privacy Policy · Meisner Method</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0c0d0f;
        --surface: #15171a;
        --surface-2: #1b1e22;
        --text: #f3f4f6;
        --muted: #b7bdc7;
        --gold: #e4b458;
        --line: rgba(228, 180, 88, 0.24);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          radial-gradient(circle at top right, rgba(228, 180, 88, 0.12), transparent 34rem),
          var(--bg);
        color: var(--text);
        font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { width: min(900px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 72px; }
      header, section, footer {
        background: rgba(21, 23, 26, 0.94);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 24px;
        margin-bottom: 16px;
      }
      header { padding: 32px 28px; }
      h1, h2 { line-height: 1.2; margin: 0 0 12px; }
      h1 { color: var(--gold); font-size: clamp(2rem, 6vw, 3.2rem); letter-spacing: 0.02em; }
      h2 { font-size: 1.25rem; color: #f8d88e; }
      p, ul { margin: 0 0 12px; }
      p:last-child, ul:last-child { margin-bottom: 0; }
      ul { padding-left: 1.3rem; }
      li + li { margin-top: 6px; }
      a { color: #f8d88e; }
      .eyebrow, .updated { color: var(--muted); font-size: 0.9rem; }
      .eyebrow { letter-spacing: 0.14em; text-transform: uppercase; }
      footer { color: var(--muted); font-size: 0.9rem; }
      @media (max-width: 560px) {
        main { width: min(100% - 20px, 900px); padding-top: 20px; }
        header, section, footer { padding: 20px; border-radius: 14px; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="eyebrow">Meisner Method</div>
        <h1>Privacy Policy</h1>
        <p class="updated"><strong>Effective date:</strong> September 4, 2026</p>
        <p>
          This Privacy Policy explains how Meisner Method handles information when
          you use the mobile app and related services.
        </p>
      </header>

      <section>
        <h2>1. Information we handle</h2>
        <p>Depending on the features you use, Meisner Method may handle:</p>
        <ul>
          <li><strong>Account information:</strong> If you choose to sign in, our identity provider, Clerk, processes the account details needed to authenticate you.</li>
          <li><strong>App data:</strong> Watchlists, paper-trading accounts, positions, orders, transactions, lots, alerts, preferences, and related learning or app-progress data. Some of this data is stored locally on your device; signed-in or synchronized data may also be stored by our server.</li>
          <li><strong>Notification information:</strong> If you enable price alerts, we handle an anonymous app-installation identifier, your device platform, an Expo push token, notification status, and the alert settings needed to send the alert you requested.</li>
          <li><strong>Market requests:</strong> Stock symbols and related requests needed to retrieve quotes, charts, company information, and market analysis.</li>
          <li><strong>Technical information:</strong> Basic request logs such as request time, route, response status, and error details used to operate and secure the service.</li>
        </ul>
      </section>

      <section>
        <h2>2. How we use information</h2>
        <ul>
          <li>Provide stock education, quotes, charts, watchlists, paper trading, portfolio calculations, and alerts.</li>
          <li>Generate the optional AI-assisted stock analysis you request.</li>
          <li>Send a price alert to the device that created it when its selected condition is met.</li>
          <li>Maintain, troubleshoot, secure, and improve the service.</li>
          <li>Respond to privacy or support requests and comply with applicable law.</li>
        </ul>
        <p>Meisner Method does not sell personal information and does not use personal information for targeted advertising.</p>
      </section>

      <section>
        <h2>3. Third-party services</h2>
        <p>
          The service relies on providers that process information on our behalf
          or provide requested functionality:
        </p>
        <ul>
          <li><a href="https://clerk.com/privacy" rel="noreferrer">Clerk</a> for optional account authentication.</li>
          <li><a href="https://openai.com/policies/privacy-policy/" rel="noreferrer">OpenAI</a> for requested AI-assisted stock analysis.</li>
          <li><a href="https://expo.dev/privacy" rel="noreferrer">Expo</a> for mobile push notification delivery.</li>
          <li>Yahoo Finance data services, accessed through market-data tooling, for public market information.</li>
          <li>Replit-hosted infrastructure and PostgreSQL storage for the app’s server and synchronized data.</li>
        </ul>
        <p>
          These providers may process information under their own privacy policies.
          We do not send your account password to the AI analysis service.
        </p>
      </section>

      <section>
        <h2>4. Local storage and notifications</h2>
        <p>
          The app uses device storage for features such as watchlists, paper-trading
          state, settings, and app progress. You can remove locally stored data by
          clearing the app’s storage or uninstalling the app.
        </p>
        <p>
          Push notifications are optional. You can disable notification permission
          in your device settings and delete price alerts from the app. Disabling
          notifications does not automatically delete other app or account data.
        </p>
      </section>

      <section>
        <h2>5. Retention and deletion</h2>
        <p>
          We retain synchronized account, paper-trading, watchlist, and alert data
          for as long as needed to provide the requested features, maintain service
          reliability, or meet legal obligations. Local-only data remains on your
          device until you remove it.
        </p>
        <p>
          To request deletion of server-side information or ask a privacy question,
          use the project’s <a href="https://github.com/csumeisner-alt/Meisner-Method/issues" rel="noreferrer">privacy and support contact channel</a>.
          Do not post passwords, push tokens, or other sensitive information in a
          public issue.
        </p>
      </section>

      <section>
        <h2>6. Security</h2>
        <p>
          We use reasonable administrative, technical, and organizational measures
          intended to protect information. No internet transmission or storage
          system can be guaranteed to be completely secure.
        </p>
      </section>

      <section>
        <h2>7. Children’s privacy</h2>
        <p>
          Meisner Method is not directed to children under 13, and we do not
          knowingly collect personal information from children under 13.
        </p>
      </section>

      <section>
        <h2>8. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy when the service or applicable
          requirements change. The effective date at the top of this page shows
          when it was last updated.
        </p>
      </section>

      <footer>
        Meisner Method is an educational and paper-trading tool, not a brokerage
        or investment adviser. Nothing in the app is financial advice.
      </footer>
    </main>
  </body>
</html>`;

router.get("/privacy", (_req, res) => {
  res
    .status(200)
    .type("html")
    .set("Cache-Control", "public, max-age=3600")
    .send(PRIVACY_POLICY_HTML);
});

export default router;