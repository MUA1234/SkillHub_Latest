
export type IllustrationName =
  | 'welcome-student'
  | 'welcome-teacher'
  | 'welcome-sponsor'
  | 'welcome-guardian'
  | 'empty-courses'
  | 'empty-certificates'
  | 'empty-messages'
  | 'empty-forum'
  | 'empty-scholarships'
  | 'empty-events'
  | 'empty-search'
  | 'empty-cart'
  | 'learn-online'
  | 'study-group'
  | 'reading'
  | 'live-class'
  | 'video-lesson'
  | 'exam-prep'
  | 'progress-chart'
  | 'celebrate-win'
  | 'helping-hand'
  | 'mentor'
  | 'community'
  | 'creative-kids'
  | 'not-found'
  | 'server-error'
  | 'offline'
  | 'success'
  | 'permission-denied';

type Source = { url: string; alt: string };

const P = {
  mentor:     '/photos/mentor.jpg',
  reading:    '/photos/reading.jpg',
  studyGroup: '/photos/study-group.jpg',
  exam:       '/photos/exam.jpg',
  liveClass:  '/photos/live-class.jpg',
  celebrate:  '/photos/celebrate.jpg',
} as const;

export const ILLUSTRATIONS: Record<IllustrationName, Source> = {
  'welcome-student':     { url: P.reading,    alt: 'Student reading a book' },
  'welcome-teacher':     { url: P.mentor,     alt: 'Teacher mentoring a student' },
  'welcome-sponsor':     { url: P.celebrate,  alt: 'Celebrating students supported' },
  'welcome-guardian':    { url: P.studyGroup, alt: 'Family supporting a learner' },

  'empty-courses':       { url: P.reading,    alt: 'No courses yet — open a book to begin' },
  'empty-certificates':  { url: P.celebrate,  alt: 'No certificates yet' },
  'empty-messages':      { url: P.studyGroup, alt: 'No messages yet' },
  'empty-forum':         { url: P.studyGroup, alt: 'Quiet forum' },
  'empty-scholarships':  { url: P.celebrate,  alt: 'No scholarships yet' },
  'empty-events':        { url: P.liveClass,  alt: 'No events scheduled' },
  'empty-search':        { url: P.reading,    alt: 'No matches yet' },
  'empty-cart':          { url: P.celebrate,  alt: 'Cart is empty' },

  'learn-online':        { url: P.liveClass,  alt: 'Learning online' },
  'study-group':         { url: P.studyGroup, alt: 'Students studying together' },
  'reading':             { url: P.reading,    alt: 'Child reading a book' },
  'live-class':          { url: P.liveClass,  alt: 'Live class in session' },
  'video-lesson':        { url: P.liveClass,  alt: 'Video lesson playing' },
  'exam-prep':           { url: P.exam,       alt: 'Student taking an exam' },
  'progress-chart':      { url: P.celebrate,  alt: 'Progress over time' },
  'celebrate-win':       { url: P.celebrate,  alt: 'Celebrating a win' },
  'helping-hand':        { url: P.mentor,     alt: 'A helping hand' },
  'mentor':              { url: P.mentor,     alt: 'Mentor coaching a student' },
  'community':           { url: P.studyGroup, alt: 'Community of learners' },
  'creative-kids':       { url: P.celebrate,  alt: 'Creative kids playing' },

  'not-found':           { url: P.reading,    alt: '404 — page not found' },
  'server-error':        { url: P.exam,       alt: 'Something went wrong' },
  'offline':             { url: P.reading,    alt: 'You are offline' },
  'success':             { url: P.celebrate,  alt: 'Success' },
  'permission-denied':   { url: P.exam,       alt: 'Permission denied' },
};

export const LOTTIE = {
  'cheering-kids':   'https://lottie.host/4f0c4ed8-7e3a-4d5e-9c9b-9a8f9b8f9b8f/celebrate.json',
  'floating-books':  'https://lottie.host/8a8a8a8a-1111-2222-3333-4f0c4ed87e3a/books.json',
} as const;
