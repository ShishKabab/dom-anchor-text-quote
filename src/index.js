import DiffMatchPatch from 'diff-match-patch'
import * as textPosition from 'dom-anchor-text-position'

// The DiffMatchPatch bitap has a hard 32-character pattern length limit.
const SLICE_LENGTH = 32
const SLICE_RE = new RegExp('(.|[\r\n]){1,' + String(SLICE_LENGTH) + '}', 'g')
const CONTEXT_LENGTH = SLICE_LENGTH


function fromRange(root, range) {
  if (root === undefined) {
    throw new Error('missing required parameter "root"')
  }
  if (range === undefined) {
    throw new Error('missing required parameter "range"')
  }

  let positionSelector = textPosition.fromRange(root, range)

  return fromTextPosition(root, positionSelector)
}


function fromTextPosition(root, selector) {
  if (root === undefined) {
    throw new Error('missing required parameter "root"')
  }
  if (selector === undefined) {
    throw new Error('missing required parameter "selector"')
  }

  let {start} = selector
  if (start === undefined) {
    throw new Error('selector missing required property "start"')
  }
  if (start < 0) {
    throw new Error('property "start" must be a non-negative integer')
  }

  let {end} = selector
  if (end === undefined) {
    throw new Error('selector missing required property "end"')
  }
  if (end < 0) {
    throw new Error('property "end" must be a non-negative integer')
  }

  let exact = root.textContent.substr(start, end - start)

  let prefixStart = Math.max(0, start - CONTEXT_LENGTH)
  let prefix = root.textContent.substr(prefixStart, start - prefixStart)

  let suffixEnd = Math.min(root.textContent.length, end + CONTEXT_LENGTH)
  let suffix = root.textContent.substr(end, suffixEnd - end)

  return {exact, prefix, suffix}
}


function toRange(root, selector, options = {}) {
  let position = toTextPosition(root, selector, options)
  return textPosition.toRange(root, position)
}


function toTextPosition(root, selector, options = {}) {
  if (root === undefined) {
    throw new Error('missing required parameter "root"')
  }
  if (selector === undefined) {
    throw new Error('missing required parameter "selector"')
  }

  let {exact} = selector
  if (exact === undefined) {
    throw new Error('selector missing required property "exact"')
  }

  let {prefix, suffix} = selector
  let {hint} = options
  let dmp = new DiffMatchPatch()

  dmp.Match_Distance = root.textContent.length * 2

  // Work around a hard limit of the DiffMatchPatch bitap implementation.
  // The search pattern must be no more than SLICE_LENGTH characters.
  let slices = exact.match(SLICE_RE)
  let loc = (hint === undefined) ? ((root.textContent.length / 2) | 0) : hint
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  let result = -1
  let havePrefix = prefix !== undefined
  let haveSuffix = suffix !== undefined
  let foundPrefix = false

  // If the prefix is known then search for that first.
  if (havePrefix) {
    result = dmp.match_main(root.textContent, prefix, loc)
    if (result > -1) {
      loc = result + prefix.length
      foundPrefix = true
    }
  }

  // If we have a suffix, and the prefix wasn't found, then search for it.
  if (haveSuffix && !foundPrefix) {
    result = dmp.match_main(root.textContent, suffix, loc + exact.length)
    if (result > -1) {
      loc = result - exact.length
    }
  }

  // Search for the first slice.
  let firstSlice = slices.shift()
  result = dmp.match_main(root.textContent, firstSlice, loc)
  if (result > -1) {
    start = result
    loc = end = start + firstSlice.length
  } else {
    throw new Error('no match found')
  }

  // Create a fold function that will reduce slices to positional extents.
  let foldSlices = (acc, slice) => {
    let result = dmp.match_main(root.textContent, slice, acc.loc)
    if (result === -1) {
      throw new Error('no match found')
    }

    // The next slice should follow this one closely.
    acc.loc = result + slice.length

    // Expand the start and end to a quote that includes all the slices.
    acc.start = Math.min(acc.start, result)
    acc.end = Math.max(acc.end, result + slice.length)

    return acc
  }

  // Use the fold function to establish the full quote extents.
  // Expect the slices to be close to one another.
  // This distance is deliberately generous for now.
  dmp.Match_Distance = 64
  let acc = slices.reduce(foldSlices, {
    start: start,
    end: end,
    loc: loc,
  })

  return {start: acc.start, end: acc.end}
}


export default class TextQuoteAnchor {
  constructor(root, exact, context = {}) {
    if (root === undefined) {
      throw new Error('missing required parameter "root"')
    }
    if (exact === undefined) {
      throw new Error('missing required parameter "exact"')
    }
    this.root = root
    this.exact = exact
    this.prefix = context.prefix
    this.suffix = context.suffix
  }

  static fromRange(root, range) {
    let selector = fromRange(root, range)
    return new TextQuoteAnchor(root, selector.exact, selector)
  }

  static fromSelector(root, selector = {}) {
    return new TextQuoteAnchor(root, selector.exact, selector)
  }

  static fromPositionAnchor(anchor) {
    let quote = fromTextPosition(anchor.root, anchor)
    return new TextQuoteAnchor(anchor.root, quote.exact, quote)
  }

  toRange(options) {
    return toRange(this.root, this, options)
  }

  toSelector() {
    let selector = {
      type: 'TextQuoteSelector',
      exact: this.exact,
    }
    if (this.prefix !== undefined) selector.prefix = this.prefix
    if (this.suffix !== undefined) selector.suffix = this.suffix
    return selector
  }

  toPositionAnchor(options = {}) {
    return toTextPosition(this.root, this, options)
  }
}
