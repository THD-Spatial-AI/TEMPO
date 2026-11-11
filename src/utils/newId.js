// Numeric ids for Creation locations/links. Timestamp-based like before, but
// strictly increasing, so ids minted in the same millisecond (or a bulk import
// of N ids followed by a manual add) never collide.
let last = 0;

export const newId = () => {
  last = Math.max(Date.now(), last + 1);
  return last;
};
