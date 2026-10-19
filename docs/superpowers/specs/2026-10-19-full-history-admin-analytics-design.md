# Full-history admin analytics design

## Purpose

Make the published admin analytics internally consistent: every value shown for a selected period must be calculated from the full eligible history, not from a browser-limited sample of raw events.

## Current problem

The upper cards call `analytics_dashboard(p_days)`, which counts the full server-side tables. The detail blocks separately call `loadAnalyticsEvents()`, which fetches only the latest 5,000 rows across every event type. As a result, the all-time lesson card can report 4,497 completions while the course breakdown only sees the few lesson events that happen to be in the newest 5,000 rows.

With the `Всё время` range, the current `active` condition is `last_seen_at >= 1970-01-01`, so the interface calls every known installation “Сейчас активны”.

## Chosen approach

Extend the existing `analytics_dashboard(p_days)` RPC to return complete server-side aggregates for:

- installations: active during the selected period, first seen during the period, and all known installations;
- product events: event totals and distinct learners for lesson completions;
- lesson courses: completion count and distinct learners per `props.course_id`;
- lesson funnels: started, finished, inactive after 14 days, and studying, derived from full lesson-completion history within the selected period;
- an explicit `Без курса` group for historical completion events without a valid `course_id`.

The client will render cards, course breakdown, and funnel exclusively from this RPC when it is available. The limited raw-event request remains only as a backwards-compatible fallback when the SQL migration has not been installed; its derived blocks will be visibly labelled as a partial recent sample rather than presented as all-time data.

## Product semantics

| Range | Installation headline | Meaning |
| --- | --- | --- |
| 1 day, 7 days, 30 days, 1 year | `Активны за период` | Distinct installations whose `last_seen_at` falls in the selected rolling period. |
| Всё время | `Всего устройств` | All distinct known installations; it is not a real-time active-user count. |

`Уроки` is always the number of `academy_lesson_completed` events in the selected period. Its secondary value is the number of distinct `installation_id` values with that event. Per-course totals must reconcile to the headline total when `Без курса` is included.

The funnel is a completion-event funnel, not an enrolment funnel: “начали” means at least one unique completed lesson in the period. A learner is “прошёл” only when the number of distinct completed lesson IDs reaches the configured course total. “Бросили” means not passed and no completion in the last 14 days; the rest are “учатся”. `Без курса` is shown in the breakdown but excluded from a course-completion funnel because no course total can be known safely.

## Data flow and compatibility

1. The mobile app continues writing allowlisted anonymous events to `analytics_events`; no event or installation identifiers are exposed to the browser beyond existing admin access.
2. PostgreSQL performs grouped counts and funnel aggregation inside the existing authenticated RPC. This eliminates the 5,000-row browser limit from authoritative displays.
3. The admin client renders the RPC response without downloading the event history. Its existing raw event fetch remains a migration fallback only.
4. The SQL migration remains safe to run repeatedly and is documented in `admin/SUPABASE-SETUP.md` as a required production deployment step.

## Validation and failure behaviour

- Add a focused Node contract test for the client-side rendering helpers and the authoritative/fallback boundary.
- Test a response fixture with more than 5,000 source events represented by full server aggregates; assert that all-time cards and course counts use the aggregate rather than a truncated raw list.
- Test labels for both period-specific and all-time installation views.
- Test that the `Без курса` bucket is retained and that it does not enter the course funnel.
- If the migration is absent, keep the page usable but label course detail as a limited recent sample instead of implying complete analytics.

## Out of scope

- Changing the mobile event schema or inventing a course for historical rows without `course_id`.
- Importing store-download data into product-event analytics.
- Modifying Academy live-lesson analytics, which uses separate event families.
