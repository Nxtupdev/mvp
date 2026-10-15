import { LegalPage, SUPPORT_EMAIL } from '../_legal/LegalPage'

export const metadata = { title: 'Terms of Service — NXTUP' }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 14, 2026">
      <section>
        <h2>1. The service</h2>
        <p>
          NXTUP (&quot;we&quot;, &quot;us&quot;) provides a queue management
          platform for barbershops and similar walk-in businesses: a check-in
          kiosk, a live waiting-line display, barber panels, and related
          notifications. These terms apply to shop owners who subscribe to
          NXTUP and to customers who use a participating shop&apos;s check-in.
        </p>
      </section>
      <section>
        <h2>2. SMS / text message program (NXTUP Queue Notifications)</h2>
        <p>
          Participating shops send transactional text messages through NXTUP:
          a confirmation when you join the waiting line (including your
          check-in code and estimated wait) and an alert when your barber is
          ready. You receive these messages only after providing your own
          mobile number, at the shop&apos;s check-in kiosk or verbally during a
          call to the shop.
        </p>
        <ul>
          <li>Message frequency varies by visit (typically 1–3 messages per visit).</li>
          <li>Message and data rates may apply, depending on your mobile plan.</li>
          <li>Reply STOP at any time to cancel and stop receiving messages.</li>
          <li>
            Reply HELP for help, or contact us at {SUPPORT_EMAIL}.
          </li>
          <li>Carriers are not liable for delayed or undelivered messages.</li>
        </ul>
      </section>
      <section>
        <h2>3. Shop subscriptions</h2>
        <p>
          Shop owners subscribe monthly (billed through Stripe). Subscriptions
          renew automatically and can be cancelled at any time from the
          dashboard; service continues until the end of the paid period. If a
          subscription lapses, new customer check-ins pause while existing
          customers in line are served normally.
        </p>
      </section>
      <section>
        <h2>4. Acceptable use</h2>
        <p>
          You may not use NXTUP to send unsolicited messages, to register
          phone numbers that are not your own, or to interfere with the
          service. We may suspend accounts that abuse the platform.
        </p>
      </section>
      <section>
        <h2>5. Disclaimer and liability</h2>
        <p>
          NXTUP is provided &quot;as is&quot;. Wait times and queue positions
          are estimates. To the maximum extent permitted by law, we are not
          liable for indirect or consequential damages arising from use of the
          service.
        </p>
      </section>
      <section>
        <h2>6. Changes</h2>
        <p>
          We may update these terms; the current version is always published
          at this page. Material changes will be reflected in the date above.
        </p>
      </section>
      <section>
        <h2>7. Contact</h2>
        <p>
          Questions about these terms: {SUPPORT_EMAIL}.
        </p>
      </section>
    </LegalPage>
  )
}
