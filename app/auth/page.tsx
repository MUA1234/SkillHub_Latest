'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  EyeOff,
  Loader2,
  GraduationCap,
  BookOpen,
  Building2,
  Mail,
  Lock,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiClient, setCurrentUser } from '@/lib/api';
import { Illustration } from '@/components/ui/illustration';
import { Logo } from '@/components/ui/logo';
import { TagPill } from '@/components/ui/tag-pill';
import { DoodleStar, DoodleSparkle, DoodleSquiggle, DoodleHeart } from '@/components/ui/doodle';
import { DisabilityAssessmentForm } from '@/components/DisabilityAssessmentForm';
import { AssessmentResult } from '@/lib/disability-assessment';
import { useAdaptiveAccessibility } from '@/contexts/AdaptiveAccessibilityContext';

type UserRole = 'student' | 'teacher' | 'sponsor';
type Step = 'login' | 'chooseRole' | 'register' | 'assessment';

interface SponsorFields {
  company_name: string;
  industry: string;
  website: string;
  contact_person: string;
  contact_phone: string;
}

export default function AuthPage() {
  const [step, setStep] = useState<Step>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);
  const router = useRouter();
  const { initializeFromAssessment } = useAdaptiveAccessibility();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    isDifferentlyAbled: null as boolean | null,
  });

  const [sponsorFields, setSponsorFields] = useState<SponsorFields>({
    company_name: '',
    industry: '',
    website: '',
    contact_person: '',
    contact_phone: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSponsorFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSponsorFields({
      ...sponsorFields,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (step === 'login') {
        const response = await apiClient.login({
          email: formData.email,
          password: formData.password,
        });
        setCurrentUser(response.user);
        const userRole = response.user.role;
        router.push(`/${userRole}s/dashboard`);
      } else if (step === 'register' && selectedRole) {
        const user = await apiClient.register({
          email: formData.email,
          password: formData.password,
          role: selectedRole,
          first_name:
            selectedRole === 'sponsor'
              ? sponsorFields.contact_person || sponsorFields.company_name
              : formData.first_name,
          last_name: selectedRole === 'sponsor' ? '' : formData.last_name,
        });

        if (selectedRole === 'sponsor') {
          try {
            await apiClient.login({
              email: formData.email,
              password: formData.password,
            });
            await apiClient.setupSponsorProfile({
              company_name: sponsorFields.company_name,
              industry: sponsorFields.industry || undefined,
              website: sponsorFields.website || undefined,
              contact_person: sponsorFields.contact_person || undefined,
              contact_phone: sponsorFields.contact_phone || undefined,
              contact_email: formData.email,
            });
          } catch (setupErr) {
            console.warn('Sponsor profile setup failed; user can finish in dashboard.', setupErr);
          }
          setError('Sponsor account created. Check your email to verify and then sign in.');
          setStep('login');
          setFormData({ ...formData, password: '' });
          setIsLoading(false);
          return;
        }

        if (selectedRole === 'student' && formData.isDifferentlyAbled === true) {
          setRegisteredUserId(user.id || 'temp-user-id');
          setStep('assessment');
          setIsLoading(false);
          return;
        }

        setError(`Registration successful. We sent a verification email — please confirm before signing in as a ${selectedRole}.`);
        setStep('login');
        setFormData({ ...formData, password: '' });
      }
    } catch (err: any) {
      console.error('API Error:', err);
      let errorMessage = 'An error occurred. Please try again.';

      if (err.response && err.response.data) {
        errorMessage = err.response.data.detail || err.response.data.message || JSON.stringify(err.response.data);
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssessmentComplete = (result: AssessmentResult) => {
    if (registeredUserId) {
      initializeFromAssessment(result, registeredUserId);
    }
    router.push('/students/dashboard');
  };

  const handleAssessmentSkip = () => {
    router.push('/students/dashboard');
  };

  const roleIcons: Record<UserRole, JSX.Element> = {
    student: <GraduationCap size={20} />,
    teacher: <BookOpen size={20} />,
    sponsor: <Building2 size={20} />,
  };

  const roleDescriptions: Record<UserRole, string> = {
    student: 'Access courses and learning materials',
    teacher: 'Create and manage educational content',
    sponsor: 'Fund students, teachers, and campaigns',
  };

  if (step === 'assessment') {
    return (
      <div className="min-h-screen bg-cream-100">
        <DisabilityAssessmentForm
          onComplete={handleAssessmentComplete}
          onSkip={handleAssessmentSkip}
        />
      </div>
    );
  }

  const heroCopy = {
    login:      { eyebrow: 'Welcome back',   title: 'Hello again,', accent: 'friend', body: 'Pick up right where you left off.' },
    chooseRole: { eyebrow: 'Join SkillHub',  title: 'Who are you',   accent: 'today?', body: 'Pick a role so we can tailor the experience.' },
    register:   { eyebrow: 'Get started',    title: 'Spark something', accent: 'new', body: 'Three minutes and you\'re in the door.' },
  }[step as 'login' | 'chooseRole' | 'register'];

  return (
    <div className="min-h-screen bg-cream-100">
      {}
      <header className="bg-cream-100/90 backdrop-blur-md border-b border-espresso/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="SkillHub home">
            <Logo size="md" priority />
          </Link>
          <Link href="/" className="text-sm font-semibold text-espresso/75 hover:text-terracotta">← Back home</Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-8 items-stretch">
          {}
          <aside className="slab-dark relative overflow-hidden p-8 sm:p-10 hidden lg:flex flex-col justify-between min-h-[640px]">
            <DoodleStar     className="absolute top-8 right-10 w-7 text-mustard animate-float" />
            <DoodleSparkle  className="absolute top-32 left-8 w-10 text-terracotta animate-wiggle" />
            <DoodleSquiggle className="absolute bottom-32 left-6 w-28 text-mustard opacity-70" />
            <DoodleHeart    className="absolute bottom-10 right-12 w-7 text-coral animate-float" />

            <div>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-mustard">
                <DoodleSparkle className="w-4" /> {heroCopy.eyebrow}
              </span>
              <h2 className="font-display text-5xl font-bold text-cream mt-3 leading-[1.05]">
                {heroCopy.title}{' '}
                <span className="handwritten scribble-under text-mustard">{heroCopy.accent}</span>
              </h2>
              <p className="text-cream/75 mt-3 max-w-sm">{heroCopy.body}</p>
            </div>

            <div className="relative flex justify-center">
              <Illustration name={step === 'register' ? 'celebrate-win' : 'welcome-student'} size={280} priority />
            </div>

            <div className="flex flex-wrap gap-2">
              <TagPill tone="mustard">No credit card</TagPill>
              <TagPill tone="outline" className="!text-cream !border-cream/30">Free to start</TagPill>
              <TagPill tone="terracotta">Kids-first design</TagPill>
            </div>
          </aside>

          {}
          <div className="flex justify-center items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-cream-50 rounded-3xl shadow-kid-lg p-6 sm:p-10 w-full max-w-lg border-2 border-espresso"
            >
              <div className="mb-6 lg:hidden text-center">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">{heroCopy.eyebrow}</span>
                <h1 className="font-display text-3xl font-bold text-espresso mt-1">
                  {heroCopy.title}{' '}
                  <span className="handwritten scribble-under text-terracotta">{heroCopy.accent}</span>
                </h1>
              </div>

              <div className="hidden lg:block mb-6">
                <h1 className="font-display text-3xl font-bold text-espresso">
                  {step === 'login' ? 'Sign in' : step === 'chooseRole' ? 'Choose your path' : 'Create your account'}
                </h1>
                <p className="text-espresso/65 text-sm mt-1">
                  {step === 'login'
                    ? 'Welcome back to SkillHub.'
                    : step === 'chooseRole'
                    ? 'Tell us who you are.'
                    : 'A few details and you\'re in.'}
                </p>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`mb-6 p-4 rounded-2xl border-2 ${
                      error.toLowerCase().includes('successful') || error.toLowerCase().includes('created')
                        ? 'bg-forest/10 border-forest text-forest-500'
                        : 'bg-coral/10 border-coral text-coral'
                    }`}
                  >
                    <p className="text-sm font-semibold">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

            {}
            {step === 'login' && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-espresso mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-espresso/45">
                      <Mail size={18} />
                    </div>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-4 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                      required
                      placeholder="your.email@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-espresso mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-espresso/45">
                      <Lock size={18} />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-12 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                      required
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-espresso/45 hover:text-espresso transition-colors"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm text-terracotta hover:text-terracotta-500 font-bold"
                  >
                    Forgot password?
                  </Link>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isLoading}
                  className="btn-kid-primary w-full !rounded-2xl !py-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sticker-sm"
                >
                  {isLoading && <Loader2 className="animate-spin mr-2" size={20} />}
                  {isLoading ? 'Processing...' : 'Sign In'}
                </motion.button>

                <div className="mt-6 text-center">
                  <p className="text-sm text-espresso/70">
                    Don&apos;t have an account?
                    <button
                      type="button"
                      onClick={() => setStep('chooseRole')}
                      className="ml-2 text-terracotta hover:text-terracotta-500 font-bold"
                    >
                      Sign up
                    </button>
                  </p>
                </div>
              </form>
            )}

            {}
            {step === 'chooseRole' && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  {(['student', 'teacher', 'sponsor'] as UserRole[]).map((role) => (
                    <motion.button
                      key={role}
                      type="button"
                      onClick={() => {
                        setSelectedRole(role);
                        setStep('register');
                      }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className={`p-5 rounded-2xl border-2 transition-all duration-200 flex flex-col items-center text-center ${
                        selectedRole === role
                          ? 'bg-terracotta text-cream border-espresso shadow-sticker-sm'
                          : 'bg-cream-100 text-espresso border-espresso/15 hover:border-espresso hover:shadow-sticker-sm hover:-translate-y-0.5'
                      }`}
                    >
                      <span
                        className={`mb-2 p-2.5 rounded-2xl ${
                          selectedRole === role
                            ? 'bg-cream text-terracotta'
                            : 'bg-espresso text-cream'
                        }`}
                      >
                        {roleIcons[role]}
                      </span>
                      <span className="font-display text-base font-bold capitalize">{role}</span>
                      <p className={`text-xs mt-1 ${selectedRole === role ? 'text-cream/80' : 'text-espresso/60'}`}>{roleDescriptions[role]}</p>
                    </motion.button>
                  ))}
                </div>
                <button
                  onClick={() => setStep('login')}
                  className="text-sm text-terracotta hover:text-terracotta-500 font-bold w-full text-center"
                >
                  Back to Login
                </button>
              </div>
            )}

            {}
            {step === 'register' && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {selectedRole !== 'sponsor' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-espresso mb-2">
                        First Name
                      </label>
                      <input
                        type="text"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                        required
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-espresso mb-2">
                        Last Name
                      </label>
                      <input
                        type="text"
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                        required
                        placeholder="Last name"
                      />
                    </div>
                  </div>
                )}

                {selectedRole === 'sponsor' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-espresso mb-2">
                        Company / Organization name
                      </label>
                      <input
                        type="text"
                        name="company_name"
                        value={sponsorFields.company_name}
                        onChange={handleSponsorFieldChange}
                        className="w-full px-4 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                        required
                        placeholder="e.g. Hatton National Bank"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-espresso mb-2">
                          Industry
                        </label>
                        <input
                          type="text"
                          name="industry"
                          value={sponsorFields.industry}
                          onChange={handleSponsorFieldChange}
                          className="w-full px-4 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                          placeholder="Banking, Tech, NGO…"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-espresso mb-2">
                          Website
                        </label>
                        <input
                          type="url"
                          name="website"
                          value={sponsorFields.website}
                          onChange={handleSponsorFieldChange}
                          className="w-full px-4 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                          placeholder="https://example.lk"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-espresso mb-2">
                          Contact person
                        </label>
                        <input
                          type="text"
                          name="contact_person"
                          value={sponsorFields.contact_person}
                          onChange={handleSponsorFieldChange}
                          className="w-full px-4 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                          placeholder="Full name"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-espresso mb-2">
                          Contact phone
                        </label>
                        <input
                          type="tel"
                          name="contact_phone"
                          value={sponsorFields.contact_phone}
                          onChange={handleSponsorFieldChange}
                          className="w-full px-4 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                          placeholder="+94 ..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-espresso mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                    required
                    placeholder="your.email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-espresso mb-2">
                    Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    minLength={6}
                    className="w-full px-4 py-2.5 bg-cream-50 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                    required
                    placeholder="••••••••"
                  />
                </div>

                {selectedRole === 'student' && (
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="mt-4 p-5 bg-forest/10 rounded-2xl border-2 border-forest/30"
                    >
                      <label className="block text-sm font-semibold text-espresso mb-2">
                        Are you a differently abled student?
                      </label>
                      <p className="text-xs text-espresso/65 mb-4">
                        This helps us personalize your learning experience. If yes, we&apos;ll ask a
                        few questions to automatically adapt the platform for you.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { value: true, label: 'Yes', sublabel: 'I have learning or accessibility needs' },
                          { value: false, label: 'No', sublabel: 'Standard experience is fine' },
                        ].map((option) => (
                          <motion.button
                            key={String(option.value)}
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                isDifferentlyAbled: option.value,
                              })
                            }
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            className={`p-4 rounded-2xl border-2 transition-all duration-200 flex flex-col items-center text-center ${
                              formData.isDifferentlyAbled === option.value
                                ? 'bg-forest text-cream border-espresso shadow-sticker-sm'
                                : 'bg-cream-50 text-espresso border-espresso/15 hover:border-espresso hover:-translate-y-0.5'
                            }`}
                          >
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs mt-1 opacity-75">{option.sublabel}</span>
                          </motion.button>
                        ))}
                      </div>

                      {formData.isDifferentlyAbled === true && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-4 text-sm text-espresso bg-mustard/30 p-3 rounded-xl border border-mustard/50"
                        >
                          After registration, we&apos;ll guide you through a brief assessment to
                          understand your needs. A parent or guardian can help if needed.
                        </motion.p>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={
                    isLoading ||
                    (selectedRole === 'student' && formData.isDifferentlyAbled === null) ||
                    (selectedRole === 'sponsor' && !sponsorFields.company_name)
                  }
                  className="btn-kid-primary w-full !rounded-2xl !py-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sticker-sm"
                >
                  {isLoading && <Loader2 className="animate-spin mr-2" size={20} />}
                  {isLoading
                    ? 'Processing...'
                    : selectedRole === 'student' && formData.isDifferentlyAbled === true
                    ? 'Continue to Assessment'
                    : 'Create Account'}
                </motion.button>

                <button
                  type="button"
                  onClick={() => setStep('chooseRole')}
                  className="w-full text-sm text-terracotta hover:text-terracotta-500 font-bold mt-3 text-center"
                >
                  Back to Role Selection
                </button>
              </form>
            )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
