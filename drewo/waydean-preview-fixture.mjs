export function masterFixtureFocus(viewWidth) {
  return viewWidth <= 700 ? 'demo-magomed' : 'demo-isa';
}

/** Keep the default mobile reference composition aligned with its seven-card Master. */
export function masterFixtureVisibleRecords(records, { viewportWidth, requestedState, requestedPerson } = {}) {
  if (viewportWidth > 700 || requestedState || requestedPerson) return records;
  return records.filter(person => person.id !== 'demo-ali');
}
