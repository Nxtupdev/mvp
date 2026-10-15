import { LegalPage, SUPPORT_EMAIL } from '../_legal/LegalPage'

export const metadata = { title: 'Privacy Policy — NXTUP' }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 14, 2026">
      <section>
        <h2>1. What we collect</h2>
        <p>
          When you check in at a participating shop (at the kiosk or by phone),
          we collect your first name, your mobile phone number, and visit data
          (the shop, your position in line, timestamps, and the barber who
          served you). Shop owners additionally provide account and billing
          information.
        </p>
      </section>
      <section>
        <h2>2. How we use it</h2>
        <ul>
          <li>To run the waiting line: show your first name on the shop&apos;s queue screen and call your turn.</li>
          <li>To send you transactional text messages about your visit (confirmation, check-in code, &quot;your barber is ready&quot;).</li>
          <li>To give the shop owner visit history and statistics for their own shop.</li>
        </ul>
      </section>
      <section>
        <h2>3. Text messaging privacy</h2>
        <p>
          No mobile information will be shared with third parties or
          affiliates for marketing or promotional purposes. Text messaging
          originator opt-in data and consent are not shared with any third
          parties, except with service providers acting on our behalf solely
          to deliver the messages you consented to.
        </p>
      </section>
      <section>
        <h2>4. Who we share data with</h2>
        <p>
          Only with service providers that operate the platform on our behalf:
          cloud hosting, database, payment processing (Stripe, for shop
          owners), and message delivery. Your phone number is visible to the
          shop you checked into, which already has your business relationship.
          We do not sell personal data.
        </p>
      </section>
      <section>
        <h2>5. Retention and your choices</h2>
        <p>
          Visit records are kept so your shop can recognize you as a returning
          customer. Reply STOP to any message to stop receiving texts. To
          request access to or deletion of your data, contact us at{' '}
          {SUPPORT_EMAIL} or ask at your shop.
        </p>
      </section>
      <section>
        <h2>6. Contact</h2>
        <p>
          Privacy questions: {SUPPORT_EMAIL}.
        </p>
      </section>
    </LegalPage>
  )
}
