'use client';


import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser, isAuthenticated } from '@/lib/api';
import { homeForUser } from '@/lib/accessibility-tracks';
import { Hero } from '@/components/ui/hero';
import { KidCard, KidFeatureCard } from '@/components/ui/kid-card';
import { StatPill } from '@/components/ui/stat-pill';
import { TagPill } from '@/components/ui/tag-pill';
import { Illustration } from '@/components/ui/illustration';
import { Logo } from '@/components/ui/logo';
import {
  DoodleStar, DoodleSparkle, DoodleSquiggle, DoodleArrow,
  DoodleDots, DoodleHeart, DoodleZigzag,
} from '@/components/ui/doodle';
import {
  ArrowRight, Check, Heart, Sparkles, GraduationCap,
  Users, Trophy, BookOpen, Globe2, Play, ShieldCheck,
} from 'lucide-react';


export default function RootPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      try {
        const u = getCurrentUser() as any;
        router.replace(homeForUser(u));
        return;
      } catch {
        router.replace('/auth');
        return;
      }
    }
    setCheckedAuth(true);
  }, [router]);

  if (!checkedAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100">
        <div className="flex items-center gap-3 text-espresso/60">
          <div className="w-2 h-2 bg-terracotta rounded-full animate-pulse" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100 text-ink">
      {}
      <header className="sticky top-0 z-40 bg-cream-100/90 backdrop-blur-md border-b border-espresso/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="SkillHub home">
            <Logo size="md" priority />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-espresso/75">
            <a href="#programs" className="hover:text-terracotta">Programs</a>
            <a href="#how-it-works" className="hover:text-terracotta">How it works</a>
            <a href="#pricing" className="hover:text-terracotta">Pricing</a>
            <a href="#instructors" className="hover:text-terracotta">Instructors</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/auth" className="hidden sm:inline-flex items-center text-sm font-semibold text-espresso/80 hover:text-espresso">Sign in</Link>
            <Link href="/auth?mode=register" className="btn-kid-primary !py-2 !px-4 text-sm">Get started <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">

        {}
        <Hero
          eyebrow={<><DoodleSparkle className="w-4" /> Edukids · Learning, made joyful</>}
          title={
            <>
              Putting your{' '}
              <span className="handwritten scribble-under text-mustard">child's Future</span>
              <br />in great motion
            </>
          }
          body="Bright lessons, kind teachers, and a community that cheers your kid on. Learn live, explore at your own pace, and grow skills that stick."
          tags={
            <>
              <TagPill tone="mustard" icon={<Check className="w-3 h-3" />}>No credit card</TagPill>
              <TagPill tone="terracotta" icon={<Sparkles className="w-3 h-3" />}>Easy to sign up</TagPill>
              <TagPill tone="outline" className="!text-cream !border-cream/30">Free trial</TagPill>
            </>
          }
          primaryCta={
            <Link href="/auth?mode=register" className="btn-kid-primary">
              Get started <ArrowRight className="w-4 h-4" />
            </Link>
          }
          secondaryCta={
            <Link href="#how-it-works" className="btn-kid-ghost !text-cream !border-cream/30 hover:!bg-cream/10">
              <Play className="w-4 h-4" /> Watch tour
            </Link>
          }
          media={
            <div className="relative">
              <Illustration name="creative-kids" size={360} priority className="drop-shadow-2xl" />
              <DoodleArrow className="absolute -left-12 top-4 w-20 text-mustard rotate-12 animate-wiggle" />
              <span className="absolute -top-2 -right-2 handwritten text-mustard text-3xl rotate-6">spark!</span>
              <DoodleStar className="absolute bottom-6 -right-4 w-8 text-coral animate-float" />
            </div>
          }
        />

        {}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatPill onDark={false} tone="terracotta" badge="A" value="50+"  label="Subjects covered" />
          <StatPill onDark={false} tone="mustard"    badge="B" value="12k+" label="Happy learners" />
          <StatPill onDark={false} tone="forest"     badge="C" value="70+"  label="Expert teachers" />
        </section>

        {}
        <section id="programs" className="space-y-6">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div className="max-w-2xl">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Programs</span>
              <h2 className="font-display text-4xl md:text-5xl font-bold text-espresso mt-1 leading-tight">
                Smart and <span className="handwritten scribble-under text-terracotta">clever kids</span><br />
                ready to fly high!
              </h2>
            </div>
            <Link href="/auth?mode=register" className="btn-kid-cream !py-2 !px-4 text-sm">Enroll now <ArrowRight className="w-4 h-4" /></Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <KidFeatureCard
              tone="mustard" tilt="left"
              title="Life skills for kids"
              body="Real-world skills — money, time, focus, friendship — that classrooms forget."
              illustration={<Illustration name="reading" size={100} />}
              cta={<TagPill tone="espresso">Browse →</TagPill>}
            />
            <KidFeatureCard
              tone="cream" tilt="right"
              title="Imagination is power"
              body="Story-driven art, music, and creative writing that lights up curious minds."
              illustration={<Illustration name="creative-kids" size={100} />}
              cta={<TagPill tone="terracotta">Browse →</TagPill>}
            />
            <KidFeatureCard
              tone="forest" tilt="left"
              title="Grow your own wings"
              body="Confidence-building courses that turn 'I can't' into 'watch me'."
              illustration={<Illustration name="celebrate-win" size={100} />}
              cta={<TagPill tone="cream">Browse →</TagPill>}
            />
          </div>
        </section>

        {}
        <section id="how-it-works" className="relative">
          <KidCard tone="terracotta" sticker className="overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-10 items-center">
              <div className="space-y-5 relative">
                <DoodleZigzag className="w-20 text-mustard absolute -top-6 -left-4 opacity-70" />
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">How it works</span>
                <h2 className="font-display text-4xl md:text-5xl font-bold leading-tight text-cream">
                  Shaping the <span className="handwritten text-mustard">future</span> of kids
                </h2>
                <p className="text-cream/85 max-w-md">Three simple steps to give your child the kind of learning experience you wish you'd had.</p>
                <ol className="space-y-3 mt-2">
                  {[
                    { n: 1, t: 'Pick a path',  d: 'Choose subjects or let our matchmaker suggest a tailored plan.' },
                    { n: 2, t: 'Meet a mentor', d: 'Live sessions, recorded lessons, or 1:1 — all from kind, vetted teachers.' },
                    { n: 3, t: 'Watch them grow', d: 'Weekly progress reports, badges, and parent insights along the way.' },
                  ].map(step => (
                    <li key={step.n} className="flex items-start gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-mustard text-espresso font-display font-bold shrink-0 border-2 border-espresso">{step.n}</span>
                      <div>
                        <p className="font-display font-bold text-cream">{step.t}</p>
                        <p className="text-sm text-cream/75">{step.d}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="relative grid grid-cols-2 gap-4">
                <KidCard tone="mustard" bordered tilt="left" className="!p-4 flex flex-col items-center text-center">
                  <Illustration name="mentor" size={130} />
                  <p className="font-display font-bold text-espresso text-sm mt-1">Label / identification</p>
                </KidCard>
                <KidCard tone="cream" bordered tilt="right" className="!p-4 flex flex-col items-center text-center mt-8">
                  <Illustration name="reading" size={130} />
                  <p className="font-display font-bold text-espresso text-sm mt-1">Process knowledge</p>
                </KidCard>
                <KidCard tone="cream" bordered tilt="right" className="!p-4 flex flex-col items-center text-center -mt-4">
                  <Illustration name="study-group" size={130} />
                  <p className="font-display font-bold text-espresso text-sm mt-1">Geography test</p>
                </KidCard>
                <KidCard tone="mustard" bordered tilt="left" className="!p-4 flex flex-col items-center text-center mt-4">
                  <Illustration name="exam-prep" size={130} />
                  <p className="font-display font-bold text-espresso text-sm mt-1">Confidence boost</p>
                </KidCard>
                <DoodleDots className="absolute -top-8 -right-2 w-16 text-mustard opacity-60" />
              </div>
            </div>
          </KidCard>
        </section>

        {}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <KidCard tone="cream" sticker className="overflow-hidden">
            <div className="flex items-start gap-5">
              <Illustration name="helping-hand" size={140} />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">For families</span>
                <h3 className="font-display text-2xl font-bold text-espresso mt-1 leading-tight">
                  Confidence that builds a <span className="handwritten text-terracotta">brighter future</span>
                </h3>
                <p className="text-espresso/70 text-sm mt-2">Tools, tutors, and a tight feedback loop so parents stay in the loop without hovering.</p>
                <Link href="/auth?mode=register" className="btn-kid-primary mt-4 inline-flex !py-2 !px-4 text-sm">Start free</Link>
              </div>
            </div>
          </KidCard>

          <KidCard tone="forest" sticker className="overflow-hidden">
            <div className="flex items-start gap-5">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">For sponsors</span>
                <h3 className="font-display text-2xl font-bold text-cream mt-1 leading-tight">
                  Helping kids to <span className="handwritten text-mustard">reach their dreams</span>
                </h3>
                <p className="text-cream/80 text-sm mt-2">Fund a learner directly. Track real outcomes — hours studied, courses finished, lives changed.</p>
                <Link href="/auth?mode=register&role=sponsor" className="btn-kid-cream mt-4 inline-flex !py-2 !px-4 text-sm">Become a sponsor</Link>
              </div>
              <Illustration name="welcome-sponsor" size={140} />
            </div>
          </KidCard>
        </section>

        {}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Why families pick us</span>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-espresso mt-1 leading-tight">
              Empower your kids to think{' '}
              <span className="handwritten scribble-under text-terracotta">smarter</span> and{' '}
              <span className="handwritten scribble-under text-terracotta">sharper</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: Users,        title: 'Real teachers, real care',  body: 'Every teacher is interviewed, background-checked, and rated by other parents.' },
              { icon: ShieldCheck,  title: 'Safety baked in',           body: 'Kid-mode chat, full session recordings, and a guardian portal you actually control.' },
              { icon: Globe2,       title: 'Built for everyone',         body: 'Sinhala, Tamil, English. Captions, sign-language tracks, and full accessibility.' },
            ].map((f, i) => {
              const Icon = f.icon;
              const tones: any[] = ['mustard', 'cream', 'terracotta'];
              const tone = tones[i];
              const onDark = tone === 'terracotta';
              return (
                <KidCard key={f.title} tone={tone} tilt={i % 2 ? 'right' : 'left'}>
                  <div className={`grid h-12 w-12 place-items-center rounded-2xl ${onDark ? 'bg-cream text-terracotta' : 'bg-espresso text-cream'} mb-4`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-xl font-bold leading-tight">{f.title}</h3>
                  <p className={`text-sm mt-2 ${onDark ? 'text-cream/85' : 'text-espresso/70'}`}>{f.body}</p>
                </KidCard>
              );
            })}
          </div>
        </section>

        {}
        <section id="instructors">
          <KidCard tone="espresso" sticker className="overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
              <div className="relative">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">Stories</span>
                <h2 className="font-display text-4xl md:text-5xl font-bold text-cream mt-1 leading-tight">
                  Building children{' '}
                  <span className="handwritten text-mustard">one at a time</span>
                </h2>
                <DoodleSquiggle className="w-32 text-terracotta my-4" />
                <blockquote className="text-cream/85 text-lg italic max-w-xl leading-relaxed">
                  "My daughter went from 'I hate maths' to 'when's my next class?' in six weeks. The teacher actually listens — that's the whole thing."
                </blockquote>
                <div className="mt-5 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-mustard grid place-items-center text-espresso font-display font-bold border-2 border-cream/20">PR</div>
                  <div>
                    <p className="font-display font-bold text-cream">Priya R.</p>
                    <p className="text-xs text-cream/65">Parent of Asha, age 9</p>
                  </div>
                </div>
              </div>
              <div className="relative">
                <Illustration name="study-group" size={300} />
                <DoodleHeart className="absolute -top-2 right-4 w-8 text-coral animate-float" />
                <DoodleStar className="absolute bottom-2 -left-2 w-6 text-mustard animate-wiggle" />
              </div>
            </div>
          </KidCard>
        </section>

        {}
        <section id="pricing" className="space-y-6">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Pricing</span>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-espresso mt-1 leading-tight">
              Simple, <span className="handwritten scribble-under text-terracotta">fair plans</span>
            </h2>
            <p className="text-espresso/65 mt-2 max-w-xl mx-auto">Start free. Pay only when your kid is loving it.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { name: 'Curious',  price: 'Free',       tone: 'cream',      badge: 'Try us', perks: ['Browse the library', 'Join the forum', '1 demo class'] },
              { name: 'Explorer', price: 'Rs 2,990',   tone: 'mustard',    badge: 'Most loved', perks: ['Unlimited lessons', '4 live sessions / month', 'Parent dashboard'], featured: true },
              { name: 'Champion', price: 'Rs 5,990',   tone: 'terracotta', badge: 'Power up', perks: ['Everything in Explorer', 'Weekly 1:1 coaching', 'Priority support'] },
            ].map((p, i) => {
              const onDark = p.tone === 'terracotta';
              return (
                <KidCard
                  key={p.name}
                  tone={p.tone as any}
                  sticker={p.featured}
                  tilt={p.featured ? 'none' : (i === 0 ? 'left' : 'right')}
                  className={p.featured ? 'md:-translate-y-3' : ''}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-2xl font-bold">{p.name}</h3>
                    <TagPill tone={onDark ? 'cream' : 'espresso'}>{p.badge}</TagPill>
                  </div>
                  <p className="font-display text-4xl font-bold mt-3">{p.price}<span className={`text-sm font-normal ${onDark ? 'text-cream/70' : 'text-espresso/55'}`}>{p.price !== 'Free' && ' /mo'}</span></p>
                  <ul className={`mt-4 space-y-2 text-sm ${onDark ? 'text-cream/85' : 'text-espresso/75'}`}>
                    {p.perks.map(perk => (
                      <li key={perk} className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 shrink-0" /> {perk}</li>
                    ))}
                  </ul>
                  <Link
                    href="/auth?mode=register"
                    className={`mt-5 inline-flex w-full ${p.featured || onDark ? 'btn-kid-cream' : 'btn-kid-primary'} !py-2.5 text-sm justify-center`}
                  >
                    {p.featured ? 'Start free trial' : 'Get started'}
                  </Link>
                </KidCard>
              );
            })}
          </div>
        </section>

        {}
        <section className="relative">
          <KidCard tone="mustard" sticker className="text-center overflow-hidden">
            <DoodleStar className="absolute top-6 left-8 w-8 text-terracotta animate-wiggle" />
            <DoodleSparkle className="absolute top-10 right-10 w-10 text-coral animate-float" />
            <DoodleDots className="absolute bottom-4 left-12 w-20 text-espresso/30" />
            <h2 className="font-display text-4xl md:text-5xl font-bold text-espresso leading-tight">
              Ready to <span className="handwritten text-terracotta">spark</span> something amazing?
            </h2>
            <p className="text-espresso/75 mt-3 max-w-xl mx-auto">Join thousands of families giving their kids a kinder, smarter way to learn.</p>
            <div className="flex flex-wrap justify-center gap-3 mt-6">
              <Link href="/auth?mode=register" className="btn-kid-primary">Get started free <ArrowRight className="w-4 h-4" /></Link>
              <Link href="#programs" className="btn-kid-ghost">See programs</Link>
            </div>
          </KidCard>
        </section>
      </main>

      {}
      <footer className="bg-espresso text-cream mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2">
            <div className="flex items-center">
              <Logo size="md" />
            </div>
            <p className="text-cream/65 text-sm mt-3 max-w-sm">A platform connecting students, educators, and sponsors for skill development.</p>
          </div>
          {[
            { title: 'Platform', links: [['How it works', '#how-it-works'], ['Programs', '#programs'], ['Pricing', '#pricing']] },
            { title: 'Community', links: [['Sign in', '/auth'], ['Sign up', '/auth?mode=register'], ['Become a teacher', '/auth?mode=register&role=teacher']] },
          ].map(col => (
            <div key={col.title}>
              <p className="font-display font-bold text-mustard text-sm uppercase tracking-[0.15em]">{col.title}</p>
              <ul className="mt-3 space-y-2 text-sm text-cream/75">
                {col.links.map(([label, href]) => (
                  <li key={label}><a href={href} className="hover:text-mustard">{label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-cream/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between text-xs text-cream/55">
            <span>© {new Date().getFullYear()} SkillHub. Made with <Heart className="inline w-3 h-3 text-coral" /> for curious kids.</span>
            <span className="hidden md:inline">v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
