import { LegalPage, SUPPORT_EMAIL } from '../_legal/LegalPage'

export const metadata = { title: 'SMS Program & Opt-In Policy — NXTUP' }

// Página de EVIDENCIA para la verificación toll-free de Twilio
// (campo "Opt-in policy proof"): documenta públicamente cómo se
// obtiene el consentimiento antes de enviar cualquier SMS.

export default function SmsOptInPage() {
  return (
    <LegalPage title="SMS Program & Opt-In Policy" updated="October 14, 2026">
      <section>
        <h2>Program description</h2>
        <p>
          NXTUP Queue Notifications is a transactional SMS program used by
          participating barbershops. Customers receive: (1) a confirmation
          when they join the waiting line, with their check-in code and
          estimated wait, and (2) an alert when their barber is ready.
          Message frequency varies by visit (typically 1–3 messages per
          visit). Message and data rates may apply. No marketing or
          promotional messages are sent under this program.
        </p>
      </section>
      <section>
        <h2>How customers opt in (verbal, on a recorded call)</h2>
        <p>
          Customers call the shop&apos;s phone line to hold a spot in the
          waiting line. During the call, the shop&apos;s receptionist collects
          the customer&apos;s mobile number and informs them, before ending
          the call, that they will receive text updates about their visit.
          A typical exchange:
        </p>
        <p>
          <em>
            &quot;Can I get your mobile number to hold your spot? ... Perfect
            — I&apos;ll text you your check-in code and we&apos;ll text you
            when your barber is ready.&quot;
          </em>
        </p>
        <p>
          Consent is given verbally on that call before any message is sent,
          and the call is logged. We never send messages to numbers that were
          not provided directly by the customer.
        </p>
      </section>
      <section>
        <h2>Sample messages</h2>
        <ul>
          <li>
            NXTUP: Hi Juan! Your spot at Fade Factory Dominican Haircuts is
            confirmed. Check-in code: 4KZT. Approx. wait 15-20 min. Reply HELP
            for help, STOP to opt out.
          </li>
          <li>
            NXTUP: Juan, your barber Carlos is ready! Please come in. - Fade
            Factory via NXTUP. Reply STOP to opt out.
          </li>
        </ul>
      </section>
      <section>
        <h2>Opt out and help</h2>
        <p>
          Reply STOP to any message to cancel. Reply HELP for help, or contact{' '}
          {SUPPORT_EMAIL}. See our{' '}
          <a href="/terms">Terms of Service</a> and{' '}
          <a href="/privacy">Privacy Policy</a>. No mobile information is
          shared with third parties or affiliates for marketing or promotional
          purposes.
        </p>
      </section>
    </LegalPage>
  )
}
