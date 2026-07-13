"""
Stub stand-ins for the legacy SQLAlchemy ORM classes the `teachers.py`
endpoint module imports.

Persistence is handled via Supabase REST. The endpoint code still has
many `select(Model).where(...)` calls — those will raise at runtime via
`_NullSession.execute` in `database.database`, which is the same
behavior they had before this stub existed. The point of this module is
purely to let `from database.teacher_models import ...` succeed so the
rest of the router (including the REST-based endpoints) loads.
"""

from .models import _Record


class TeacherProfile(_Record):
    pass


class Subject(_Record):
    pass


class TeacherSubject(_Record):
    pass


class Course(_Record):
    pass


class CourseContent(_Record):
    pass


class LiveSession(_Record):
    pass


class SessionParticipant(_Record):
    pass


class CourseEnrollment(_Record):
    pass


class StudentProgress(_Record):
    pass


class Payment(_Record):
    pass


class Review(_Record):
    pass


class Examination(_Record):
    pass


class DashboardMetric(_Record):
    pass


class Event(_Record):
    pass


class EventRegistration(_Record):
    pass


class SponsorshipRequest(_Record):
    pass
