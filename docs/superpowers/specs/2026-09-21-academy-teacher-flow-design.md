# Academy Teacher Flow Design

## Goal

Make the teacher's Academy start screen clear: the Medrese pages 68–71 assessment is immediately visible, and each action has one unambiguous purpose.

## Lesson catalogue

Assessment lessons are classified separately from the generic “Другие уроки” course. The main “Уроки” tab renders a fixed “Зачёты” section first when assessments exist, followed by the normal course catalogue. The assessment card shows its full title and has one action: “Настроить и начать”.

## Start flow

Opening a lesson shows one launch panel. The title and selected mode are derived from the lesson: assessments open in exam mode, normal lessons in lesson mode. The mode selector is not shown because it creates a second, conflicting launch choice. The single primary button is “Начать зачёт” or “Начать урок”. Advanced lesson-only switches are hidden for assessments because exam mode enforces them; the cancel action remains available.

## Scope guard

The change does not remove editing, report, homework, active-session, or refresh actions. It only removes duplicate launch choices and hides settings that have no effect for the selected mode.

## Verification

A small Node static test asserts that assessment classification, the pinned assessment section, and mode-specific launch controls remain present in the source. Browser syntax checking verifies the modified JavaScript parses.
