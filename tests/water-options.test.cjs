const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AMOUNT_OPTIONS,
  INTERVAL_OPTIONS,
  amountLabel,
  withSavedOption,
} = require("../src/waterOptions.ts");
const { formatInterval } = require("../src/time.ts");

const mLabelled = (label) => Number(/\((\d+) ml\)$/.exec(label)?.[1]);

test("a saved amount outside the presets is kept in order", () => {
  const options = withSavedOption(AMOUNT_OPTIONS, 300, amountLabel);

  assert.deepEqual(
    options.map((option) => option.value),
    [100, 250, 300, 400, 500],
  );
  assert.equal(options[2].label, "other (300 ml)");
});

test("a saved interval outside the presets is kept in order", () => {
  const options = withSavedOption(INTERVAL_OPTIONS, 40, formatInterval);

  assert.deepEqual(
    options.map((option) => option.value),
    [15, 30, 40, 45, 60, 90, 120],
  );
  assert.equal(options[2].label, "40 minutes");
});

test("every amount reads like the presets: a name and its millilitres", () => {
  for (const option of withSavedOption(AMOUNT_OPTIONS, 300, amountLabel)) {
    assert.equal(mLabelled(option.label), option.value, option.label);
  }
});

test("a saved value that is already a preset is not duplicated", () => {
  const options = withSavedOption(AMOUNT_OPTIONS, 250, amountLabel);

  assert.deepEqual(options, AMOUNT_OPTIONS);
});

test("no saved value leaves the presets alone", () => {
  assert.deepEqual(
    withSavedOption(AMOUNT_OPTIONS, undefined, amountLabel),
    AMOUNT_OPTIONS,
  );
  assert.deepEqual(
    withSavedOption(AMOUNT_OPTIONS, null, amountLabel),
    AMOUNT_OPTIONS,
  );
});

test("building the options does not change the preset lists", () => {
  const amounts = structuredClone(AMOUNT_OPTIONS);
  const intervals = structuredClone(INTERVAL_OPTIONS);

  withSavedOption(AMOUNT_OPTIONS, 300, amountLabel);
  withSavedOption(INTERVAL_OPTIONS, 40, formatInterval);

  assert.deepEqual(AMOUNT_OPTIONS, amounts);
  assert.deepEqual(INTERVAL_OPTIONS, intervals);
});
