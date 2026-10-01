import { describe, expect, it } from 'vitest'
import { classifyComment, summarizeComments } from '@ai/comment-intelligence'

describe('classifyComment', () => {
  it('detects questions', () => {
    expect(classifyComment('How do you get this item?').category).toBe('question')
  })

  it('detects bug reports', () => {
    expect(classifyComment('the build link does not work anymore').category).toBe('bug')
  })

  it('detects feature requests', () => {
    expect(classifyComment('can you please make a budget version').category).toBe('feature_request')
  })

  it('detects praise', () => {
    expect(classifyComment('thanks, this really helped me').category).toBe('praise')
  })

  it('detects criticism', () => {
    expect(classifyComment('worst build guide, total clickbait').category).toBe('criticism')
  })

  it('explains its reasoning', () => {
    expect(classifyComment('can you make a starter guide?').reasons.length).toBeGreaterThan(0)
  })
})

describe('summarizeComments', () => {
  it('counts categories and finds repeated requests', () => {
    const comments = [
      'can you make a budget version',
      'please make a budget version for league start',
      'make a budget version please',
      'thanks for the video',
      'great build',
    ]
    const summary = summarizeComments(comments)
    expect(summary.total).toBe(5)
    expect(summary.byCategory.praise).toBeGreaterThanOrEqual(2)
    expect(summary.repeatedRequests.length).toBeGreaterThan(0)
    expect(summary.suggestedVideoTitles.length).toBeGreaterThan(0)
  })

  it('returns no repeated requests when comments are unrelated', () => {
    const summary = summarizeComments(['nice', 'first', 'hello from brazil'])
    expect(summary.repeatedRequests).toEqual([])
  })
})
