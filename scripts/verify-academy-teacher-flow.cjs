const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const courses = read('academy/academy-courses.js');
const app = read('academy/academy.js');
const markup = read('academy/index.html');
const styles = read('academy/academy.css');

assert.match(courses, /function isAssessmentLesson\(title\)/);
assert.match(app, /id="academy-assessments"/);
assert.match(app, /renderAssessmentItem/);
assert.match(app, /start-settings-lesson-only/);
assert.match(app, /const lessonsCatalogCard = document\.getElementById\('lessons-catalog-card'\)/);
assert.match(app, /lessonsCatalogCard\.hidden = true/);
assert.match(app, /lessonsCatalogCard\.hidden = false/);
assert.match(markup, /id="start-settings-lesson-only"/);
assert.match(markup, /id="lessons-catalog-card"/);
assert.match(markup, /id="start-preset-row"/);
assert.doesNotMatch(markup, /id="start-preset-row"\s+hidden/);
assert.match(styles, /#start-settings-lesson-only\[hidden\]\s*\{\s*display:\s*none;/);
assert.match(app, /Начать зачёт/);
assert.match(app, /syncStartModeUi/);
assert.match(app, /data-start-zahet-template/);
assert.match(app, /ensureZahet3Lesson/);
assert.match(markup, /value="open"/);
assert.match(app, /Открытый урок|mode === 'open'|preset === 'open'/);
assert.match(app, /Открыть урок/);

console.log('academy teacher flow checks passed');
