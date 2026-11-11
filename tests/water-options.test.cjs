const test = require("node:test");
const assert = require("node:assert/strict");
const { withSavedOption } = require("../src/waterOptions.ts");
const { formatInterval } = require("../src/time.ts");

const AMOUNT_OPTIONS = [
  { value: 100, label: "a few sips (100 ml)" },
  { value: 250, label: "a glass (250 ml)" },
  { value: 400, label: "a big glass (400 ml)" },
  { value: 500, label: "a bottle (500 ml)" },
];

const INTERVAL_OPTIONS = [15, 30, 45, 60, 90, 120].map((minutes) => ({
  value: minutes,
  label: formatInterval(minutes),
}));

test("a saved amount outside the presets is kept in order", () => {
  const options = withSavedOption(AMOUNT_OPTIONS, 300, (value) => `${value} ml`);

  assert.deepEqual(
    options.map((option) => option.value),
    [100, 250, 300, 400, 500],
  );
  assert.equal(options[2].label, "300 ml");
});

test("a saved interval outside the presets is kept in order", () => {
  const options = withSavedOption(INTERVAL_OPTIONS, 40, formatInterval);

  assert.deepEqual(
    options.map((option) => option.value),
    [15, 30, 40, 45, 60, 90, 120],
  );
  assert.equal(options[2].label, "40 minutes");
});

test("a saved value that is already a preset is not duplicated", () => {
  const options = withSavedOption(AMOUNT_OPTIONS, 250, (value) => `${value} ml`);

  assert.deepEqual(options, AMOUNT_OPTIONS);
});

test("no saved value leaves the presets alone", () => {
  assert.deepEqual(
    withSavedOption(AMOUNT_OPTIONS, undefined, (value) => `${value} ml`),
    AMOUNT_OPTIONS,
  );
  assert.deepEqual(
    withSavedOption(AMOUNT_OPTIONS, null, (value) => `${value} ml`),
    AMOUNT_OPTIONS,
  );
});

test("building the options does not change the preset list", () => {
  const before = structuredClone(AMOUNT_OPTIONS);

  withSavedOption(AMOUNT_OPTIONS, 300, (value) => `${value} ml`);

  assert.deepEqual(AMOUNT_OPTIONS, before);
});
