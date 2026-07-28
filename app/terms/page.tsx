import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

export const metadata = {
  title: 'Terms & Conditions — SkillHub',
  description: 'The terms and conditions governing use of the SkillHub inclusive learning platform.',
};

const LAST_UPDATED = 'July 28, 2026';

interface Section {
  heading: string;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    heading: '1. About SkillHub & Acceptance',
    body: (
      <>
        <p>
          SkillHub is an inclusive online learning platform that connects students — including
          differently-abled learners — with teachers, specialist educators, and sponsors. These
          Terms &amp; Conditions (&ldquo;Terms&rdquo;) form a legally binding agreement between you
          and SkillHub governing your access to and use of our website, applications, and services
          (together, the &ldquo;Platform&rdquo;).
        </p>
        <p>
          By creating an account, ticking the &ldquo;I accept the Terms &amp; Conditions&rdquo; box,
          or otherwise using the Platform, you confirm that you have read, understood, and agree to
          be bound by these Terms and by our Privacy practices described below. If you do not agree,
          please do not use the Platform.
        </p>
      </>
    ),
  },
  {
    heading: '2. Eligibility, Children & Guardian Consent',
    body: (
      <>
        <p>
          The Platform serves learners of many ages, including children. If you are under the age of
          18 (or the age of majority where you live), you may use the Platform only with the
          involvement, consent, and supervision of a parent or legal guardian, who accepts these
          Terms on your behalf.
        </p>
        <p>
          Parents and guardians are responsible for the account activity, settings, and
          communications of a child in their care, and may manage or request removal of that
          child&rsquo;s account and data at any time.
        </p>
      </>
    ),
  },
  {
    heading: '3. Accounts & Registration',
    body: (
      <>
        <p>
          You must provide accurate, current, and complete information when registering and keep it
          up to date. Each email address may be linked to only one account; registration will be
          declined if the email is already in use. You are responsible for safeguarding your
          password and for all activity under your account.
        </p>
        <p>
          Accounts are personal to you and may not be shared, sold, or transferred. Notify us
          promptly of any unauthorised use of your account.
        </p>
      </>
    ),
  },
  {
    heading: '4. Accessibility Information & Your Privacy',
    body: (
      <>
        <p>
          To tailor the learning experience, students (or their guardians) may choose a support
          dashboard or share accessibility needs. This information is used solely to adapt the
          Platform — for example, enabling captions, audio descriptions, larger text, or matching
          you with specialist teachers.
        </p>
        <p>
          We treat accessibility and disability-related information as sensitive personal data. We
          do not sell it. It is shared only as needed to provide the service (for example, with a
          teacher you choose to learn from, where you have consented to share) and is handled in
          line with applicable data-protection law. You may review, update, or delete this
          information from your settings, or by contacting us.
        </p>
      </>
    ),
  },
  {
    heading: '5. Acceptable Use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Platform for any unlawful, harmful, or fraudulent purpose;</li>
          <li>Harass, bully, discriminate against, or endanger any other user, especially children;</li>
          <li>Upload malicious code, or attempt to gain unauthorised access to systems or data;</li>
          <li>Impersonate any person or misrepresent your affiliation, qualifications, or identity;</li>
          <li>Copy, scrape, resell, or redistribute Platform content without permission;</li>
          <li>Post content that is illegal, obscene, defamatory, or infringes others&rsquo; rights.</li>
        </ul>
        <p>
          We may suspend or remove content or accounts that breach these rules to protect our
          community.
        </p>
      </>
    ),
  },
  {
    heading: '6. Teachers, Sponsors & Content',
    body: (
      <>
        <p>
          Teachers are responsible for the accuracy, legality, and quality of the courses, lessons,
          and materials they publish, and for any qualifications they claim. Sponsors are
          responsible for the commitments they make when funding students, teachers, or campaigns.
        </p>
        <p>
          You retain ownership of content you create and upload, but grant SkillHub a non-exclusive,
          worldwide licence to host, display, and deliver that content to the intended audience for
          the purpose of operating the Platform.
        </p>
      </>
    ),
  },
  {
    heading: '7. Payments, Fees & Sponsorships',
    body: (
      <>
        <p>
          Certain courses, sessions, or services may be paid. Fees, currencies, and any applicable
          taxes are shown before you complete a purchase. Sponsorship funds are intended to support
          the students, teachers, or programmes for which they are given.
        </p>
        <p>
          Refunds, where offered, follow the policy shown at the point of purchase. We are not
          responsible for fees charged by third-party payment providers.
        </p>
      </>
    ),
  },
  {
    heading: '8. Intellectual Property',
    body: (
      <p>
        The Platform, including its name, logo, design, and software, is owned by SkillHub and
        protected by intellectual-property laws. Except for content you own, nothing in these Terms
        grants you any right to use our intellectual property without prior written permission.
      </p>
    ),
  },
  {
    heading: '9. Disclaimers & Limitation of Liability',
    body: (
      <>
        <p>
          The Platform is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; While we work
          hard to keep it accessible, accurate, and reliable, we do not guarantee that it will be
          uninterrupted or error-free, and educational outcomes depend on many factors outside our
          control.
        </p>
        <p>
          To the fullest extent permitted by law, SkillHub is not liable for indirect, incidental,
          or consequential damages arising from your use of the Platform.
        </p>
      </>
    ),
  },
  {
    heading: '10. Suspension & Termination',
    body: (
      <p>
        You may stop using the Platform and delete your account at any time. We may suspend or
        terminate access if you breach these Terms or where necessary to protect users or comply
        with the law. On termination, your right to use the Platform ends, though certain provisions
        (such as intellectual property and liability) survive.
      </p>
    ),
  },
  {
    heading: '11. Changes to These Terms',
    body: (
      <p>
        We may update these Terms from time to time. When we make material changes, we will update
        the &ldquo;Last updated&rdquo; date and, where appropriate, notify you. Continued use of the
        Platform after changes take effect means you accept the revised Terms.
      </p>
    ),
  },
  {
    heading: '12. Contact Us',
    body: (
      <p>
        If you have questions about these Terms, your data, or your account, please contact the
        SkillHub team through the support options in your dashboard or at the contact details
        provided on our website.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <header className="bg-cream-100/90 backdrop-blur-md border-b border-espresso/8 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="SkillHub home">
            <Logo size="md" priority />
          </Link>
          <Link href="/auth" className="text-sm font-semibold text-espresso/75 hover:text-terracotta">
            Back to sign up →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <div className="mb-10">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Legal</span>
          <h1 className="font-display text-4xl font-bold text-espresso mt-2">Terms &amp; Conditions</h1>
          <p className="text-espresso/60 mt-2 text-sm">Last updated: {LAST_UPDATED}</p>
          <p className="text-espresso/75 mt-4">
            Please read these Terms carefully before using SkillHub. They explain your rights and
            responsibilities, and how we protect our community of learners, teachers, and sponsors.
          </p>
        </div>

        <div className="space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="font-display text-xl font-bold text-espresso mb-2">{s.heading}</h2>
              <div className="space-y-3 text-espresso/80 leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_li]:text-espresso/80">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 p-5 rounded-2xl bg-cream-50 border-2 border-espresso/10 text-sm text-espresso/70">
          By ticking &ldquo;I accept the Terms &amp; Conditions&rdquo; during sign up, you confirm
          that you agree to everything on this page.
          <div className="mt-4">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-2xl bg-terracotta hover:bg-terracotta-500 text-cream font-bold px-5 py-2.5 transition-colors"
            >
              Return to sign up
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
