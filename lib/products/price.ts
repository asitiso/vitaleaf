export const isSafeIntegerKrw = (value: unknown, minimum = 0): value is number => (
  typeof value === "number"
  && Number.isSafeInteger(value)
  && value >= minimum
);
