import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineFrames, totalDurationInFrames, totalDurationInFramesWithBrand, isAspect } from './durationUtils.ts';
const clip = (id, start, end, transitionIn = 'crossfade') => ({ id, trimStart: start, trimEnd: end, transitionIn, videoUrl: '/test.mp4' });
test('fractional endpoint rounding agrees with rendered sequence frames', () => {
  const clips = [clip('a', .02, .07, 'cut'), clip('b', .02, .07, 'cut')];
  assert.equal(totalDurationInFrames(clips), 2);
  assert.equal(totalDurationInFramesWithBrand(clips, { template: 'productReveal' }), 167);
});
test('short clips cannot have fades longer than their available frames', () => {
  const frames = timelineFrames([clip('a', 0, .1), clip('b', 0, .1), clip('c', 0, .1)]);
  assert.deepEqual(frames.map(f => f.fadeIn), [0, 1, 1]);
  assert.equal(totalDurationInFrames([clip('a', 0, .1), clip('b', 0, .1), clip('c', 0, .1)]), 7);
  assert.equal(timelineFrames([clip('a', 0, 0), clip('b', 0, .01)])[1].fadeIn, 0);
});
test('standard crossfades and aspect validation remain correct', () => {
  assert.equal(totalDurationInFrames([clip('a', 0, 4), clip('b', 0, 4)]), 225);
  assert.equal(isAspect('16:9'), true);
  assert.equal(isAspect('toString'), false);
  assert.equal(isAspect('__proto__'), false);
});
